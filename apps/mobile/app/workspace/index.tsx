import { useState } from "react";
import { useRouter } from "expo-router";
import { PAYMENTS_DISABLED_COPY, TERMS_VERSION } from "@okavo/core";
import { useAuth } from "../../src/auth";
import { acceptTerms, insights, listProjects, termsAccepted } from "../../src/calls";
import { messageFrom } from "../../src/runtime";
import { useRefreshKey } from "../../src/refresh";
import { useLoad } from "../../src/useLoad";
import { Banner, Body, Button, Card, Muted, Row, Screen, StateView, Title } from "../../src/ui";

export default function Dashboard() {
  const { profile, role, refreshProfile } = useAuth();
  const router = useRouter();
  const refreshKey = useRefreshKey();
  const projects = useLoad(listProjects, refreshKey);
  const admin = useLoad(() => (role === "admin" ? insights() : Promise.resolve(null)), refreshKey);
  const terms = useLoad(() => termsAccepted(TERMS_VERSION), refreshKey);
  const [termsError, setTermsError] = useState<string | null>(null);

  async function accept() {
    try {
      await acceptTerms(TERMS_VERSION);
      await refreshProfile();
      terms.reload();
    } catch (cause) {
      setTermsError(messageFrom(cause));
    }
  }

  return (
    <Screen>
      <Title>{role === "admin" ? "Admin" : role === "developer" ? "Developer" : "Buyer"}</Title>
      <Muted>{profile?.email}</Muted>
      <Banner>{PAYMENTS_DISABLED_COPY}</Banner>
      {terms.status === "ready" && terms.data === false ? (
        <Card>
          <Body>Accept the Okavo Terms ({TERMS_VERSION}) before publishing a requirement or countersigning a lock.</Body>
          {termsError ? <Body>{termsError}</Body> : null}
          <Button label="Accept terms" onPress={() => void accept()} />
        </Card>
      ) : null}
      {projects.status === "loading" ? <StateView status="loading" title="Loading projects" /> : null}
      {projects.status === "error" ? <StateView status="error" title="Projects could not be loaded" body={projects.error || ""} /> : null}
      {projects.status === "ready" && (projects.data?.length ?? 0) === 0 ? (
        <StateView status="empty" title="No projects yet" body="Okavo is not showing sample requirements. A project appears here after it exists in your account." />
      ) : null}
      {projects.status === "ready" && projects.data && projects.data.length > 0 ? (
        <Card>
          {projects.data.map((project) => (
            <Row
              key={project.id}
              title={project.title || "Untitled project"}
              detail={`${project.stage} · ${project._bidStats?.bid_count ?? 0} bids recorded`}
              onPress={() => router.push(`/workspace/projects/${project.id}`)}
            />
          ))}
        </Card>
      ) : null}
      {role === "admin" && admin.status === "ready" && admin.data ? (
        <Card>
          <Body>Live counts from Okavo. Zero means the table is empty.</Body>
          {Object.entries(admin.data).map(([key, value]) => (
            <Muted key={key}>{`${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`}</Muted>
          ))}
        </Card>
      ) : null}
      {role === "admin" && admin.status === "error" ? <StateView status="error" title="Admin counts could not be loaded" body={admin.error || ""} /> : null}
    </Screen>
  );
}
