import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { logAudit } from "./audit";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import {
  onMemorySessionChange,
  receptionistSignIn,
  receptionistSignOut,
  receptionistSignUp,
  refreshMemorySession,
  requestPasswordRecovery,
  resendSignupVerification,
  updateAccountPassword,
} from "./sessionClient";
import type { BuyerScale, Role } from "../types";

type SignUpInput = {
  email: string;
  password: string;
  role: Exclude<Role, "guest">;
  fullName: string;
  organizationName?: string;
  scale?: BuyerScale;
};

async function notifySupportOfSignup(details: {
  email: string;
  role: string;
  full_name: string;
  organization_name: string;
  user_id?: string;
}) {
  const base = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const secret = import.meta.env.VITE_OKAVO_NOTIFY_SECRET;
  if (!base || !anon || !secret) return;

  try {
    await fetch(`${base}/functions/v1/notify-signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anon}`,
        apikey: anon,
        "x-okavo-notify": secret,
      },
      body: JSON.stringify(details),
    });
  } catch {
    // Never block signup if the support alert fails.
  }
}

type AuthValue = {
  ready: boolean;
  connected: boolean;
  demoMode: boolean;
  userId: string | null;
  email: string | null;
  role: Role;
  displayName: string;
  emailVerified: boolean;
  error: string | null;
  notice: string | null;
  passwordRecovery: boolean;
  signUp: (input: SignUpInput) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: (reason?: "manual" | "idle") => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  demoSignIn: (role: Exclude<Role, "guest">, name: string) => void;
  clearMessages: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

const SCALE_TO_DB: Record<BuyerScale, string> = {
  "Local business": "local_business",
  SMB: "smb",
  Startup: "startup",
  Enterprise: "enterprise",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [role, setRole] = useState<Role>("guest");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  /**
   * Creates the profile rows on first authenticated load. Doing it here rather
   * than during sign-up means it still works when email confirmation is on and
   * no session exists at sign-up time.
   */
  const ensureProfile = useCallback(async (activeSession: Session) => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { user } = activeSession;
    const meta = user.user_metadata ?? {};
    const metaRole = meta.role;
    // Never accept admin from the client. Admin is granted only in the database.
    const desiredRole: Exclude<Role, "guest" | "admin"> =
      metaRole === "developer" ? "developer" : "buyer";
    const fullName = (meta.full_name as string) || user.email || "Okavo user";

    const { data: existing, error: readError } = await supabase
      .from("profiles")
      .select("id, role, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (readError) {
      setError(readError.message);
      return;
    }

    if (!existing) {
      const { error: insertError } = await supabase.from("profiles").insert({
        id: user.id,
        role: desiredRole,
        full_name: fullName,
        email: user.email,
      });
      if (insertError) {
        setError(insertError.message);
        return;
      }

      if (desiredRole === "buyer") {
        await supabase.from("buyer_profiles").insert({
          profile_id: user.id,
          organization_name:
            (meta.organization_name as string) || fullName,
          scale: (meta.scale as string) || "local_business",
        });
      } else if (desiredRole === "developer") {
        await supabase.from("developer_profiles").insert({
          profile_id: user.id,
          headline: "",
          tier: "applicant",
        });
      }

      setRole(desiredRole);
      setDisplayName(fullName);
      return;
    }

    const storedRole = existing.role;
    setRole(
      storedRole === "developer" || storedRole === "admin" ? storedRole : "buyer"
    );
    setDisplayName(existing.full_name);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setReady(true);
      return;
    }

    const recovery =
      new URLSearchParams(window.location.search).get("recovery") === "1";
    if (recovery) setPasswordRecovery(true);
    getSupabase();

    const unsubscribe = onMemorySessionChange((nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        setDemoMode(false);
        void ensureProfile(nextSession);
      } else {
        setRole("guest");
        setDisplayName("");
        if (!recovery) setPasswordRecovery(false);
      }
    });

    refreshMemorySession().finally(() => setReady(true));

    return unsubscribe;
  }, [ensureProfile]);

  const signUp = useCallback(async (input: SignUpInput) => {
    setError(null);
    setNotice(null);
    try {
      const data = await receptionistSignUp({
        email: input.email,
        password: input.password,
        data: {
          role: input.role,
          full_name: input.fullName,
          organization_name: input.organizationName ?? input.fullName,
          scale: input.scale ? SCALE_TO_DB[input.scale] : "local_business",
        },
      });

      void notifySupportOfSignup({
        email: input.email,
        role: input.role,
        full_name: input.fullName,
        organization_name: input.organizationName ?? input.fullName,
        user_id: data.user?.id,
      });

      if (data.session) {
        logAudit("auth.sign_up", "session", data.user?.id ?? null, {
          role: input.role,
        });
      } else {
        setNotice(
          `We sent a verification link to ${input.email}. Confirm the address, then sign in.`
        );
      }
    } catch (signUpError) {
      setError(
        signUpError instanceof Error ? signUpError.message : "Sign up failed."
      );
    }
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    setError(null);
    setNotice(null);
    try {
      await resendSignupVerification(email);
      setNotice(`Verification link sent again to ${email}.`);
    } catch (resendError) {
      setError(
        resendError instanceof Error
          ? resendError.message
          : "Could not resend the verification link."
      );
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    setError(null);
    setNotice(null);
    try {
      await requestPasswordRecovery(email);
      setNotice(
        `If an account exists for ${email}, we sent a link to choose a new password.`
      );
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "Password reset failed."
      );
    }
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    setError(null);
    setNotice(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    try {
      await updateAccountPassword(password);
      setPasswordRecovery(false);
      setNotice("Password updated. You are signed in.");
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not update your password."
      );
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    setNotice(null);
    try {
      await receptionistSignIn(email, password);
      logAudit("auth.sign_in", "session", null, { email });
    } catch (signInError) {
      setError(
        signInError instanceof Error ? signInError.message : "Sign in failed."
      );
    }
  }, []);

  const signOut = useCallback(async (reason: "manual" | "idle" = "manual") => {
    logAudit(
      reason === "idle" ? "auth.idle_logout" : "auth.sign_out",
      "session",
      null
    );
    await receptionistSignOut();
    setSession(null);
    setDemoMode(false);
    setRole("guest");
    setDisplayName("");
  }, []);

  const demoSignIn = useCallback(
    (nextRole: Exclude<Role, "guest">, name: string) => {
      setDemoMode(true);
      setRole(nextRole);
      setDisplayName(name);
    },
    []
  );

  const clearMessages = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      connected: isSupabaseConfigured,
      demoMode,
      userId: session?.user.id ?? null,
      email: session?.user.email ?? null,
      role,
      displayName,
      emailVerified: Boolean(
        session?.user.email_confirmed_at ?? session?.user.confirmed_at
      ),
      error,
      notice,
      passwordRecovery,
      signUp,
      signIn,
      signOut,
      resendVerification,
      resetPassword,
      updatePassword,
      demoSignIn,
      clearMessages,
    }),
    [
      ready,
      session,
      demoMode,
      role,
      displayName,
      error,
      notice,
      passwordRecovery,
      signUp,
      signIn,
      signOut,
      resendVerification,
      resetPassword,
      updatePassword,
      demoSignIn,
      clearMessages,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
