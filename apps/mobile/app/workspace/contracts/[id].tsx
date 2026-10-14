import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { PAYMENTS_DISABLED_COPY } from "@okavo/core";
import { useAuth } from "../../../src/auth";
import { acceptMilestone, attestMilestone, centsToLabel, countersign, listProjects, submitMilestone } from "../../../src/calls";
import { pickDocument } from "../../../src/files";
import { messageFrom } from "../../../src/runtime";
import { useRefreshKey } from "../../../src/refresh";
import { useLoad } from "../../../src/useLoad";
import { Banner, Body, Button, Card, Field, Muted, Screen, StateView, Title } from "../../../src/ui";

export default function ContractScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { role, profile } = useAuth();
  const refreshKey = useRefreshKey();
  const loaded = useLoad(listProjects, refreshKey);
  const project = loaded.data?.find((item) => item.id === id) ?? null;
  const [summary, setSummary] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      loaded.reload();
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Contract</Title>
      <Banner>{PAYMENTS_DISABLED_COPY} A milestone attestation records a payment made outside Okavo. It does not charge a card.</Banner>
      {loaded.status === "loading" ? <StateView status="loading" title="Loading contract" /> : null}
      {loaded.status === "error" ? <StateView status="error" title="Contract could not be loaded" body={loaded.error || ""} /> : null}
      {loaded.status === "ready" && !project?.contracts ? <StateView status="empty" title="No contract on this project" body="Okavo did not return a contract for this account." /> : null}
      {project?.contracts ? (
        <Card>
          <Body>{project.title}</Body>
          <Muted>{`Status ${project.contracts.status || "not recorded"}`}</Muted>
          <Muted>{project.contracts.lock_reference ? `Lock ${project.contracts.lock_reference}` : "No lock reference was returned."}</Muted>
          <Muted>{project.contracts.developer_signed_at ? `Developer signed ${project.contracts.developer_signed_at}` : "The developer has not countersigned."}</Muted>
          {role === "developer" && profile?.id && !project.contracts.developer_signed_at ? (
            <Button label="Countersign the lock" disabled={busy} onPress={() => void run(() => countersign(project.id))} />
          ) : null}
          {(project.contracts.milestones ?? []).length === 0 ? <Muted>No milestones were returned.</Muted> : null}
          {(project.contracts.milestones ?? []).map((milestone) => (
            <Card key={milestone.id}>
              <Body>{milestone.title}</Body>
              <Muted>{`${milestone.status} · ${centsToLabel(milestone.amount_cents)}`}</Muted>
              {role === "developer" && milestone.status === "in_progress" ? (
                <>
                  <Field label="Handover summary" value={summary} onChangeText={setSummary} />
                  <Button label="Submit milestone" disabled={busy} onPress={() => void run(() => submitMilestone(milestone.id, summary))} />
                </>
              ) : null}
              {role === "buyer" && milestone.status === "submitted" ? (
                <Button label="Accept the work" disabled={busy} onPress={() => void run(() => acceptMilestone(milestone.id))} />
              ) : null}
              {role === "buyer" && milestone.status === "accepted" ? (
                <>
                  <Field label="Payment reference" value={reference} onChangeText={setReference} />
                  <Button
                    label="Attach proof and record outside payment"
                    tone="quiet"
                    disabled={busy}
                    onPress={() =>
                      void run(async () => {
                        const proof = await pickDocument("payment_proof");
                        await attestMilestone(milestone.id, reference, proof);
                      })
                    }
                  />
                  <Button label="Record outside payment without a file" tone="quiet" disabled={busy} onPress={() => void run(() => attestMilestone(milestone.id, reference, null))} />
                </>
              ) : null}
            </Card>
          ))}
          {error ? <Body>{error}</Body> : null}
        </Card>
      ) : null}
    </Screen>
  );
}
