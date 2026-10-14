import { centsToLabel, listProjects } from "../../src/calls";
import { useAuth } from "../../src/auth";
import { useRefreshKey } from "../../src/refresh";
import { useLoad } from "../../src/useLoad";
import { Card, Muted, Screen, StateView, Title } from "../../src/ui";

export default function Earnings() {
  const { role, profile } = useAuth();
  const refreshKey = useRefreshKey();
  const loaded = useLoad(listProjects, refreshKey);
  if (role !== "developer" && role !== "admin") {
    return <Screen><StateView status="empty" title="Earnings are for developers" body="Buyers record outside payments on the contract." /></Screen>;
  }
  const released = (loaded.data ?? []).flatMap((project) =>
    (project.contracts?.milestones ?? [])
      .filter((milestone) => milestone.status === "released")
      .map((milestone) => ({ ...milestone, project: project.title })),
  );
  const total = released.reduce((sum, milestone) => sum + (milestone.amount_cents ?? 0), 0);
  return (
    <Screen>
      <Title>Earnings</Title>
      <Muted>These figures are milestone amounts Okavo returned as released. Okavo does not hold or pay them. {profile?.email}</Muted>
      {loaded.status === "loading" ? <StateView status="loading" title="Loading earnings" /> : null}
      {loaded.status === "error" ? <StateView status="error" title="Earnings could not be loaded" body={loaded.error || ""} /> : null}
      {loaded.status === "ready" && released.length === 0 ? (
        <StateView status="empty" title="No released milestones" body="Nothing in the returned contracts is marked released." />
      ) : null}
      {released.length > 0 ? (
        <Card>
          <Muted>{`Released total from returned rows ${centsToLabel(total)}`}</Muted>
          {released.map((milestone) => (
            <Muted key={milestone.id}>{`${milestone.project}: ${milestone.title} · ${centsToLabel(milestone.amount_cents)}`}</Muted>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
