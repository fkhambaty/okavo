import { Image, Pressable, Text, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { LEGAL_PAGES } from "@okavo/core";
import { useAuth } from "../src/auth";
import { theme } from "../src/theme";
import { Body, Button, Display, Muted, Screen, StateView } from "../src/ui";

const labels: Record<(typeof LEGAL_PAGES)[number], string> = {
  terms: "Terms",
  privacy: "Privacy",
  security: "Security",
  guarantee: "What Okavo does not guarantee",
  "how-it-works": "How it works",
  faq: "FAQ",
  about: "About",
};

export default function Home() {
  const { ready, profile, error } = useAuth();
  const router = useRouter();
  if (!ready) return <Screen><StateView status="loading" title="Opening Okavo" /></Screen>;
  if (profile) return <Redirect href="/workspace" />;

  return (
    <Screen>
      <Image source={require("../assets/images/icon.png")} style={{ width: 88, height: 88, borderRadius: 20 }} accessibilityLabel="Okavo" />
      <Display>Okavo</Display>
      <Body>Buyers lock a software scope. Identity-checked developers bid on that scope. Okavo does not hold the build money.</Body>
      {error ? <StateView status="error" title="The saved session could not be restored" body={error} /> : null}
      <Button label="Sign in" onPress={() => router.push("/sign-in")} />
      <Button label="Create account" tone="quiet" onPress={() => router.push("/sign-up")} />
      <Muted>The demo login on the website stays in the browser. This app only signs in through Okavo accounts.</Muted>
      <View style={{ gap: 8 }}>
        {LEGAL_PAGES.map((page) => (
          <Pressable key={page} accessibilityRole="link" accessibilityLabel={labels[page]} onPress={() => router.push(`/legal/${page}`)} style={{ minHeight: 44, justifyContent: "center" }}>
            <Text style={{ fontFamily: theme.sansMedium, color: theme.accentInk, fontSize: 16 }}>{labels[page]}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
