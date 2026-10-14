import { useState } from "react";
import { checkGuardrails, PAYMENTS_DISABLED_COPY } from "@okavo/core";
import { useAuth } from "../../src/auth";
import { centsToLabel, developerAccount, listProjects, placeBid } from "../../src/calls";
import { messageFrom } from "../../src/runtime";
import { useRefreshKey } from "../../src/refresh";
import { useLoad } from "../../src/useLoad";
import { Banner, Body, Button, Card, Field, Muted, Screen, StateView, Title } from "../../src/ui";

export default function Bids() {
  const { role, profile } = useAuth();
  const refreshKey = useRefreshKey();
  const projects = useLoad(listProjects, refreshKey);
  const account = useLoad(developerAccount, refreshKey);
  const [projectId, setProjectId] = useState("");
  const [amount, setAmount] = useState("");
  const [weeks, setWeeks] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (role !== "developer" && role !== "admin") {
    return <Screen><StateView status="empty" title="Bids are for developers" body="Buyers review bids on each project." /></Screen>;
  }

  const unlocked = Boolean(account.data?.account?.bidding_unlocked_at);
  const open = (projects.data ?? []).filter((project) => project.stage === "locked");

  async function submit() {
    const guard = checkGuardrails("message", note || "Bid");
    if (!guard.ok && note) {
      setError(guard.message);
      return;
    }
    const amountCents = Math.round(Number(amount) * 100);
    const deliveryWeeks = Number(weeks);
    if (!projectId || !Number.isInteger(amountCents) || amountCents <= 0 || !Number.isInteger(deliveryWeeks) || deliveryWeeks <= 0) {
      setError("Choose a locked project, a USD amount, and whole weeks.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await placeBid(projectId, { amountCents, weeks: deliveryWeeks, message: note });
      projects.reload();
      setNote("");
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Bids</Title>
      <Banner>{PAYMENTS_DISABLED_COPY} Awarding a bid also needs the hire fee, which this app cannot collect.</Banner>
      {account.status === "ready" && !unlocked ? (
        <StateView status="empty" title="Bidding is locked" body="Okavo unlocks bidding after identity approval and a passed build exam. A membership purchase cannot be started here." />
      ) : null}
      {projects.status === "loading" ? <StateView status="loading" title="Loading open scopes" /> : null}
      {projects.status === "error" ? <StateView status="error" title="Bids could not be loaded" body={projects.error || ""} /> : null}
      {projects.status === "ready" && open.length === 0 ? <StateView status="empty" title="No locked scopes" body="There is no locked requirement in the list returned for this account." /> : null}
      {open.map((project) => {
        const mine = (project.bids ?? []).filter((bid) => bid.developer_id === profile?.id);
        return (
          <Card key={project.id}>
            <Body>{project.title}</Body>
            <Muted>{`${project._bidStats?.bid_count ?? 0} bids recorded`}</Muted>
            {mine.length === 0 ? <Muted>You have no bid on this scope in the returned list.</Muted> : null}
            {mine.map((bid) => (
              <Muted key={bid.id}>{`${bid.status} · ${centsToLabel(bid.amount_cents)}`}</Muted>
            ))}
            <Button label={projectId === project.id ? "Selected" : "Bid on this scope"} tone="quiet" onPress={() => setProjectId(project.id)} />
          </Card>
        );
      })}
      {unlocked ? (
        <>
          <Field label="USD amount" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
          <Field label="Weeks" keyboardType="number-pad" value={weeks} onChangeText={setWeeks} />
          <Field label="Note" value={note} onChangeText={setNote} />
          {error ? <Body>{error}</Body> : null}
          <Button label={busy ? "Sending" : "Submit bid"} disabled={busy || !projectId} onPress={() => void submit()} />
        </>
      ) : null}
    </Screen>
  );
}
