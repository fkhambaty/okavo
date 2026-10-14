import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { messageFrom, session } from "../src/runtime";
import { Body, Button, Field, Screen, Title } from "../src/ui";

export default function Reset() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof params.email === "string" ? params.email : "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await session.reset(email.trim(), code.trim(), password);
      router.replace("/sign-in");
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Choose a new password</Title>
      <Body>This signs out every existing session for the account, including this phone, until you sign in again.</Body>
      <Field label="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Field label="Reset code" keyboardType="number-pad" value={code} onChangeText={setCode} />
      <Field label="New password" secureTextEntry value={password} onChangeText={setPassword} />
      {error ? <Body>{error}</Body> : null}
      <Button label={busy ? "Saving" : "Save password"} disabled={busy} onPress={() => void submit()} />
    </Screen>
  );
}
