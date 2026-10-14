import { useState } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "../src/auth";
import { messageFrom, session } from "../src/runtime";
import { Body, Button, Field, Screen, Title } from "../src/ui";

export default function SignIn() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await session.login(email.trim(), password);
      await refreshProfile();
      router.replace("/workspace");
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Sign in</Title>
      <Body>Use the email and password for your Okavo account. A code is required before the first sign-in.</Body>
      <Field label="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Field label="Password" secureTextEntry autoComplete="password" value={password} onChangeText={setPassword} />
      {error ? <Body>{error}</Body> : null}
      <Button label={busy ? "Signing in" : "Sign in"} disabled={busy} onPress={() => void submit()} />
      <Button label="I need a confirmation code" tone="quiet" onPress={() => router.push({ pathname: "/verify", params: { email } })} />
      <Button label="I forgot my password" tone="quiet" onPress={() => router.push({ pathname: "/recovery", params: { email } })} />
    </Screen>
  );
}
