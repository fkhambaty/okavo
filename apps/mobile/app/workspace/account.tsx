import { useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { ACCOUNT_DELETION_PHRASE, confirmationMatches } from "@okavo/core";
import { useAuth } from "../../src/auth";
import { changePassword, deleteAccount } from "../../src/calls";
import { messageFrom } from "../../src/runtime";
import { Body, Button, Field, Screen, Title } from "../../src/ui";

export default function Account() {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [action, setAction] = useState<null | "password" | "delete">(null);

  async function save() {
    setAction("password");
    setError(null);
    try {
      await changePassword(password);
      await signOut();
      setNotice("The password changed and every session was revoked. Sign in again.");
      router.replace("/sign-in");
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setAction(null);
    }
  }

  async function removeAccount() {
    if (!confirmationMatches(phrase)) return;
    setAction("delete");
    setError(null);
    try {
      const mode = await deleteAccount(deletePassword, phrase);
      const sentence =
        mode === "anonymized"
          ? "Your sign-in was removed. Contracts, bids, payments, and audit records stay, without your name or email."
          : "Your account, sessions, and private files were deleted.";
      Alert.alert("Account closed", sentence);
      await signOut();
      router.replace("/");
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setAction(null);
    }
  }

  const phraseReady = confirmationMatches(phrase) && deletePassword.length >= 8;

  return (
    <Screen>
      <Title>Account</Title>
      <Body>{profile?.email}</Body>
      <Body>{`Role ${profile?.role || "not recorded"}`}</Body>
      <Field label="New password" secureTextEntry value={password} onChangeText={setPassword} />
      {notice ? <Body>{notice}</Body> : null}
      {error ? <Body>{error}</Body> : null}
      <Button
        label={action === "password" ? "Saving" : "Change password and sign out everywhere"}
        disabled={action !== null}
        onPress={() => void save()}
      />
      <Button label="Sign out this phone" tone="quiet" disabled={action !== null} onPress={() => void signOut().then(() => router.replace("/"))} />
      <Title>Delete account</Title>
      <Body>
        {`Closing the account requires your current password and the exact phrase ${ACCOUNT_DELETION_PHRASE}. Okavo deletes your sign-in, sessions, and private files. If a contract, bid, payment, review, dispute, or other shared record exists, that record stays and your name and email are removed from it.`}
      </Body>
      <Field label="Current password" secureTextEntry value={deletePassword} onChangeText={setDeletePassword} />
      <Field
        label={`Type ${ACCOUNT_DELETION_PHRASE}`}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        value={phrase}
        onChangeText={setPhrase}
      />
      <Button
        label={action === "delete" ? "Deleting" : "Delete account"}
        disabled={action !== null || !phraseReady}
        onPress={() => void removeAccount()}
      />
    </Screen>
  );
}
