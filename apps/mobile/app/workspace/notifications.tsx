import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../../src/calls";
import { messageFrom } from "../../src/runtime";
import { useRefreshKey } from "../../src/refresh";
import { useLoad } from "../../src/useLoad";
import { Body, Button, Card, Muted, Screen, StateView, Title } from "../../src/ui";
import { useState } from "react";

export default function Notifications() {
  const refreshKey = useRefreshKey();
  const loaded = useLoad(listNotifications, refreshKey);
  const [error, setError] = useState<string | null>(null);

  async function read(id: string) {
    try {
      await markNotificationRead(id);
      loaded.reload();
    } catch (cause) {
      setError(messageFrom(cause));
    }
  }

  return (
    <Screen>
      <Title>Notifications</Title>
      <Muted>This list refreshes when you return to Okavo. Phone push alerts are not switched on, because no push service is configured.</Muted>
      {loaded.status === "loading" ? <StateView status="loading" title="Loading notifications" /> : null}
      {loaded.status === "error" ? <StateView status="error" title="Notifications could not be loaded" body={loaded.error || ""} /> : null}
      {loaded.status === "ready" && (loaded.data?.length ?? 0) === 0 ? (
        <StateView status="empty" title="No notifications" body="Okavo has not stored a notification for this account." />
      ) : null}
      {loaded.data && loaded.data.length > 0 ? (
        <>
          <Button label="Mark all read" tone="quiet" onPress={() => void markAllNotificationsRead().then(() => loaded.reload()).catch((cause: unknown) => setError(messageFrom(cause)))} />
          {loaded.data.map((item) => (
            <Card key={item.id}>
              <Body>{item.title}</Body>
              <Muted>{item.body}</Muted>
              <Muted>{item.read_at ? `Read ${item.read_at}` : "Unread"}</Muted>
              {!item.read_at ? <Button label="Mark read" tone="quiet" onPress={() => void read(item.id)} /> : null}
            </Card>
          ))}
        </>
      ) : null}
      {error ? <Body>{error}</Body> : null}
    </Screen>
  );
}
