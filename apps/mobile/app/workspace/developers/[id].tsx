import { useLocalSearchParams } from "expo-router";
import { developerListing } from "../../../src/calls";
import { useRefreshKey } from "../../../src/refresh";
import { useLoad } from "../../../src/useLoad";
import { Body, Card, Muted, Screen, StateView, Title } from "../../../src/ui";

export default function DeveloperProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const refreshKey = useRefreshKey();
  const loaded = useLoad(() => developerListing(String(id || "")), refreshKey);
  const developer = loaded.data;
  return (
    <Screen>
      {loaded.status === "loading" ? <StateView status="loading" title="Loading developer" /> : null}
      {loaded.status === "error" ? <StateView status="error" title="This profile could not be loaded" body={loaded.error || ""} /> : null}
      {loaded.status === "ready" && !developer ? <StateView status="empty" title="No public profile" body="Okavo did not return a developer for this link." /> : null}
      {developer ? (
        <Card>
          <Title>{developer.full_name || "Developer"}</Title>
          <Body>{developer.headline || "No headline is stored."}</Body>
          <Muted>{`Tier ${developer.tier || "not recorded"}`}</Muted>
          <Muted>{`Identity ${developer.identity_status || "not recorded"}`}</Muted>
          <Muted>{developer.rating == null ? "No rating is stored." : `Rating ${developer.rating}`}</Muted>
          <Muted>{`Reviews ${developer.review_count ?? 0}`}</Muted>
          <Muted>{`Completed contracts ${developer.contracts_delivered ?? 0}`}</Muted>
        </Card>
      ) : null}
    </Screen>
  );
}
