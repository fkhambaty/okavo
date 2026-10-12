import { useEffect, useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import LoadingState from "./LoadingState";
import * as api from "../lib/api";
import { TERMS_VERSION } from "../lib/terms";
import { useAuth } from "../lib/auth";

type GateStatus = "checking" | "needed" | "ok";

/**
 * Ensures signed-in users have accepted the current Terms before using /app.
 * Covers accounts created before acceptance was required.
 *
 * Important: never flash the Terms card while the acceptance check is in flight —
 * that caused a millisecond popup after login when the user had already agreed.
 */
export function TermsGate({ children }: { children: ReactElement }) {
  const { connected, userId } = useAuth();
  const [status, setStatus] = useState<GateStatus>(() =>
    connected && userId ? "checking" : "ok"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connected || !userId) {
      setStatus("ok");
      return;
    }

    let cancelled = false;
    setStatus("checking");

    void api
      .hasAcceptedTerms(TERMS_VERSION)
      .then((accepted) => {
        if (!cancelled) setStatus(accepted ? "ok" : "needed");
      })
      .catch(() => {
        // Fail closed only after the check attempt — still no flash of the card
        // until we know acceptance is required.
        if (!cancelled) setStatus("needed");
      });

    return () => {
      cancelled = true;
    };
  }, [connected, userId]);

  if (!connected || status === "ok") return children;

  if (status === "checking") {
    return <LoadingState compact label="Opening your workspace…" />;
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Accept the Okavo Terms</h1>
        <p>
          Before you continue, confirm you understand Okavo is a marketplace
          intermediary: we do not hold build funds, and we are not a party to
          the contract between buyer and developer.
        </p>
        <p>
          Read the{" "}
          <Link to="/terms" target="_blank" rel="noreferrer">
            Terms of Use
          </Link>{" "}
          (version {TERMS_VERSION}) and{" "}
          <Link to="/privacy" target="_blank" rel="noreferrer">
            Privacy
          </Link>
          .
        </p>
        {error && (
          <div className="callout callout-warn" role="alert">
            <span>!</span>
            <span>{error}</span>
          </div>
        )}
        <button
          type="button"
          className="btn btn-accent btn-block"
          disabled={busy}
          onClick={() => {
            void (async () => {
              setBusy(true);
              setError(null);
              try {
                await api.acceptPlatformTerms(TERMS_VERSION);
                setStatus("ok");
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not record acceptance."
                );
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {busy ? "Saving…" : "I agree — continue to Okavo"}
        </button>
      </div>
    </div>
  );
}
