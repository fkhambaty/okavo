import { useState } from "react";
import { useAuth } from "../../../src/auth";
import { decideExam, openExams, textField } from "../../../src/calls";
import { messageFrom } from "../../../src/runtime";
import { useRefreshKey } from "../../../src/refresh";
import { useLoad } from "../../../src/useLoad";
import { Body, Button, Card, Muted, Screen, StateView, Title } from "../../../src/ui";

export default function AdminExams() {
  const { role } = useAuth();
  const refreshKey = useRefreshKey();
  const loaded = useLoad(openExams, refreshKey);
  const [error, setError] = useState<string | null>(null);
  if (role !== "admin") return <Screen><StateView status="empty" title="Admins review exams" /></Screen>;
  const exams = loaded.data?.exams ?? [];
  return (
    <Screen>
      <Title>Exam queue</Title>
      <Muted>These are exams waiting for review. A score of 70 or higher can still auto-approve after 48 hours unless an admin has paused that.</Muted>
      {loaded.status === "loading" ? <StateView status="loading" title="Loading exams" /> : null}
      {loaded.status === "error" ? <StateView status="error" title="The exam queue could not be loaded" body={loaded.error || ""} /> : null}
      {loaded.status === "ready" && exams.length === 0 ? <StateView status="empty" title="No exams waiting" body="Nothing is in submitted or admin-question status." /> : null}
      {exams.map((exam) => {
        const id = textField(exam, "id");
        return (
          <Card key={id}>
            <Muted>{`Status ${textField(exam, "status") || "not recorded"}`}</Muted>
            <Muted>{textField(exam, "github_url") || "No repository URL stored."}</Muted>
            <Muted>{textField(exam, "live_url") || "No live URL stored."}</Muted>
            <Button label="Approve" onPress={() => void decideExam(id, true).then(() => loaded.reload()).catch((cause: unknown) => setError(messageFrom(cause)))} />
            <Button label="Reject" tone="quiet" onPress={() => void decideExam(id, false).then(() => loaded.reload()).catch((cause: unknown) => setError(messageFrom(cause)))} />
          </Card>
        );
      })}
      {error ? <Body>{error}</Body> : null}
    </Screen>
  );
}
