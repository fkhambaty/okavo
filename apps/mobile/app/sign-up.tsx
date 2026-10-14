import { useState } from "react";
import { useRouter } from "expo-router";
import { messageFrom, session } from "../src/runtime";
import { Body, Button, Field, Screen, Title } from "../src/ui";

export default function SignUp() {
  const router = useRouter();
  const [role, setRole] = useState<"buyer" | "developer">("buyer");
  const [fullName, setFullName] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await session.signup({
        email: email.trim(),
        password,
        data: { role, full_name: fullName.trim(), organization_name: organization.trim() || fullName.trim() },
      });
      if (result.needs_verification) {
        router.replace({ pathname: "/verify", params: { email: result.email || email.trim() } });
        return;
      }
      setError("The account was not created. No session was started.");
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Create an account</Title>
      <Body>Okavo emails a 6-digit code. The app does not sign you in until that code is confirmed.</Body>
      <Button label={role === "buyer" ? "Joining as a buyer" : "Switch to buyer"} tone={role === "buyer" ? "ink" : "quiet"} onPress={() => setRole("buyer")} />
      <Button label={role === "developer" ? "Joining as a developer" : "Switch to developer"} tone={role === "developer" ? "ink" : "quiet"} onPress={() => setRole("developer")} />
      <Field label="Your name" value={fullName} onChangeText={setFullName} />
      <Field label="Organization" value={organization} onChangeText={setOrganization} />
      <Field label="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Field label="Password" secureTextEntry value={password} onChangeText={setPassword} />
      {error ? <Body>{error}</Body> : null}
      <Button label={busy ? "Sending code" : "Email me a code"} disabled={busy} onPress={() => void submit()} />
    </Screen>
  );
}
