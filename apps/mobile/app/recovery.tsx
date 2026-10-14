import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { messageFrom, session } from "../src/runtime";
import { Body, Button, Field, Screen, Title } from "../src/ui";

export default function Recovery() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof params.email === "string" ? params.email : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await session.recovery(email.trim());
      router.push({ pathname: "/reset", params: { email: email.trim() } });
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Reset password</Title>
      <Body>If the email belongs to a confirmed Okavo account, a reset code is sent. Okavo does not say whether the address exists.</Body>
      <Field label="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      {error ? <Body>{error}</Body> : null}
      <Button label={busy ? "Sending" : "Email a reset code"} disabled={busy} onPress={() => void submit()} />
    </Screen>
  );
}
