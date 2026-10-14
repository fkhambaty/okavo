import { useRouter } from "expo-router";
import { navForRole } from "@okavo/core";
import { useAuth } from "../../src/auth";
import { Body, Button, Card, Muted, Row, Screen, Title } from "../../src/ui";

export default function Menu() {
  const { role, profile, signOut } = useAuth();
  const router = useRouter();
  if (!role || !profile) return null;
  const items = navForRole(role);
  return (
    <Screen>
      <Title>{profile.full_name || profile.email}</Title>
      <Muted>{role}</Muted>
      <Card>
        {items.map((item) => (
          <Row key={item.href} title={item.label} onPress={() => router.push(item.href)} />
        ))}
      </Card>
      <Body>Signing out revokes this phone’s access token and refresh token on Okavo’s server.</Body>
      <Button label="Sign out" tone="quiet" onPress={() => void signOut().then(() => router.replace("/"))} />
    </Screen>
  );
}
