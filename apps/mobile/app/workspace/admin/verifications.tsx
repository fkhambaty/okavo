import { useState } from "react";
import { useAuth } from "../../../src/auth";
import { decideVerification, textField, verificationQueue } from "../../../src/calls";
import { openPrivateFile } from "../../../src/files";
import { messageFrom } from "../../../src/runtime";
import { useRefreshKey } from "../../../src/refresh";
import { useLoad } from "../../../src/useLoad";
import { Body, Button, Card, Muted, Screen, StateView, Title } from "../../../src/ui";

export default function AdminVerifications() {
  const { role } = useAuth();
  const refreshKey = useRefreshKey();
  const loaded = useLoad(verificationQueue, refreshKey);
  const [error, setError] = useState<string | null>(null);
  if (role !== "admin") return <Screen><StateView status="empty" title="Admins review identity" /></Screen>;
  const pending = (loaded.data?.items ?? []).filter((item) => textField(item, "status") === "submitted");
  return (
    <Screen>
      <Title>Identity queue</Title>
      {loaded.status === "loading" ? <StateView status="loading" title="Loading the queue" /> : null}
      {loaded.status === "error" ? <StateView status="error" title="The queue could not be loaded" body={loaded.error || ""} /> : null}
      {loaded.status === "ready" && pending.length === 0 ? <StateView status="empty" title="No documents waiting" body="There is no submitted identity review in the queue." /> : null}
      {pending.map((item) => {
        const id = textField(item, "id");
        const document = textField(item, "document_storage_path");
        const selfie = textField(item, "selfie_storage_path");
        return (
          <Card key={id}>
            <Body>{textField(item, "full_name") || "Developer"}</Body>
            <Muted>{`${textField(item, "document_type") || "Document"} · ${textField(item, "document_country") || "country not recorded"}`}</Muted>
            {document && document !== "[purged]" ? <Button label="Open document" tone="quiet" onPress={() => void openPrivateFile(document).catch((cause: unknown) => setError(messageFrom(cause)))} /> : <Muted>Document file is not available.</Muted>}
            {selfie && selfie !== "[purged]" ? <Button label="Open selfie" tone="quiet" onPress={() => void openPrivateFile(selfie).catch((cause: unknown) => setError(messageFrom(cause)))} /> : <Muted>Selfie file is not available.</Muted>}
            <Button label="Approve" onPress={() => void decideVerification(id, true).then(() => loaded.reload()).catch((cause: unknown) => setError(messageFrom(cause)))} />
            <Button label="Reject" tone="quiet" onPress={() => void decideVerification(id, false, "Not legible").then(() => loaded.reload()).catch((cause: unknown) => setError(messageFrom(cause)))} />
          </Card>
        );
      })}
      {error ? <Body>{error}</Body> : null}
    </Screen>
  );
}
