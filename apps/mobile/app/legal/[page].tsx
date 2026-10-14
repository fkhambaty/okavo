import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { WebView } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";
import { allowLegalWebView, LEGAL_PAGES, type LegalPage } from "@okavo/core";
import { Body, Screen, Title } from "../../src/ui";

function isLegalPage(value: string): value is LegalPage {
  return (LEGAL_PAGES as readonly string[]).includes(value);
}

export default function LegalPageScreen() {
  const params = useLocalSearchParams<{ page?: string }>();
  const page = typeof params.page === "string" ? params.page : "";
  const initial = isLegalPage(page) ? `https://okavo.org/${page}` : "";
  const [blocked, setBlocked] = useState<string | null>(initial ? null : "That page is not an Okavo legal page.");

  function onRequest(request: ShouldStartLoadRequest): boolean {
    if (request.url === "about:blank" || request.isTopFrame === false) return true;
    const decision = allowLegalWebView(request.url);
    if (!decision.allow) {
      setBlocked(decision.reason);
      return false;
    }
    return true;
  }

  if (!initial || blocked) {
    return (
      <Screen>
        <Title>Page blocked</Title>
        <Body>{blocked || "That page is not available in the app."}</Body>
      </Screen>
    );
  }

  return (
    <WebView
      source={{ uri: initial }}
      originWhitelist={["https://okavo.org"]}
      onShouldStartLoadWithRequest={onRequest}
      setSupportMultipleWindows={false}
      sharedCookiesEnabled={false}
      thirdPartyCookiesEnabled={false}
    />
  );
}
