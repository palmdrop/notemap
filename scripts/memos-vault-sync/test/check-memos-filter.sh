#!/usr/bin/env bash
# Throwaway probe: does this Memos server honor `filter=updated_ts ...`,
# `orderBy=update_time asc`, and pageSize=1000?
#
# Decides whether incremental sync is safe to build on this server.
#
# Usage:
#   MEMOS_URL=http://localhost:5230 MEMOS_TOKEN=xxx ./check-memos-filter.sh
#   # or, if the env file already exists:
#   set -a; . /etc/memos-vault-sync.env; set +a; ./check-memos-filter.sh

set -u

: "${MEMOS_URL:?set MEMOS_URL}"
if [ -z "${MEMOS_TOKEN:-}" ] && [ -n "${MEMOS_TOKEN_FILE:-}" ]; then
    MEMOS_TOKEN=$(tr -d '[:space:]' < "$MEMOS_TOKEN_FILE")
fi
: "${MEMOS_TOKEN:?set MEMOS_TOKEN or MEMOS_TOKEN_FILE}"

API="${MEMOS_URL%/}/api/v1"
FUTURE="2030-01-01T00:00:00Z"
RECENT=$(date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%SZ)

FAILED=0
STATUS=""
BODY=""

pass() { printf '  \033[32mPASS\033[0m %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAILED=1; }
warn() { printf '  \033[33mWARN\033[0m %s\n' "$1"; }

# get <path> [curl --data-urlencode args...]  -> sets $BODY and $STATUS.
# Deliberately NOT used via command substitution: that would run in a subshell
# and the status assignment would be lost.
get() {
    local path="$1"; shift
    local out
    out=$(curl -sS --get "$API/$path" \
        -H "Authorization: Bearer $MEMOS_TOKEN" \
        -w $'\n%{http_code}' "$@" 2>&1)
    STATUS="${out##*$'\n'}"
    BODY="${out%$'\n'*}"
}

# memo count of $BODY, or "err"
count() {
    printf '%s' "$BODY" | python3 -c '
import json,sys
try: print(len(json.load(sys.stdin).get("memos", [])))
except Exception: print("err")'
}

snippet() { printf '%s' "$BODY" | tr '\n' ' ' | head -c 300; }

echo
echo "== server =="
get workspace/profile
if [ "$STATUS" = 200 ]; then
    version=$(printf '%s' "$BODY" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("version","?"))' 2>/dev/null)
    pass "reachable, version: ${version:-?}"
else
    fail "GET /workspace/profile -> HTTP $STATUS: $(snippet)"
    exit 1
fi

echo
echo "== baseline (unfiltered) =="
get memos --data-urlencode 'pageSize=5'
total=$(count)
if [ "$STATUS" = 200 ] && [ "$total" != err ]; then
    pass "token works, returned $total memos"
    [ "$total" = 0 ] && warn "no memos on server — later checks will be inconclusive"
else
    fail "GET /memos -> HTTP $STATUS: $(snippet)"
    exit 1
fi

echo
echo "== filter honored? (the critical one) =="
# A far-future watermark must return zero memos. Anything else means the filter
# was silently ignored — incremental sync built on an ignored filter looks fine
# today and silently stops delivering the day the syntax changes.
get memos --data-urlencode "filter=updated_ts >= timestamp(\"$FUTURE\")" --data-urlencode 'pageSize=5'
n=$(count)
if [ "$STATUS" != 200 ]; then
    fail "filter rejected -> HTTP $STATUS: $(snippet)"
elif [ "$n" = 0 ]; then
    pass "future watermark returned 0 memos — filter is applied"
else
    fail "future watermark returned $n memos — filter is being IGNORED (do not build incremental sync on it)"
fi

echo
echo "== filter selective? =="
get memos --data-urlencode "filter=updated_ts >= timestamp(\"$RECENT\")" --data-urlencode 'pageSize=1000'
recent=$(count); recent_status=$STATUS
get memos --data-urlencode 'pageSize=1000'
all=$(count)
if [ "$recent_status" = 200 ] && [ "$STATUS" = 200 ] && [ "$recent" != err ] && [ "$all" != err ]; then
    pass "updated in last 30d: $recent / $all total (first page, pageSize=1000)"
    if [ "$recent" = "$all" ] && [ "$all" != 0 ]; then
        warn "identical counts — fine if every memo is recent, suspicious otherwise"
    fi
else
    fail "selective check failed -> HTTP $recent_status / $STATUS"
fi

echo
echo "== orderBy=update_time asc =="
get memos --data-urlencode 'orderBy=update_time asc' --data-urlencode 'pageSize=10'
if [ "$STATUS" != 200 ]; then
    fail "orderBy rejected -> HTTP $STATUS: $(snippet)"
else
    order_out=$(printf '%s' "$BODY" | python3 -c '
import json,sys
times = [m.get("updateTime","") for m in json.load(sys.stdin).get("memos", [])]
if len(times) < 2:
    print("too few memos to verify ordering"); sys.exit(2)
print("first %s ... last %s" % (times[0], times[-1]))
sys.exit(0 if times == sorted(times) else 1)')
    case $? in
        0) pass "ascending order honored ($order_out)" ;;
        2) warn "$order_out" ;;
        *) fail "results are NOT ascending by updateTime ($order_out)" ;;
    esac
fi

echo
echo "== pageSize=1000 accepted =="
get memos --data-urlencode 'pageSize=1000'
if [ "$STATUS" = 200 ]; then pass "accepted"; else fail "HTTP $STATUS: $(snippet)"; fi

echo
if [ "$FAILED" = 0 ]; then
    echo "ALL CHECKS PASSED — incremental sync is safe to build on this server."
else
    echo "SOME CHECKS FAILED — see above; full-scan sync stays the safer choice."
fi
exit "$FAILED"
