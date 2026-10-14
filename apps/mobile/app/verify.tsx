import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../src/auth";
import { messageFrom, session } from "../src/runtime";
import { Body, Button, Field, Screen, Title } from "../src/ui";

export default function Verify() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof params.email === "string" ? params.email : "");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await session.verify(email.trim(), code.trim());
      await refreshProfile();
      router.replace("/workspace");
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      await session.resend(email.trim());
      setNotice("If that email is waiting for confirmation, Okavo sent another code.");
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Confirm email</Title>
      <Body>Enter the 6-digit code from Okavo. A wrong or expired code does not open the workspace.</Body>
      <Field label="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Field label="Code" keyboardType="number-pad" value={code} onChangeText={setCode} />
      {notice ? <Body>{notice}</Body> : null}
      {error ? <Body>{error}</Body> : null}
      <Button label={busy ? "Checking" : "Confirm and sign in"} disabled={busy} onPress={() => void confirm()} />
      <Button label="Send another code" tone="quiet" disabled={busy} onPress={() => void resend()} />
    </Screen>
  );
}
