import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { logAudit } from "./audit";
import { backend, isBackendConfigured } from "./backend";
import {
  onMemorySessionChange,
  receptionistSignIn,
  receptionistSignOut,
  receptionistSignUp,
  refreshMemorySession,
  requestPasswordRecovery,
  resendSignupVerification,
  resetPasswordWithCode,
  type Session,
  updateAccountPassword,
  verifySignupCode,
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
  const base = import.meta.env.VITE_OKAVO_API_URL;
  if (!base) return;
  try {
    await fetch(`${base.replace(/\/$/, "")}/v1/health`);
  } catch {
    // Signup mail is sent by the Worker. This ping must not block the form.
  }
  void details;
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
  verifyEmail: (email: string, code: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  completeReset: (email: string, code: string, password: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  pendingVerification: string | null;
  demoSignIn: (role: Exclude<Role, "guest">, name: string) => void;
  clearMessages: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);
const DEMO_SESSION_KEY = "okavo.demo.session";

type DemoSession = {
  role: Exclude<Role, "guest">;
  displayName: string;
};

function readDemoSession(): DemoSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DEMO_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DemoSession>;
    if (
      (parsed.role === "buyer" ||
        parsed.role === "developer" ||
        parsed.role === "admin") &&
      typeof parsed.displayName === "string"
    ) {
      return { role: parsed.role, displayName: parsed.displayName };
    }
  } catch {
    // A blocked or malformed session store should behave like a signed-out tab.
  }
  return null;
}

const SCALE_TO_DB: Record<BuyerScale, string> = {
  "Local business": "local_business",
  SMB: "smb",
  Startup: "startup",
  Enterprise: "enterprise",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initialDemoSession] = useState(readDemoSession);
  const [ready, setReady] = useState(!isBackendConfigured);
  const [pendingVerification, setPendingVerification] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [demoMode, setDemoMode] = useState(Boolean(initialDemoSession));
  const [role, setRole] = useState<Role>(initialDemoSession?.role ?? "guest");
  const [displayName, setDisplayName] = useState(
    initialDemoSession?.displayName ?? ""
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  /**
   * Creates the profile rows on first authenticated load. Doing it here rather
   * than during sign-up means it still works when email confirmation is on and
   * no session exists at sign-up time.
   */
  const ensureProfile = useCallback(async (_activeSession: Session) => {
    try {
      const { profile } = await backend<{
        profile: { role: string; full_name: string };
      }>("/v1/me");
      const storedRole = profile.role;
      setRole(
        storedRole === "developer" || storedRole === "admin" ? storedRole : "buyer"
      );
      setDisplayName(profile.full_name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load your profile.");
    }
  }, []);

  useEffect(() => {
    if (demoMode) {
      setReady(true);
      return;
    }
    if (!isBackendConfigured) {
      setReady(true);
      return;
    }

    const recovery =
      new URLSearchParams(window.location.search).get("recovery") === "1";
    if (recovery) setPasswordRecovery(true);
    let cancelled = false;
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

    // Stay on the loading screen until the profile role is known. Marking
    // ready while the role is still guest sends a signed-in refresh to the
    // public homepage.
    refreshMemorySession()
      .then(async (nextSession) => {
        if (cancelled || !nextSession) return;
        await ensureProfile(nextSession);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [demoMode, ensureProfile]);

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
        setPendingVerification(input.email);
        setNotice(
          `We sent a 6-digit confirmation code to ${input.email}. Enter it to finish creating the account.`
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
      setNotice(`Verification code sent again to ${email}.`);
    } catch (resendError) {
      setError(
        resendError instanceof Error
          ? resendError.message
          : "Could not resend the verification code."
      );
    }
  }, []);

  const verifyEmail = useCallback(async (email: string, code: string) => {
    setError(null);
    setNotice(null);
    try {
      await verifySignupCode(email, code);
      setPendingVerification(null);
      setNotice("Email confirmed. You are signed in.");
    } catch (verifyError) {
      setError(
        verifyError instanceof Error ? verifyError.message : "That code did not work."
      );
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    setError(null);
    setNotice(null);
    try {
      await requestPasswordRecovery(email);
      setPasswordRecovery(true);
      setNotice(
        `If an account exists for ${email}, we sent a 6-digit code to choose a new password.`
      );
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "Password reset failed."
      );
    }
  }, []);

  const completeReset = useCallback(async (email: string, code: string, password: string) => {
    setError(null);
    setNotice(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    try {
      await resetPasswordWithCode(email, code, password);
      setPasswordRecovery(false);
      setNotice("Password updated. Sign in with the new password.");
    } catch (resetError) {
      setError(
        resetError instanceof Error ? resetError.message : "Could not reset your password."
      );
    }
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    setError(null);
    setNotice(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
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
    if (!demoMode) {
      await receptionistSignOut();
    }
    try {
      window.sessionStorage.removeItem(DEMO_SESSION_KEY);
    } catch {
      // State still clears when storage is unavailable.
    }
    setSession(null);
    setDemoMode(false);
    setRole("guest");
    setDisplayName("");
  }, [demoMode]);

  const demoSignIn = useCallback(
    (nextRole: Exclude<Role, "guest">, name: string) => {
      try {
        window.sessionStorage.setItem(
          DEMO_SESSION_KEY,
          JSON.stringify({ role: nextRole, displayName: name })
        );
      } catch {
        // The in-memory demo still works when storage is unavailable.
      }
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
      connected: isBackendConfigured,
      pendingVerification,
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
      verifyEmail,
      resetPassword,
      completeReset,
      updatePassword,
      demoSignIn,
      clearMessages,
    }),
    [
      ready,
      pendingVerification,
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
      verifyEmail,
      resetPassword,
      completeReset,
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
