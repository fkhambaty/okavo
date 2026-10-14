import { useState } from "react";
import { useRouter } from "expo-router";
import { checkGuardrails, PAYMENTS_DISABLED_COPY } from "@okavo/core";
import { useAuth } from "../../src/auth";
import { publishRequirement, unconsumedPosting } from "../../src/calls";
import { messageFrom } from "../../src/runtime";
import { Banner, Body, Button, Field, Screen, StateView, Title } from "../../src/ui";

function dollarsToCents(value: string): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

export default function Requirements() {
  const { role } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [outcome, setOutcome] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [weeks, setWeeks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (role !== "buyer" && role !== "admin") {
    return <Screen><StateView status="empty" title="Buyers publish requirements" body="This account cannot open the requirement form." /></Screen>;
  }

  async function submit() {
    const guard = checkGuardrails("outcome", outcome);
    if (!guard.ok) {
      setError(guard.message);
      return;
    }
    const budgetMinCents = dollarsToCents(min);
    const budgetMaxCents = dollarsToCents(max);
    const timelineWeeks = Number(weeks);
    if (!budgetMinCents || !budgetMaxCents || budgetMaxCents < budgetMinCents || !Number.isInteger(timelineWeeks) || timelineWeeks <= 0) {
      setError("Enter a minimum, a maximum at least that high, and a whole number of weeks. Amounts are USD.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ready = await unconsumedPosting();
      if (!ready) {
        setError("A posting fee has to be paid before a requirement is created. Checkout is switched off, so this app cannot collect that fee.");
        return;
      }
      await publishRequirement({ title, category, outcome, budgetMinCents, budgetMaxCents, timelineWeeks });
      router.replace("/workspace");
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>New requirement</Title>
      <Banner>{PAYMENTS_DISABLED_COPY} If a posting fee was already paid and is unused, Okavo can still create the requirement.</Banner>
      <Field label="Title" value={title} onChangeText={setTitle} />
      <Field label="Category" value={category} onChangeText={setCategory} />
      <Field label="Outcome" multiline value={outcome} onChangeText={setOutcome} />
      <Field label="Budget minimum (USD)" keyboardType="decimal-pad" value={min} onChangeText={setMin} />
      <Field label="Budget maximum (USD)" keyboardType="decimal-pad" value={max} onChangeText={setMax} />
      <Field label="Timeline in weeks" keyboardType="number-pad" value={weeks} onChangeText={setWeeks} />
      {error ? <Body>{error}</Body> : null}
      <Button label={busy ? "Checking" : "Publish if a fee is already paid"} disabled={busy} onPress={() => void submit()} />
    </Screen>
  );
}
