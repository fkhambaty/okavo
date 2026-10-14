import { useRouter } from "expo-router";
import { useAuth } from "../../../src/auth";
import { listDevelopers } from "../../../src/calls";
import { useRefreshKey } from "../../../src/refresh";
import { useLoad } from "../../../src/useLoad";
import { Card, Row, Screen, StateView, Title } from "../../../src/ui";

export default function Developers() {
  const { role } = useAuth();
  const router = useRouter();
  const refreshKey = useRefreshKey();
  const loaded = useLoad(listDevelopers, refreshKey);
  if (role !== "buyer" && role !== "admin") {
    return <Screen><StateView status="empty" title="The directory is for buyers" body="Developers do not browse this list in the app." /></Screen>;
  }
  return (
    <Screen>
      <Title>Developers</Title>
      {loaded.status === "loading" ? <StateView status="loading" title="Loading developers" /> : null}
      {loaded.status === "error" ? <StateView status="error" title="The directory could not be loaded" body={loaded.error || ""} /> : null}
      {loaded.status === "ready" && (loaded.data?.length ?? 0) === 0 ? (
        <StateView status="empty" title="No developers are listed" body="Okavo only lists people whose identity is approved and whose bidding is unlocked. None match right now." />
      ) : null}
      {loaded.status === "ready" && loaded.data && loaded.data.length > 0 ? (
        <Card>
          {loaded.data.map((developer) => (
            <Row
              key={developer.profile_id}
              title={developer.full_name || "Developer"}
              detail={developer.headline || developer.tier || "No headline stored"}
              onPress={() => router.push(`/workspace/developers/${developer.profile_id}`)}
            />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
