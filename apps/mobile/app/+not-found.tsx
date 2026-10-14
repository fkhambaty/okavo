import { classifyLink } from "@okavo/core";
import * as Linking from "expo-linking";
import { Redirect } from "expo-router";
import { Body, Screen, Title } from "../src/ui";

export default function NotFound() {
  const url = Linking.useURL();
  if (url) {
    const decision = classifyLink(url);
    if (decision.kind === "native") return <Redirect href={decision.path} />;
    if (decision.kind === "legal") return <Redirect href={`/legal/${decision.page}`} />;
  }
  return (
    <Screen>
      <Title>That screen is not in the app</Title>
      <Body>Okavo did not open an outside page. Use the menu for the workspace, or the legal links on the home screen.</Body>
    </Screen>
  );
}
