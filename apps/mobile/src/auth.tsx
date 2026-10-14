import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isWorkspaceRole, type Profile, type WorkspaceRole } from "@okavo/core";
import { loadProfile, messageFrom, session } from "./runtime";

type AuthValue = {
  ready: boolean;
  profile: Profile | null;
  role: WorkspaceRole | null;
  error: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshProfile(): Promise<void> {
    const next = await loadProfile();
    if (!isWorkspaceRole(next.role)) {
      throw new Error("This account does not have a buyer, developer, or admin role.");
    }
    setProfile(next);
    setError(null);
  }

  useEffect(() => {
    let live = true;
    session
      .restore()
      .then(async (restored) => {
        if (!live) return;
        if (!restored) {
          setProfile(null);
          return;
        }
        await refreshProfile();
      })
      .catch((cause: unknown) => {
        if (live) setError(messageFrom(cause));
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      ready,
      profile,
      role: profile && isWorkspaceRole(profile.role) ? profile.role : null,
      error,
      refreshProfile,
      signOut: async () => {
        await session.logout();
        setProfile(null);
        setError(null);
      },
    }),
    [ready, profile, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is missing.");
  return value;
}
