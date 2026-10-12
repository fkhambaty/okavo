import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import RequirementPreview from "../../components/RequirementPreview";
import { CATEGORY_OPTIONS, SCALE_OPTIONS } from "../../data";
import { money } from "../../format";
import { collectFee, type CheckoutResult } from "../../lib/checkout";
import * as api from "../../lib/api";
import {
  requestAssist,
  type AssistResult,
} from "../../lib/assist";
import { logAudit } from "../../lib/audit";
import { checkGuardrails } from "../../lib/guardrails";
import { POSTING_FEE_LABEL, POSTING_SETTLEMENT_HINT } from "../../lib/pricing";
import {
  defaultActionFor,
  exclusionHintsFor,
  lockBaseItemsFor,
  mustHavesForCategory,
  outcomePromptsFor,
  suggestedMustHaves,
  type Audience,
} from "../../lib/requirementBlueprint";
import { getAccessToken } from "../../lib/sessionClient";
import { useStore } from "../../store";
import type { BuyerScale, ScopeItem } from "../../types";

const STEP_COUNT = 5;

/** Survives a tab closing mid-payment. */
const DRAFT_KEY = "okavo.requirement.draft";

type Draft = {
  scale: BuyerScale;
  category: string;
  audience: Audience;
  outcome: string;
  primaryAction: string;
  mustHaves: string[];
  budgetMin: string;
  budgetMax: string;
  monthly: string;
  weeks: string;
  excluded: string;
  scopeDraft: ScopeItem[];
};

function readDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

/** Starting points for buyers who have no idea what software costs. */
const BUDGET_RANGES = [
  { label: "Under $2,000", min: 500, max: 2000 },
  { label: "$2,000 – $5,000", min: 2000, max: 5000 },
  { label: "$5,000 – $15,000", min: 5000, max: 15000 },
  { label: "$15,000 – $40,000", min: 15000, max: 40000 },
  { label: "$40,000 +", min: 40000, max: 100000 },
];

const AUDIENCE_OPTIONS: { id: Audience; label: string; hint: string }[] = [
  {
    id: "customers",
    label: "Customers / public",
    hint: "People outside my organisation",
  },
  {
    id: "staff",
    label: "My team only",
    hint: "Internal tool, not a public site",
  },
  {
    id: "both",
    label: "Both",
    hint: "Customers and staff use different parts",
  },
];

