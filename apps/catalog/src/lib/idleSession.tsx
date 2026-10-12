import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./auth";

/** Signed-in users are logged out after this much continuous inactivity. */
export const IDLE_LOGOUT_MS = 25 * 60 * 1000;

/** Show a stay-signed-in prompt this far before logout. */
export const IDLE_WARN_BEFORE_MS = 60 * 1000;

const WINDOW_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
];

/**
 * Watches for user activity while a Supabase session is live. Warns one minute
 * before logout, then signs out and sends them to /signin with a notice.
 */
export function IdleSessionGuard() {
  const { userId, signOut } = useAuth();
  const navigate = useNavigate();
  const lastActivity = useRef(Date.now());
  const signingOut = useRef(false);
  const [warn, setWarn] = useState(false);

  useEffect(() => {
    if (!userId) {
      signingOut.current = false;
      setWarn(false);
      return;
    }

    lastActivity.current = Date.now();
    setWarn(false);

    const markActive = () => {
      if (document.visibilityState === "hidden") return;
      lastActivity.current = Date.now();
      setWarn(false);
    };

    for (const event of WINDOW_EVENTS) {
      window.addEventListener(event, markActive, { passive: true });
    }
    document.addEventListener("visibilitychange", markActive);

    const tick = window.setInterval(() => {
      if (signingOut.current) return;
      const idleFor = Date.now() - lastActivity.current;
      if (idleFor >= IDLE_LOGOUT_MS) {
        signingOut.current = true;
        setWarn(false);
        void (async () => {
          try {
            sessionStorage.setItem(
              "okavo.auth.notice",
              "Signed out after 25 minutes of inactivity."
            );
          } catch {
            // Private mode — still sign out.
          }
          await signOut("idle");
          navigate("/signin", { replace: true });
        })();
        return;
      }
      setWarn(idleFor >= IDLE_LOGOUT_MS - IDLE_WARN_BEFORE_MS);
    }, 5_000);

    return () => {
      window.clearInterval(tick);
      for (const event of WINDOW_EVENTS) {
        window.removeEventListener(event, markActive);
      }
      document.removeEventListener("visibilitychange", markActive);
    };
  }, [userId, signOut, navigate]);

  if (!warn) return null;

  return (
    <div
      className="idle-dialog"
      role="alertdialog"
      aria-labelledby="idle-warn-title"
      aria-describedby="idle-warn-body"
    >
      <strong id="idle-warn-title">Still there?</strong>
      <p id="idle-warn-body">
        You will be signed out in about a minute for inactivity. Move the mouse
        or press a key to stay signed in.
      </p>
      <button
        type="button"
        className="btn btn-accent"
        onClick={() => {
          lastActivity.current = Date.now();
          setWarn(false);
        }}
      >
        Stay signed in
      </button>
    </div>
  );
}
