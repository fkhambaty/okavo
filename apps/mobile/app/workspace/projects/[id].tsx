import { useLocalSearchParams, useRouter } from "expo-router";
import { centsToLabel, listProjects } from "../../../src/calls";
import { useRefreshKey } from "../../../src/refresh";
import { useLoad } from "../../../src/useLoad";
import { Body, Button, Card, Muted, Row, Screen, StateView, Title } from "../../../src/ui";

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const refreshKey = useRefreshKey();
  const loaded = useLoad(listProjects, refreshKey);
  const project = loaded.data?.find((item) => item.id === id) ?? null;

  return (
    <Screen>
      {loaded.status === "loading" ? <StateView status="loading" title="Loading project" /> : null}
      {loaded.status === "error" ? <StateView status="error" title="Project could not be loaded" body={loaded.error || ""} /> : null}
      {loaded.status === "ready" && !project ? (
        <StateView status="empty" title="This project is not available" body="It is not in the list Okavo returned for this account." />
      ) : null}
      {project ? (
        <>
          <Title>{project.title}</Title>
          <Muted>{project.stage}</Muted>
          <Body>{project.outcome || "No outcome text was stored."}</Body>
          <Card>
            <Muted>{`Budget ${centsToLabel(project.budget_min_cents)} to ${centsToLabel(project.budget_max_cents)}`}</Muted>
            <Muted>{`Timeline ${project.timeline_weeks ?? "not recorded"} weeks`}</Muted>
            <Muted>{`Bids recorded ${project._bidStats?.bid_count ?? 0}`}</Muted>
            {project._bidStats?.lowest_bid_cents != null ? <Muted>{`Lowest recorded bid ${centsToLabel(project._bidStats.lowest_bid_cents)}`}</Muted> : <Muted>No lowest bid was returned.</Muted>}
          </Card>
          <Card>
            {(project.scope_items ?? []).length === 0 ? <Muted>No scope lines were returned.</Muted> : null}
            {(project.scope_items ?? []).map((item) => (
              <Row key={item.id} title={item.label} detail={item.included === false ? "Excluded" : item.detail || ""} />
            ))}
          </Card>
          <Card>
            {(project.bids ?? []).length === 0 ? <Muted>No bids are visible to this account.</Muted> : null}
            {(project.bids ?? []).map((bid) => (
              <Row
                key={bid.id}
                title={bid.developer_profiles?.profiles?.full_name || "Developer"}
                detail={`${bid.status} · ${centsToLabel(bid.amount_cents)} · ${bid.delivery_weeks} weeks`}
              />
            ))}
          </Card>
          {project.contracts ? <Button label="Open contract" onPress={() => router.push(`/workspace/contracts/${project.id}`)} /> : <Muted>No contract is attached to this project yet.</Muted>}
        </>
      ) : null}
    </Screen>
  );
}