export default function NewRequirement() {
  const navigate = useNavigate();
  const { createProject, connected, name, email } = useStore();
  const [saving, setSaving] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  const [step, setStep] = useState(1);
  const [scale, setScale] = useState<BuyerScale>("Local business");
  const [category, setCategory] = useState("store");
  const [audience, setAudience] = useState<Audience>("customers");
  const [outcome, setOutcome] = useState("");
  const [primaryAction, setPrimaryAction] = useState(defaultActionFor("store"));
  const [mustHaves, setMustHaves] = useState<string[]>(suggestedMustHaves("store"));
  // Deliberately empty: a pre-filled budget is the buyer accepting our guess,
  // which produces bids nobody meant.
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [monthly, setMonthly] = useState("");
  const [weeks, setWeeks] = useState("");
  const [excluded, setExcluded] = useState("");
  const [scopeDraft, setScopeDraft] = useState<ScopeItem[]>([]);
  const [assistBusy, setAssistBusy] = useState(false);
  const [assist, setAssist] = useState<AssistResult | null>(null);
  const [assistError, setAssistError] = useState<string | null>(null);

  const categoryLabel =
    CATEGORY_OPTIONS.find((c) => c.id === category)?.label ?? "Custom build";
  const mustHaveOptions = useMemo(
    () => mustHavesForCategory(category),
    [category]
  );
  const prompts = useMemo(() => outcomePromptsFor(category), [category]);
  const exclusionHints = useMemo(() => exclusionHintsFor(category), [category]);

  const restored = useRef(false);

  // If a previous attempt was interrupted mid-payment, bring the answers back
  // rather than making the buyer retype them. Any fee already paid is unspent
  // and will be consumed by the next publish.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const draft = readDraft();
    if (draft) restoreDraft(draft);
  }, []);

  function restoreDraft(draft: Draft) {
    setScale(draft.scale);
    setCategory(draft.category);
    setAudience(draft.audience);
    setOutcome(draft.outcome);
    setPrimaryAction(draft.primaryAction);
    setMustHaves(draft.mustHaves);
    setBudgetMin(draft.budgetMin);
    setBudgetMax(draft.budgetMax);
    setMonthly(draft.monthly);
    setWeeks(draft.weeks);
    setExcluded(draft.excluded);
    setScopeDraft(draft.scopeDraft);
    setStep(STEP_COUNT);
  }

  const previewProps = {
    scale,
    categoryId: category,
    categoryLabel,
    outcome,
    audience,
    primaryAction,
    mustHaves,
    excluded,
  };

  function selectCategory(id: string) {
    setCategory(id);
    setMustHaves(suggestedMustHaves(id));
    setPrimaryAction(defaultActionFor(id));
    if (!outcome.trim()) setExcluded("");
  }

  function toggleMustHave(item: string) {
    setMustHaves((prev) =>
      prev.includes(item) ? prev.filter((m) => m !== item) : [...prev, item]
    );
  }

  function toggleExclusionHint(hint: string) {
    const parts = excluded
      .split(/[,;\n]/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.includes(hint)) {
      setExcluded(parts.filter((part) => part !== hint).join(", "));
      return;
    }
    setExcluded([...parts, hint].join(", "));
  }

  function generateScope() {
    const base = lockBaseItemsFor(category).map((item, index) => ({
      id: `sc-base-${index}`,
      label: item.label,
      detail: item.detail,
      included: true,
      acceptanceCriteria: item.acceptance,
    }));

    const items: ScopeItem[] = [
      ...base,
      ...mustHaves.map((item, index) => ({
        id: `sc${index}`,
        label: item,
        detail: "Captured from your answers — written into the lock.",
        included: true,
        acceptanceCriteria: `Accepted when ${item.toLowerCase()} works end to end as described.`,
      })),
    ];

    if (primaryAction.trim()) {
      items.unshift({
        id: "sc-action",
        label: `Primary action: ${primaryAction.trim()}`,
        detail: "The main button or step a user completes.",
        included: true,
        acceptanceCriteria: `A user can complete “${primaryAction.trim()}” without leaving the product.`,
      });
    }

    if (outcome.trim()) {
      items.unshift({
        id: "sc-outcome",
        label: "Outcome you described",
        detail: outcome.trim(),
        included: true,
        acceptanceCriteria:
          "A reviewer can walk through the product and confirm this outcome is true.",
      });
    }

    excluded
      .split(/[,;\n]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((label, index) => {
        items.push({
          id: `sc-out-${index}`,
          label,
          detail: "Explicitly excluded from this contract.",
          included: false,
        });
      });

    setScopeDraft(items);
  }

  function toggleScopeItem(id: string) {
    setScopeDraft((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, included: !item.included } : item
      )
    );
  }

  /** Null when the current step is valid, otherwise the reason it is not. */
  function stepProblem(): string | null {
    if (step === 2) {
      const guard = checkGuardrails("outcome", outcome);
      if (!guard.ok) return guard.message;
    }
    if (step === 3 && mustHaves.length === 0) {
      return "Tick at least one must-have so the sketch has something to show.";
    }
    if (step === 3 && !excluded.trim()) {
      return "Name at least one exclusion (what is out of scope) so bids stay comparable.";
    }
    if (step === 4) {
      const min = Number(budgetMin);
      const max = Number(budgetMax);
      const run = Number(monthly);
      const span = Number(weeks);
      if (!Number.isFinite(min) || min <= 0) {
        return "Enter a build budget greater than zero.";
      }
      if (!Number.isFinite(max) || max <= 0) {
        return "Enter an upper build budget greater than zero.";
      }
      if (max < min) {
        return "The upper budget cannot be lower than the starting budget.";
      }
      if (!Number.isFinite(run) || run < 0) {
        return "Monthly running cost must be zero or more.";
      }
      if (!Number.isFinite(span) || span <= 0) {
        return "Enter how many weeks you can wait, as a positive number.";
      }
    }
    return null;
  }

  const problem = stepProblem();

  function next() {
    if (problem) return;
    if (step === 4) generateScope();
    setStep((s) => Math.min(STEP_COUNT, s + 1));
  }

  function currentDraft(): Draft {
    return {
      scale,
      category,
      audience,
      outcome,
      primaryAction,
      mustHaves,
      budgetMin,
      budgetMax,
      monthly,
      weeks,
      excluded,
      scopeDraft,
    };
  }

  /** Collects the posting fee, then publishes. Checkout stays on this page. */
  async function payAndPublish() {
    const guard = checkGuardrails("outcome", outcome);
    if (!guard.ok) {
      logAudit("guardrail.block", "project", null, {
        kind: "outcome",
        code: guard.code,
        at: "payAndPublish",
      });
      setPublishError(guard.message);
      return;
    }

    if (!connected) {
      setPublishError(null);
      await publishNow();
      return;
    }

    setSaving(true);
    setPublishError(null);

    // Kept in case the tab is closed mid-payment; the fee stays on the account.
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(currentDraft()));
    } catch {
      // A blocked sessionStorage costs a re-entry, never the payment.
    }

    try {
      const credit = await api.hasUnconsumedPostingFee();
      if (credit) {
        setSaving(false);
        await publishNow();
        return;
      }
    } catch (cause) {
      setSaving(false);
      setPublishError(
        cause instanceof Error
          ? cause.message
          : "Could not check your posting fee credit."
      );
      return;
    }

    let result: CheckoutResult;
    try {
      result = await collectFee("requirement_posting", { name, email });
    } catch (cause) {
      setPublishError(
        cause instanceof Error
          ? cause.message
          : "Could not open the payment window. Nothing has been published."
      );
      return;
    } finally {
      setSaving(false);
    }

    if (result.status === "cancelled") {
      setPublishError("Payment was cancelled. Nothing has been published.");
      return;
    }
    if (result.status === "error") {
      setPublishError(result.message);
      return;
    }
    if (result.status === "pending") {
      setPublishError(
        "Your payment is still confirming with the bank. Wait a moment and press publish again — you will not be charged twice."
      );
      return;
    }

    await publishNow();
  }

  async function runAssist() {
    const guard = checkGuardrails("outcome", outcome);
    if (!guard.ok) {
      logAudit("guardrail.block", "assist", null, {
        kind: "outcome",
        code: guard.code,
        at: "assist",
      });
      setAssistError(guard.message);
      return;
    }

    setAssistBusy(true);
    setAssistError(null);
    logAudit("assist.request", "requirement", null, {
      category: categoryLabel,
      mustHaveCount: mustHaves.length,
    });

    try {
      const accessToken = (await getAccessToken()) ?? undefined;
      const result = await requestAssist(
        {
          outcome,
          categoryLabel,
          mustHaves,
          excluded,
          primaryAction,
        },
        { accessToken }
      );
      setAssist(result);
      logAudit("assist.complete", "requirement", null, {
        mode: result.mode,
        count: result.suggestions.length,
      });
    } catch (cause) {
      setAssistError(
        cause instanceof Error
          ? cause.message
          : "Could not build suggestions from your draft."
      );
    } finally {
      setAssistBusy(false);
    }
  }

  /** Creates the requirement once the fee is settled. */
  async function publishNow() {
    setFinishing(true);
    const id = await createProject({
      title: outcome.slice(0, 60) || `${categoryLabel} project`,
      category: categoryLabel,
      outcome,
      budgetMin: Number(budgetMin) || 0,
      budgetMax: Number(budgetMax) || 0,
      monthlyOps: Number(monthly) || 0,
      timelineWeeks: Number(weeks) || 6,
      scale,
      scope: scopeDraft,
    });
    setFinishing(false);

    if (id) {
      sessionStorage.removeItem(DRAFT_KEY);
      navigate(`/app/project/${id}`);
      return;
    }
    setPublishError(
      "Your payment went through but the requirement could not be saved. Press publish again — the fee already on your account will be used, so you will not pay twice."
    );
  }

  const excludedSelected = new Set(
    excluded
      .split(/[,;\n]/)
      .map((part) => part.trim())
      .filter(Boolean)
  );

  return (
    <>
      <header className="topbar">
        <h1>New requirement</h1>
        <div className="topbar-actions">
          <span className="badge">
            Step {step} of {STEP_COUNT}
          </span>
        </div>
      </header>

      <div className="content content-narrow">
        <div className="wizard-steps">
          {Array.from({ length: STEP_COUNT }, (_, i) => (
            <i key={i} className={i < step ? "done" : ""} />
          ))}
        </div>

        <div className="card card-pad">
          {step === 1 && (
            <>
              <h2 style={{ marginBottom: "0.35rem" }}>Who is this for?</h2>
              <p className="hint" style={{ marginBottom: "1.25rem" }}>
                Scale does not change your price. It steers the questions we ask
                next so the lock matches how you actually work.
              </p>
              <div className="option-grid">
                {SCALE_OPTIONS.map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    className={`option-card${scale === option.id ? " selected" : ""}`}
                    onClick={() => setScale(option.id as BuyerScale)}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.hint}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 style={{ marginBottom: "0.35rem" }}>
                What should exist when this is finished?
              </h2>
              <p className="hint" style={{ marginBottom: "1.25rem" }}>
                Pick the closest shape, say who uses it, then write the outcome
                in plain language. That sentence becomes the heart of the
                contract.
              </p>

              <div className="option-grid" style={{ marginBottom: "1.25rem" }}>
                {CATEGORY_OPTIONS.map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    className={`option-card${category === option.id ? " selected" : ""}`}
                    onClick={() => selectCategory(option.id)}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.hint}</span>
                  </button>
                ))}
              </div>

              <h3 className="wizard-subhead">Who will use it day to day?</h3>
              <div className="option-grid" style={{ marginBottom: "1.25rem" }}>
                {AUDIENCE_OPTIONS.map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    className={`option-card${audience === option.id ? " selected" : ""}`}
                    onClick={() => setAudience(option.id)}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.hint}</span>
                  </button>
                ))}
              </div>

              <div className="field">
                <label htmlFor="outcome">
                  When this is finished, what should be true?
                </label>
                <textarea
                  id="outcome"
                  rows={4}
                  value={outcome}
                  onChange={(event) => setOutcome(event.target.value)}
                  placeholder={prompts[0]}
                />
                <span className="hint">
                  Write at least a sentence. Tip: start with “Customers can…” or
                  “My team can…”
                </span>
              </div>

              <div className="prompt-rail">
                <span className="prompt-rail-label">Use a starting line</span>
                <div className="chips" style={{ gap: "0.5rem" }}>
                  {prompts.map((prompt) => (
                    <button
                      type="button"
                      key={prompt}
                      className="toggle-chip"
                      onClick={() => setOutcome(prompt)}
                    >
                      {prompt.length > 72 ? `${prompt.slice(0, 69)}…` : prompt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field" style={{ marginTop: "1.25rem" }}>
                <label htmlFor="primary-action">
                  What is the main button or action people complete?
                </label>
                <input
                  id="primary-action"
                  value={primaryAction}
                  onChange={(event) => setPrimaryAction(event.target.value)}
                  placeholder={defaultActionFor(category)}
                />
                <span className="hint">
                  Examples: Place order, Book a slot, Sign in, Submit request,
                  Ask the assistant.
                </span>
              </div>

              {(outcome.trim() || mustHaves.length > 0) && (
                <RequirementPreview {...previewProps} compact />
              )}
            </>
          )}

          {step === 3 && (
            <>
              <h2 style={{ marginBottom: "0.35rem" }}>What must it include?</h2>
              <p className="hint" style={{ marginBottom: "1.25rem" }}>
                Tick everything that must be true. Leave out what you do not
                want to pay for — excluded items stay out of the lock.
              </p>
              <div
                className="chips"
                style={{ gap: "0.5rem", marginBottom: "1.5rem" }}
              >
                {mustHaveOptions.map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={`toggle-chip${mustHaves.includes(item) ? " selected" : ""}`}
                    onClick={() => toggleMustHave(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <h3 className="wizard-subhead">Rule anything out now</h3>
              <div
                className="chips"
                style={{ gap: "0.5rem", marginBottom: "0.85rem" }}
              >
                {exclusionHints.map((hint) => (
                  <button
                    type="button"
                    key={hint}
                    className={`toggle-chip danger${excludedSelected.has(hint) ? " selected" : ""}`}
                    onClick={() => toggleExclusionHint(hint)}
                  >
                    {hint}
                  </button>
                ))}
              </div>
              <div className="field">
                <label htmlFor="excluded">Or type your own exclusions</label>
                <input
                  id="excluded"
                  value={excluded}
                  onChange={(event) => setExcluded(event.target.value)}
                  placeholder="Separate with commas — e.g. Native mobile app, live chat"
                />
                <span className="hint">
                  Naming exclusions early prevents the most common argument
                  later.
                </span>
              </div>

              <RequirementPreview {...previewProps} />
            </>
          )}

          {step === 4 && (
            <>
              <h2 style={{ marginBottom: "0.35rem" }}>Budget and timeline</h2>
              <p className="hint" style={{ marginBottom: "1.25rem" }}>
                Two numbers matter: what you can pay to build it, and what you
                can pay every month to keep it running. Developers bid inside
                the range you set, so an honest range gets honest quotes.
              </p>

              <h3 className="wizard-subhead">Pick a range, or set your own</h3>
              <div className="chips" style={{ gap: "0.5rem", marginBottom: "1.25rem" }}>
                {BUDGET_RANGES.map((range) => (
                  <button
                    type="button"
                    key={range.label}
                    className={`toggle-chip${
                      budgetMin === String(range.min) &&
                      budgetMax === String(range.max)
                        ? " selected"
                        : ""
                    }`}
                    onClick={() => {
                      setBudgetMin(String(range.min));
                      setBudgetMax(String(range.max));
                    }}
                  >
                    {range.label}
                  </button>
                ))}
              </div>

              <div className="field-row">
                <div className="field">
                  <label htmlFor="min">Build budget from (USD)</label>
                  <input
                    id="min"
                    inputMode="numeric"
                    value={budgetMin}
                    placeholder="e.g. 3000"
                    onChange={(event) => setBudgetMin(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="max">Build budget up to (USD)</label>
                  <input
                    id="max"
                    inputMode="numeric"
                    value={budgetMax}
                    placeholder="e.g. 6000"
                    onChange={(event) => setBudgetMax(event.target.value)}
                  />
                </div>
              </div>
              <span className="hint" style={{ display: "block", marginTop: "-0.5rem", marginBottom: "1.25rem" }}>
                Not sure? Pick the closest range above. You can still change it
                until you sign.
              </span>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="monthly">Monthly running cost (USD)</label>
                  <input
                    id="monthly"
                    inputMode="numeric"
                    value={monthly}
                    placeholder="e.g. 120"
                    onChange={(event) => setMonthly(event.target.value)}
                  />
                  <span className="hint">Hosting, email, support. Zero is fine.</span>
                </div>
                <div className="field">
                  <label htmlFor="weeks">Wanted within (weeks)</label>
                  <input
                    id="weeks"
                    inputMode="numeric"
                    value={weeks}
                    placeholder="e.g. 6"
                    onChange={(event) => setWeeks(event.target.value)}
                  />
                </div>
              </div>

              <RequirementPreview {...previewProps} compact />
            </>
          )}

          {step === 5 && (
            <>
              <h2 style={{ marginBottom: "0.35rem" }}>
                This is what we understood
              </h2>
              <p className="hint" style={{ marginBottom: "1.25rem" }}>
                Untick anything that should not be promised. You sign this on
                the next screen — after that, changes are priced.
              </p>

              <RequirementPreview {...previewProps} />

              <div style={{ margin: "1.25rem 0" }}>
                {scopeDraft.map((item) => (
                  <label
                    className="scope-item"
                    key={item.id}
                    style={{ cursor: "pointer" }}
                  >
                    <input
                      type="checkbox"
                      checked={item.included}
                      onChange={() => toggleScopeItem(item.id)}
                      style={{
                        marginTop: "0.2rem",
                        accentColor: item.included
                          ? "var(--accent)"
                          : "var(--danger)",
                      }}
                    />
                    <div>
                      <strong>
                        {item.included ? item.label : `Out · ${item.label}`}
                      </strong>
                      <p>{item.detail}</p>
                    </div>
                  </label>
                ))}
              </div>

              <div className="card card-pad" style={{ background: "var(--bg)" }}>
                <div className="terms">
                  <div className="term">
                    <span>Build</span>
                    <strong>
                      {money(Number(budgetMin) || 0)} –{" "}
                      {money(Number(budgetMax) || 0)}
                    </strong>
                  </div>
                  <div className="term">
                    <span>Monthly</span>
                    <strong>{money(Number(monthly) || 0)}</strong>
                  </div>
                  <div className="term">
                    <span>Timeline</span>
                    <strong>{weeks} weeks</strong>
                  </div>
                </div>
              </div>

              <div
                className="card card-pad"
                style={{ marginTop: "0.85rem", background: "var(--bg)" }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <strong>Grounded assist</strong>
                    <p className="hint" style={{ margin: "0.25rem 0 0" }}>
                      Suggest acceptance and exclusion lines from what you
                      already typed — never invents fees or new features.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={runAssist}
                    disabled={assistBusy}
                  >
                    {assistBusy ? "Working…" : "Suggest lock lines"}
                  </button>
                </div>
                {assistError && (
                  <p className="hint" style={{ marginTop: "0.65rem" }} role="alert">
                    {assistError}
                  </p>
                )}
                {assist && (
                  <div style={{ marginTop: "0.85rem" }}>
                    <p className="hint" style={{ margin: "0 0 0.55rem" }}>
                      {assist.summary}
                      {assist.mode === "llm" ? " (LLM polish on)" : " (rules only)"}
                    </p>
                    <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                      {assist.suggestions.map((item) => (
                        <li key={item.id} style={{ marginBottom: "0.45rem" }}>
                          <strong>{item.title}</strong>
                          <span className="hint"> — {item.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="fee-row">
                <div>
                  <strong>Posting fee</strong>
                  <p>
                    Charged once per requirement. It keeps the board free of
                    idle posts, so developers treat yours as real work.
                  </p>
                </div>
                <span className="fee-amount">{POSTING_FEE_LABEL}</span>
              </div>

              <p className="hint" style={{ marginTop: "0.75rem" }}>
                This fee is Okavo’s posting charge only — not escrow for the
                build. Build money still moves between you and the developer
                outside Okavo. When you hire, Okavo also collects a flat 10%
                hire success fee. Payment is
                handled by Razorpay; Okavo never sees your card details. After
                payment clears the requirement opens for developer Q&amp;A. You
                freeze the lock on the next screen — only then can verified
                developers bid.{" "}
                {POSTING_SETTLEMENT_HINT}
              </p>
            </>
          )}

          <div className="wizard-foot">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={step === 1}
              onClick={() => setStep((s) => Math.max(1, s - 1))}
            >
              Back
            </button>
            {step < STEP_COUNT ? (
              <button
                type="button"
                className="btn"
                onClick={next}
                disabled={problem !== null}
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-accent"
                onClick={payAndPublish}
                disabled={saving || finishing}
              >
                {finishing
                  ? "Publishing…"
                  : saving
                    ? "Opening payment…"
                    : connected
                      ? `Pay ${POSTING_FEE_LABEL} and publish`
                      : "Publish demo requirement — no charge"}
              </button>
            )}
          </div>
          {problem && step < STEP_COUNT && (
            <p className="hint" style={{ marginTop: "0.75rem" }}>
              {problem}
            </p>
          )}
          {publishError && (
            <div
              className="callout callout-warn"
              style={{ marginTop: "0.85rem" }}
              role="alert"
            >
              <span>!</span>
              <span>{publishError}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
