import { useRouter } from "expo-router";
import { listProjects } from "../../../src/calls";
import { useRefreshKey } from "../../../src/refresh";
import { useLoad } from "../../../src/useLoad";
import { Card, Row, Screen, StateView, Title } from "../../../src/ui";

export default function Contracts() {
  const router = useRouter();
  const refreshKey = useRefreshKey();
  const loaded = useLoad(listProjects, refreshKey);
  const rows = (loaded.data ?? []).filter((project) => project.contracts);
  return (
    <Screen>
      <Title>Contracts</Title>
      {loaded.status === "loading" ? <StateView status="loading" title="Loading contracts" /> : null}
      {loaded.status === "error" ? <StateView status="error" title="Contracts could not be loaded" body={loaded.error || ""} /> : null}
      {loaded.status === "ready" && rows.length === 0 ? (
        <StateView status="empty" title="No contracts" body="A contract appears after a bid is awarded. None were returned for this account." />
      ) : null}
      {rows.length > 0 ? (
        <Card>
          {rows.map((project) => (
            <Row key={project.id} title={project.title} detail={project.contracts?.status || project.stage} onPress={() => router.push(`/workspace/contracts/${project.id}`)} />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
