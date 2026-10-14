/**
 * Rules-first content guardrails (no LLM required).
 * Block spam, prompt-injection theatre, and empty/off-topic noise before
 * publish, clarifications, or optional AI assist.
 */

export type GuardKind =
  | "outcome"
  | "clarification"
  | "message"
  | "change_order"
  | "exam_question"
  | "exam_reply";

export type GuardResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

const INJECTION = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|rules)/i,
  /disregard\s+(the\s+)?(system|lock|scope)/i,
  /you\s+are\s+now\s+(dan|jailbreak|unrestricted)/i,
  /\bsystem\s*prompt\b/i,
  /\bdo\s+not\s+follow\s+the\s+lock\b/i,
];

const SPAM = [
  /(?:https?:\/\/\S+\s*){5,}/i,
  /(\bviagra\b|\bcrypto\s*airdrop\b|\btelegram\s*@)/i,
  /(.)\1{20,}/,
];

const MIN_LEN: Record<GuardKind, number> = {
  outcome: 20,
  clarification: 8,
  message: 1,
  change_order: 8,
  exam_question: 8,
  exam_reply: 8,
};

const MAX_LEN: Record<GuardKind, number> = {
  outcome: 4000,
  clarification: 2000,
  message: 8000,
  change_order: 4000,
  exam_question: 2000,
  exam_reply: 2000,
};

/**
 * Synchronous check. Safe to call from the browser before payments or inserts.
 * Server/edge copies of these rules should stay in lockstep when added.
 */
export function checkGuardrails(kind: GuardKind, text: string): GuardResult {
  const value = text.trim();

  if (!value) {
    return {
      ok: false,
      code: "empty",
      message: "Add a short description before continuing.",
    };
  }

  if (value.length < MIN_LEN[kind]) {
    return {
      ok: false,
      code: "too_short",
      message:
        kind === "outcome"
          ? "Add a clearer outcome (about one sentence) before continuing."
          : kind === "exam_question"
            ? "Add a complete exam question (at least 8 characters)."
            : kind === "exam_reply"
              ? "Add a complete exam reply (at least 8 characters)."
              : "That text is too short to be useful. Add a bit more detail.",
    };
  }

  if (value.length > MAX_LEN[kind]) {
    return {
      ok: false,
      code: "too_long",
      message: "That text is too long. Shorten it and try again.",
    };
  }

  for (const pattern of INJECTION) {
    if (pattern.test(value)) {
      return {
        ok: false,
        code: "injection",
        message: kind.startsWith("exam_")
          ? "Remove instruction-override or system-prompt language and write only about the exam."
          : "That looks like an attempt to override Okavo’s rules. Describe the product outcome in plain language instead.",
      };
    }
  }

  for (const pattern of SPAM) {
    if (pattern.test(value)) {
      return {
        ok: false,
        code: "spam",
        message:
          "That text looks like spam or link flooding. Remove the noise and describe the real need.",
      };
    }
  }

  if (kind === "outcome" && !/[a-zA-Z]{3,}/.test(value)) {
    return {
      ok: false,
      code: "off_topic",
      message: "Describe the outcome in words a colleague would understand.",
    };
  }

  return { ok: true };
}
