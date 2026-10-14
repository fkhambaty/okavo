import { useRouter } from "expo-router";
import { listThreads } from "../../../src/calls";
import { useRefreshKey } from "../../../src/refresh";
import { useLoad } from "../../../src/useLoad";
import { Card, Row, Screen, StateView, Title } from "../../../src/ui";

export default function Messages() {
  const router = useRouter();
  const refreshKey = useRefreshKey();
  const loaded = useLoad(listThreads, refreshKey);
  return (
    <Screen>
      <Title>Messages</Title>
      {loaded.status === "loading" ? <StateView status="loading" title="Loading messages" /> : null}
      {loaded.status === "error" ? <StateView status="error" title="Messages could not be loaded" body={loaded.error || ""} /> : null}
      {loaded.status === "ready" && (loaded.data?.length ?? 0) === 0 ? (
        <StateView status="empty" title="No conversations" body="A conversation appears after you and the other party open one on a project." />
      ) : null}
      {loaded.data && loaded.data.length > 0 ? (
        <Card>
          {loaded.data.map((thread) => (
            <Row key={thread.id} title={thread.subject || "Conversation"} detail={thread.developer_name || thread.buyer_name || ""} onPress={() => router.push(`/workspace/messages/${thread.id}`)} />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
