import { tick, untrack } from "svelte";

import { askForTemplate, type Step as Question } from "$lib/asked";
import { width } from "$lib/breakpoint";
import { takenAs } from "$lib/candidate-list";
import { nameOf } from "$lib/destinations";
import { OWN_ARGUMENTS } from "$lib/arguments";
import { valuesFrom } from "$lib/schema-form";
import { actionOf, labelFor, wordFor, type Fact } from "$lib/vocabulary";

import { LINE_FIELD, type Decision } from "./decision.svelte";

/**
 * On a phone the steps come one at a time: where, then a template's
 * questions, or how and the place where a template does not fix them, then
 * the check. When wide every step is on the one surface.
 */
export type StepName = "where" | "how" | "place" | "check" | `ask:${string}`;

const PICK_FIRST = "Pick a destination, and where in it, to route.";
/** What a step that needs a destination says before there is one. */
export const NOTHING_PICKED = "Pick a template or a destination first.";

const STEP_WORDS: Record<string, string> = {
  where: "where",
  how: "how",
  place: "place",
  check: "check",
};

/** Which step a decision stands at, what each asks, and the check that reads it back. */
export class Steps {
  readonly #decision: Decision;

  at = $state(0);

  /**
   * What the template asks, as questions with their answers: a closed list,
   * what the destination holds, or a typed answer.
   */
  questions = $state<readonly Question[]>([]);
  answers = $state<Record<string, readonly string[] | undefined>>({});
  typedAnswer = $state<Record<string, string>>({});

  constructor(decision: Decision) {
    this.#decision = decision;

    $effect(() => {
      if (this.at > this.names.length - 1) this.at = this.names.length - 1;
    });

    // A destination or a template picked is the where answered: on to the next.
    let pickedBefore: string | undefined;
    $effect(() => {
      const now = decision.chosen ?? decision.applied?.id;
      if (now !== undefined && now !== pickedBefore && this.step === "where") {
        this.at = Math.min(1, this.names.length - 1);
      }
      pickedBefore = now;
    });

    $effect(() => {
      const template = decision.applied;
      this.questions = [];
      this.answers = {};
      if (template === undefined) return;
      void askForTemplate(template).then((asking) => {
        if (decision.applied?.id === template.id) {
          this.questions = asking?.steps ?? [];
        }
      });
    });

    $effect(() => {
      for (const question of this.questions) {
        if (question.field in this.answers) continue;
        if (question.closed !== undefined) {
          this.#answered(question.field, question.closed);
        } else if (question.listed === undefined) {
          this.#answered(question.field, []);
        } else {
          this.#answered(question.field, undefined);
          const field = question.field;
          void question
            .listed(untrack(() => $state.snapshot(decision.args)))
            .then((entries) => {
              this.#answered(
                field,
                entries.map((entry) => takenAs(entry)),
              );
            })
            .catch(() => {
              this.#answered(field, []);
            });
        }
      }
    });
  }

  #answered(field: string, values: readonly string[] | undefined): void {
    this.answers = { ...this.answers, [field]: values };
  }

  readonly onPhone = $derived(!width.wide);

  readonly names = $derived.by((): readonly StepName[] => {
    const decision = this.#decision;
    if (decision.templated) {
      return [
        "where",
        ...decision.askedFields.map((one): StepName => `ask:${one.name}`),
        "check",
      ];
    }
    if (decision.chosen === undefined) {
      return ["where", "how", "place", "check"];
    }
    return [
      "where",
      ...(decision.hasHow ? (["how"] as const) : []),
      "place",
      "check",
    ];
  });

  readonly step = $derived(
    this.names[Math.min(this.at, this.names.length - 1)],
  );

  readonly word = $derived(
    this.step === undefined ? "" : (STEP_WORDS[this.step] ?? "question"),
  );

  shows(name: StepName): boolean {
    return !this.onPhone || this.step === name;
  }

  forward(): void {
    this.at = Math.min(this.names.length - 1, this.at + 1);
  }

  backward(): void {
    this.at = Math.max(0, this.at - 1);
  }

  /** Goes to a step: on a phone it takes the screen, when wide it is scrolled to. */
  async goTo(name: StepName): Promise<void> {
    await tick();
    const at = this.names.indexOf(name);
    if (this.onPhone) {
      if (at !== -1) this.at = at;
      return;
    }
    document
      .getElementById(`step-${name}`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  /** A place a template fixed, changed for this one route, which then goes by hand. */
  async unpin(): Promise<void> {
    this.#decision.placing = true;
    this.#decision.opened.place = true;
    await this.goTo("place");
  }

  /** An answer taken: on a phone it moves on, when wide it is picked and stays. */
  answer(field: string, value: string): void {
    this.#decision.give(field, value);
    if (this.onPhone) this.forward();
  }

  /** Why Route cannot be pressed yet, said over the bar. */
  readonly whyNot = $derived.by(() => {
    const { askedFields, args, asking } = this.#decision;
    const unanswered = askedFields.find(
      (one) => (args[one.name] ?? "").trim() === "",
    );
    if (unanswered !== undefined) {
      const label = asking[unanswered.name]?.label ?? labelFor(unanswered);
      return `Answer “${label}” to route.`;
    }
    return PICK_FIRST;
  });

  /**
   * The check: every fact of the decision, each opening the step that set it.
   * A place the template fixed says so and is changed for this route alone.
   */
  readonly facts = $derived.by((): Fact[] => {
    const decision = this.#decision;
    const { chosen, applied, capability, templated, lined } = decision;
    if (chosen === undefined) return [];
    const values = valuesFrom(decision.fields, decision.args);
    const facts: Fact[] = [
      {
        label: "destination",
        value: nameOf(chosen),
        open: () => void this.goTo("where"),
      },
    ];
    if (templated && applied !== undefined) {
      facts.push({
        label: "template",
        value: applied.name,
        open: () => void this.goTo("where"),
      });
    }
    if (capability !== undefined) {
      facts.push({
        label: "action",
        value: actionOf(capability, decision.forecast),
        ...(decision.hasHow ? { open: () => void this.goTo("how") } : {}),
      });
    }
    for (const field of decision.fields) {
      const theLine = field.name === LINE_FIELD && lined;
      const held = theLine ? (values[field.name] ?? "") : values[field.name];
      if (held === undefined || held === null) continue;
      if (held === "" && !theLine) continue;
      const raw = typeof held === "string" ? held : JSON.stringify(held);
      const value = theLine ? decision.placeFor(raw) : wordFor(field.name, raw);
      const label = labelFor(field);
      if (templated && applied !== undefined) {
        if (field.name in decision.asking) {
          facts.push({
            label,
            value,
            open: () => void this.goTo(`ask:${field.name}`),
          });
        } else if (
          decision.isHow(field) ||
          OWN_ARGUMENTS.includes(field.name)
        ) {
          facts.push({ label, value });
        } else {
          facts.push({
            label,
            value,
            line: `set by ${applied.name}; change it for this route`,
            open: () => void this.unpin(),
            opens: `Change ${label} for this route`,
          });
        }
        continue;
      }
      if (
        OWN_ARGUMENTS.includes(field.name) &&
        lined &&
        decision.folderMode === undefined
      ) {
        continue;
      }
      facts.push({
        label,
        value,
        open: () => void this.goTo(decision.isHow(field) ? "how" : "place"),
      });
    }
    return facts;
  });
}
