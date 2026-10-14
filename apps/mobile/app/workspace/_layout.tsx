import { Pressable, Text } from "react-native";
import { Redirect, Stack, useRouter } from "expo-router";
import { useAuth } from "../../src/auth";
import { ForegroundRefresh } from "../../src/refresh";
import { theme } from "../../src/theme";
import { Screen, StateView } from "../../src/ui";

export default function WorkspaceLayout() {
  const { ready, profile } = useAuth();
  const router = useRouter();
  if (!ready) {
    return (
      <Screen>
        <StateView status="loading" title="Loading your workspace" />
      </Screen>
    );
  }
  if (!profile) return <Redirect href="/" />;
  return (
    <ForegroundRefresh>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.paper },
          headerTintColor: theme.ink,
          headerTitleStyle: { fontFamily: "Archivo_700Bold" },
          contentStyle: { backgroundColor: theme.bg },
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Menu" onPress={() => router.push("/workspace/menu")} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}>
              <Text style={{ fontFamily: "Inter_600SemiBold", color: theme.ink, fontSize: 16 }}>Menu</Text>
            </Pressable>
          ),
        }}
      >
        <Stack.Screen name="index" options={{ title: "Okavo" }} />
        <Stack.Screen name="menu" options={{ title: "Menu" }} />
      </Stack>
    </ForegroundRefresh>
  );
}
