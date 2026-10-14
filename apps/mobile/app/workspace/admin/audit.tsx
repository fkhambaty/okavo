import { useAuth } from "../../../src/auth";
import { auditBuckets, auditEvents, textField } from "../../../src/calls";
import { useRefreshKey } from "../../../src/refresh";
import { useLoad } from "../../../src/useLoad";
import { Card, Muted, Screen, StateView, Title } from "../../../src/ui";

export default function Audit() {
  const { role } = useAuth();
  const refreshKey = useRefreshKey();
  const buckets = useLoad(auditBuckets, refreshKey);
  const events = useLoad(auditEvents, refreshKey);
  if (role !== "admin") return <Screen><StateView status="empty" title="The audit log is for admins" /></Screen>;
  return (
    <Screen>
      <Title>Audit</Title>
      {buckets.status === "error" ? <StateView status="error" title="Audit counts could not be loaded" body={buckets.error || ""} /> : null}
      {buckets.data ? (
        <Card>
          {Object.entries(buckets.data.counts).map(([key, value]) => (
            <Muted key={key}>{`${key}: ${value}`}</Muted>
          ))}
        </Card>
      ) : null}
      {events.status === "loading" ? <StateView status="loading" title="Loading recent audit events" /> : null}
      {events.status === "error" ? <StateView status="error" title="Audit events could not be loaded" body={events.error || ""} /> : null}
      {events.status === "ready" && (events.data?.events.length ?? 0) === 0 ? <StateView status="empty" title="No audit events in the last 7 days" /> : null}
      {(events.data?.events ?? []).map((event) => (
        <Card key={textField(event, "id") || textField(event, "created_at")}>
          <Muted>{textField(event, "action") || textField(event, "kind") || "Event"}</Muted>
          <Muted>{textField(event, "created_at")}</Muted>
        </Card>
      ))}
    </Screen>
  );
}
