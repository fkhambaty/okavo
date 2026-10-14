import { useEffect } from "react";
import { Archivo_700Bold } from "@expo-google-fonts/archivo/700Bold";
import { Archivo_800ExtraBold } from "@expo-google-fonts/archivo/800ExtraBold";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { classifyLink } from "@okavo/core";
import { AuthProvider } from "../src/auth";
import { theme } from "../src/theme";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const router = useRouter();
  const url = Linking.useURL();
  const [fontsLoaded] = useFonts({
    Archivo_700Bold,
    Archivo_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded]);

  useEffect(() => {
    if (!url) return;
    const decision = classifyLink(url);
    if (decision.kind === "native") router.push(decision.path);
    if (decision.kind === "legal") router.push(`/legal/${decision.page}`);
  }, [router, url]);

  if (!fontsLoaded) return null;

  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.paper },
          headerTintColor: theme.ink,
          headerTitleStyle: { fontFamily: "Archivo_700Bold" },
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ title: "Sign in" }} />
        <Stack.Screen name="sign-up" options={{ title: "Create account" }} />
        <Stack.Screen name="verify" options={{ title: "Confirm email" }} />
        <Stack.Screen name="recovery" options={{ title: "Reset password" }} />
        <Stack.Screen name="reset" options={{ title: "Choose a password" }} />
        <Stack.Screen name="legal/[page]" options={{ title: "Okavo" }} />
        <Stack.Screen name="workspace" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  );
}
