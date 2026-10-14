import { useAuth } from "../../../src/auth";
import { operationsHealth } from "../../../src/calls";
import { useRefreshKey } from "../../../src/refresh";
import { useLoad } from "../../../src/useLoad";
import { Card, Muted, Screen, StateView, Title } from "../../../src/ui";

export default function Operations() {
  const { role } = useAuth();
  const refreshKey = useRefreshKey();
  const loaded = useLoad(operationsHealth, refreshKey);
  if (role !== "admin") return <Screen><StateView status="empty" title="Operations is for admins" /></Screen>;
  return (
    <Screen>
      <Title>Operations</Title>
      {loaded.status === "loading" ? <StateView status="loading" title="Checking operations" /> : null}
      {loaded.status === "error" ? <StateView status="error" title="Operations could not be loaded" body={loaded.error || ""} /> : null}
      {loaded.data ? (
        <Card>
          {Object.entries(loaded.data).map(([key, value]) => (
            <Muted key={key}>{`${key}: ${value === null || value === undefined ? "not recorded" : String(value)}`}</Muted>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
