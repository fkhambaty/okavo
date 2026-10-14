import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";

const RefreshContext = createContext(0);

export function ForegroundRefresh({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") setTick((value) => value + 1);
    });
    const note = Notifications.addNotificationReceivedListener(() => {
      setTick((value) => value + 1);
    });
    return () => {
      app.remove();
      note.remove();
    };
  }, []);
  return <RefreshContext.Provider value={tick}>{children}</RefreshContext.Provider>;
}

export function useRefreshKey(): number {
  return useContext(RefreshContext);
}
