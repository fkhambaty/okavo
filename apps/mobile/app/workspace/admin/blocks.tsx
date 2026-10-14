import { useState } from "react";
import { useAuth } from "../../../src/auth";
import { listBlocks, reviewBlock, textField } from "../../../src/calls";
import { messageFrom } from "../../../src/runtime";
import { useRefreshKey } from "../../../src/refresh";
import { useLoad } from "../../../src/useLoad";
import { Body, Button, Card, Muted, Screen, StateView, Title } from "../../../src/ui";

export default function AdminBlocks() {
  const { role } = useAuth();
  const refreshKey = useRefreshKey();
  const loaded = useLoad(listBlocks, refreshKey);
  const [error, setError] = useState<string | null>(null);
  if (role !== "admin") return <Screen><StateView status="empty" title="Admins review blocks" /></Screen>;
  const requests = loaded.data?.requests ?? [];
  return (
    <Screen>
      <Title>Block requests</Title>
      {loaded.status === "loading" ? <StateView status="loading" title="Loading block requests" /> : null}
      {loaded.status === "error" ? <StateView status="error" title="Block requests could not be loaded" body={loaded.error || ""} /> : null}
      {loaded.status === "ready" && requests.length === 0 ? <StateView status="empty" title="No open block requests" /> : null}
      {requests.map((request) => {
        const id = textField(request, "id");
        return (
          <Card key={id}>
            <Muted>{textField(request, "reason") || "No reason stored"}</Muted>
            <Muted>{textField(request, "detail") || "No detail stored"}</Muted>
            <Button label="Approve block" onPress={() => void reviewBlock(id, true, "Approved from the app").then(() => loaded.reload()).catch((cause: unknown) => setError(messageFrom(cause)))} />
            <Button label="Reject request" tone="quiet" onPress={() => void reviewBlock(id, false, "Rejected from the app").then(() => loaded.reload()).catch((cause: unknown) => setError(messageFrom(cause)))} />
          </Card>
        );
      })}
      {error ? <Body>{error}</Body> : null}
    </Screen>
  );
}
