import { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "./theme";

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen} edges={["bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Display({ children }: { children: ReactNode }) {
  return <Text style={styles.display}>{children}</Text>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Body({ children }: { children: ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Banner({ children }: { children: ReactNode }) {
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.bannerText}>{children}</Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  disabled,
  tone = "ink",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "ink" | "accent" | "quiet";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === "accent" ? styles.buttonAccent : tone === "quiet" ? styles.buttonQuiet : styles.buttonInk,
        disabled ? styles.buttonDisabled : null,
        pressed && !disabled ? styles.pressed : null,
      ]}
    >
      <Text style={[styles.buttonText, tone === "quiet" ? styles.buttonTextQuiet : null]}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  ...input
}: { label: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.faint}
        style={styles.input}
        {...input}
      />
    </View>
  );
}

export function StateView({
  status,
  title,
  body,
}: {
  status: "loading" | "empty" | "error";
  title: string;
  body?: string;
}) {
  return (
    <Card>
      {status === "loading" ? <ActivityIndicator color={theme.accentDeep} /> : null}
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </Card>
  );
}

export function Row({ title, detail, onPress }: { title: string; detail?: string; onPress?: () => void }) {
  const content = (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>{title}</Text>
      {detail ? <Text style={styles.muted}>{detail}</Text> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={styles.rowPress}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  display: {
    fontFamily: theme.displayStrong,
    fontSize: 36,
    letterSpacing: -1.2,
    color: theme.ink,
  },
  title: { fontFamily: theme.display, fontSize: 22, letterSpacing: -0.4, color: theme.ink },
  body: { fontFamily: theme.sans, fontSize: 16, lineHeight: 24, color: theme.body },
  muted: { fontFamily: theme.sans, fontSize: 14, lineHeight: 20, color: theme.muted },
  card: {
    backgroundColor: theme.surface,
    borderColor: theme.line,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  banner: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accent,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  bannerText: { fontFamily: theme.sansMedium, fontSize: 15, lineHeight: 22, color: theme.accentInk },
  button: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  buttonInk: { backgroundColor: theme.ink },
  buttonAccent: { backgroundColor: theme.accent },
  buttonQuiet: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.lineStrong },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { fontFamily: theme.sansSemi, fontSize: 16, color: theme.onInk },
  buttonTextQuiet: { color: theme.ink },
  pressed: { opacity: 0.82 },
  field: { gap: 6 },
  label: { fontFamily: theme.sansMedium, fontSize: 13, letterSpacing: 0.4, color: theme.muted, textTransform: "uppercase" },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: theme.lineStrong,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontFamily: theme.sans,
    fontSize: 16,
    color: theme.ink,
    backgroundColor: theme.paper,
  },
  row: { gap: 4, paddingVertical: 8 },
  rowPress: { minHeight: 48, justifyContent: "center" },
  rowTitle: { fontFamily: theme.sansSemi, fontSize: 16, color: theme.ink },
});
