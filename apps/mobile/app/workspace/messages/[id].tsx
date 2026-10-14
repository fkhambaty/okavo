import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { checkGuardrails } from "@okavo/core";
import { useAuth } from "../../../src/auth";
import { listThreads, sendThreadMessage } from "../../../src/calls";
import { messageFrom } from "../../../src/runtime";
import { useRefreshKey } from "../../../src/refresh";
import { useLoad } from "../../../src/useLoad";
import { Body, Button, Card, Field, Muted, Screen, StateView, Title } from "../../../src/ui";

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const refreshKey = useRefreshKey();
  const loaded = useLoad(listThreads, refreshKey);
  const thread = loaded.data?.find((item) => item.id === id) ?? null;
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    const guard = checkGuardrails("message", text);
    if (!guard.ok) {
      setError(guard.message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendThreadMessage(String(id), text.trim());
      setText("");
      loaded.reload();
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>{thread?.subject || "Conversation"}</Title>
      {loaded.status === "loading" ? <StateView status="loading" title="Loading conversation" /> : null}
      {loaded.status === "error" ? <StateView status="error" title="Conversation could not be loaded" body={loaded.error || ""} /> : null}
      {loaded.status === "ready" && !thread ? <StateView status="empty" title="Conversation not found" body="It is not in the list returned for this account." /> : null}
      {(thread?.messages ?? []).length === 0 && thread ? <Muted>No messages in this conversation yet.</Muted> : null}
      {(thread?.messages ?? []).map((message) => (
        <Card key={message.id}>
          <Muted>{message.sender_id === profile?.id ? "You" : "The other party"}</Muted>
          <Body>{message.body}</Body>
          <Muted>{message.created_at}</Muted>
        </Card>
      ))}
      {thread ? (
        <>
          <Field label="Message" value={text} onChangeText={setText} />
          {error ? <Body>{error}</Body> : null}
          <Button label={busy ? "Sending" : "Send"} disabled={busy} onPress={() => void send()} />
        </>
      ) : null}
    </Screen>
  );
}
