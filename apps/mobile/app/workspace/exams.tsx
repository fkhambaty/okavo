import { useState } from "react";
import { useAuth } from "../../src/auth";
import { myExam, startExam, submitExam, textField } from "../../src/calls";
import { messageFrom } from "../../src/runtime";
import { useRefreshKey } from "../../src/refresh";
import { useLoad } from "../../src/useLoad";
import { Body, Button, Card, Field, Muted, Screen, StateView, Title } from "../../src/ui";

export default function Exams() {
  const { role } = useAuth();
  const refreshKey = useRefreshKey();
  const loaded = useLoad(myExam, refreshKey);
  const [github, setGithub] = useState("");
  const [live, setLive] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (role !== "developer") {
    return <Screen><StateView status="empty" title="The build exam is for developers" body="Admins use the exam queue." /></Screen>;
  }
  const exam = loaded.data?.exam ?? null;
  const status = exam ? textField(exam, "status") : "";
  const id = exam ? textField(exam, "id") : "";

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      await startExam();
      loaded.reload();
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await submitExam(id, github.trim(), live.trim());
      loaded.reload();
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Build exam</Title>
      <Muted>The exam is a 5-hour window, capped at 10 starts per UTC day. Scoring uses Okavo’s local checks. It does not call a language model.</Muted>
      {loaded.status === "loading" ? <StateView status="loading" title="Loading exam" /> : null}
      {loaded.status === "error" ? <StateView status="error" title="Exam could not be loaded" body={loaded.error || ""} /> : null}
      {loaded.status === "ready" && !exam ? (
        <>
          <StateView status="empty" title="No exam on this account" body="Starting one requires an approved government ID. If today’s places are full, Okavo says so." />
          <Button label={busy ? "Starting" : "Start build exam"} disabled={busy} onPress={() => void begin()} />
        </>
      ) : null}
      {exam ? (
        <Card>
          <Muted>{`Status ${status || "not recorded"}`}</Muted>
          <Muted>{textField(exam, "due_at") ? `Due ${textField(exam, "due_at")}` : "No due time was returned."}</Muted>
          <Body>{textField(exam, "title") || textField(exam, "summary") || "The brief text was not included in this response."}</Body>
          {status === "in_progress" ? (
            <>
              <Field label="Public GitHub or GitLab URL" autoCapitalize="none" value={github} onChangeText={setGithub} />
              <Field label="Public live HTTPS URL" autoCapitalize="none" value={live} onChangeText={setLive} />
              <Button label={busy ? "Submitting" : "Submit exam"} disabled={busy} onPress={() => void send()} />
            </>
          ) : null}
        </Card>
      ) : null}
      {error ? <Body>{error}</Body> : null}
    </Screen>
  );
}
