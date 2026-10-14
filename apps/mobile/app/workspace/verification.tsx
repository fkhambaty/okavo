import { useState } from "react";
import { useAuth } from "../../src/auth";
import { developerAccount, submitIdentity } from "../../src/calls";
import { capturePhoto, pickDocument, type PreparedFile } from "../../src/files";
import { messageFrom } from "../../src/runtime";
import { useRefreshKey } from "../../src/refresh";
import { useLoad } from "../../src/useLoad";
import { Body, Button, Card, Field, Muted, Screen, StateView, Title } from "../../src/ui";

export default function Verification() {
  const { role } = useAuth();
  const refreshKey = useRefreshKey();
  const loaded = useLoad(developerAccount, refreshKey);
  const [documentType, setDocumentType] = useState("passport");
  const [country, setCountry] = useState("");
  const [document, setDocument] = useState<PreparedFile | null>(null);
  const [selfie, setSelfie] = useState<PreparedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (role !== "developer") {
    return <Screen><StateView status="empty" title="Identity upload is for developers" body="Admins review the queue instead of uploading their own document here." /></Screen>;
  }

  async function choose(kind: "document" | "selfie", camera: boolean) {
    setError(null);
    try {
      const purpose = kind === "selfie" ? "identity_selfie" : "identity_document";
      const file = camera ? await capturePhoto(purpose) : await pickDocument(purpose);
      if (!file) return;
      if (kind === "selfie") setSelfie(file);
      else setDocument(file);
    } catch (cause) {
      setError(messageFrom(cause));
    }
  }

  async function submit() {
    if (!document) {
      setError("Choose a JPEG, PNG, WebP, or PDF of the document. The file must be 5 MB or smaller.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submitIdentity({ documentType, country, document, selfie });
      loaded.reload();
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  }

  const status = loaded.data?.account?.identity_status;
  return (
    <Screen>
      <Title>Identity</Title>
      {loaded.status === "loading" ? <StateView status="loading" title="Loading verification" /> : null}
      {loaded.status === "error" ? <StateView status="error" title="Verification could not be loaded" body={loaded.error || ""} /> : null}
      {loaded.status === "ready" && !loaded.data?.account ? <StateView status="empty" title="No developer profile" body="Okavo did not return a developer account for this sign-in." /> : null}
      {loaded.data?.account ? (
        <Card>
          <Muted>{`Identity ${status || "not recorded"}`}</Muted>
          <Muted>{`Exam ${loaded.data.account.interview_status || "not recorded"}`}</Muted>
          <Muted>{loaded.data.account.bidding_unlocked_at ? `Bidding unlocked ${loaded.data.account.bidding_unlocked_at}` : "Bidding is not unlocked."}</Muted>
          {status === "approved" ? <Body>Identity is already approved. Okavo keeps the files for the retention window, then deletes them.</Body> : null}
          {status === "submitted" ? <Body>Documents are already in review. Another upload is refused until that review finishes.</Body> : null}
          {status !== "approved" && status !== "submitted" ? (
            <>
              <Field label="Document type" value={documentType} onChangeText={setDocumentType} />
              <Field label="Issuing country" value={country} onChangeText={setCountry} />
              <Button label={document ? "Document selected" : "Choose document"} tone="quiet" onPress={() => void choose("document", false)} />
              <Button label={selfie ? "Selfie selected" : "Take selfie"} tone="quiet" onPress={() => void choose("selfie", true)} />
              <Button label="Choose selfie from photos" tone="quiet" onPress={() => void choose("selfie", false)} />
              <Button label={busy ? "Uploading" : "Submit for review"} disabled={busy} onPress={() => void submit()} />
            </>
          ) : null}
          {error ? <Body>{error}</Body> : null}
        </Card>
      ) : null}
    </Screen>
  );
}
