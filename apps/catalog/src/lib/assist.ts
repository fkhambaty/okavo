/**
 * Grounded assist — suggestions only from the buyer’s own draft.
 * Never invents fees, escrow claims, or features outside must-haves.
 */

export type AssistInput = {
  outcome: string;
  categoryLabel: string;
  mustHaves: string[];
  excluded: string;
  primaryAction?: string;
};

export type AssistSuggestion = {
  id: string;
  kind: "acceptance" | "exclusion" | "screen";
  title: string;
  detail: string;
};

export type AssistResult = {
  available: boolean;
  mode: "heuristic" | "llm" | "unavailable";
  summary: string;
  suggestions: AssistSuggestion[];
};

/** Deterministic grounded suggestions (always available, no API key). */
export function heuristicAssist(input: AssistInput): AssistResult {
  const suggestions: AssistSuggestion[] = [];
  const outcome = input.outcome.trim();
  const excluded = input.excluded
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (outcome) {
    suggestions.push({
      id: "acc-outcome",
      kind: "acceptance",
      title: "Primary outcome check",
      detail: `Accepted when a reviewer can walk the product and confirm: “${outcome.slice(0, 180)}${outcome.length > 180 ? "…" : ""}”.`,
    });
  }

  input.mustHaves.slice(0, 5).forEach((item, index) => {
    suggestions.push({
      id: `acc-must-${index}`,
      kind: "acceptance",
      title: `Must-have: ${item}`,
      detail: `Accepted when “${item}” works on the happy path without workarounds outside this lock.`,
    });
  });

  if (input.primaryAction?.trim()) {
    suggestions.push({
      id: "screen-primary",
      kind: "screen",
      title: "Primary action screen",
      detail: `Preview should show a clear control for: ${input.primaryAction.trim()}.`,
    });
  }

  excluded.slice(0, 4).forEach((item, index) => {
    suggestions.push({
      id: `ex-${index}`,
      kind: "exclusion",
      title: `Keep out: ${item}`,
      detail: `Out of scope — developers must not build “${item}” unless a change order is signed.`,
    });
  });

  if (excluded.length === 0) {
    suggestions.push({
      id: "ex-prompt",
      kind: "exclusion",
      title: "Name one exclusion",
      detail:
        "Add at least one explicit out-of-scope item (e.g. native apps, same-day delivery) so bids stay comparable.",
    });
  }

  return {
    available: true,
    mode: "heuristic",
    summary:
      "Suggestions are grounded only in what you already typed — not inventing new product features.",
    suggestions,
  };
}

/** Grounded suggestions from the buyer's own draft. No remote model is called. */
export async function requestAssist(
  input: AssistInput,
  opts?: { accessToken?: string | null }
): Promise<AssistResult> {
  void opts;
  return heuristicAssist(input);
}
