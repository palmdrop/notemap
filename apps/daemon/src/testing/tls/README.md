A self-signed certificate for `unfurl.test`, valid until 2126, and its key. Test-only: nothing
outside a test trusts it. Made with:

```sh
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 36500 \
  -subj "/CN=unfurl.test" -addext "subjectAltName=DNS:unfurl.test" \
  -keyout unfurl.test.key -out unfurl.test.crt
```
