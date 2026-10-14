import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import Logo from "../components/Logo";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "../brand";
import { acceptPlatformTerms } from "../lib/api";
import { useAuth } from "../lib/auth";
import { TERMS_VERSION } from "../lib/terms";
import type { BuyerScale, Role } from "../types";

type Mode = "signin" | "signup";

const BUYER_POINTS = [
  "Describe the outcome in plain language, then sign the scope before anyone builds.",
  "Developers bid only after a person has checked their identity.",
  "Okavo does not hold build money or guarantee the other party’s performance.",
];

function AuthFrame({
  kicker,
  title,
  points,
  children,
}: {
  kicker: string;
  title: string;
  points: string[];
  children: ReactNode;
}) {
  return (
    <div className="auth-screen">
      <div className="auth-layout">
        <aside className="auth-aside">
          <Link to="/" className="auth-brand">
            <Logo />
          </Link>
          <p className="auth-aside-kicker">{kicker}</p>
          <h2>{title}</h2>
          <ul>
            {points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </aside>
        <div className="auth-card">{children}</div>
      </div>
    </div>
  );
}

export default function SignIn() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [role, setRole] = useState<Exclude<Role, "guest">>("buyer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [organization, setOrganization] = useState("");
  const [scale] = useState<BuyerScale>("Local business");
  const [busy, setBusy] = useState(false);
  const [idleNotice, setIdleNotice] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("okavo.auth.notice");
      if (stored) {
        sessionStorage.removeItem("okavo.auth.notice");
        setIdleNotice(stored);
      }
    } catch {
      // Ignore storage errors.
    }
  }, []);

  // Stay on this screen while submit finishes (incl. recording terms), so
  // TermsGate on /app does not race a half-written acceptance.
  if (auth.role !== "guest" && !auth.passwordRecovery && !busy) {
    return <Navigate to="/app" replace />;
  }

  const previewVerification =
    new URLSearchParams(window.location.search).get("verify") === "1";
  const notice = auth.notice ?? idleNotice;

  async function submit() {
    setBusy(true);
    if (!acceptedTerms) {
      setBusy(false);
      return;
    }
    if (
      mode === "signin" &&
      email.trim().toLowerCase() === "dummy" &&
      password === "dummy"
    ) {
      auth.demoSignIn("buyer", "Dummy Buyer");
      setBusy(false);
      return;
    }
    if (!auth.connected) {
      auth.demoSignIn(
        role,
        (role === "buyer" ? organization : fullName).trim() ||
          (role === "buyer" ? "Rose Street Bakery" : "Arjun Mehta")
      );
      setBusy(false);
      return;
    }

    if (mode === "signin") {
      await auth.signIn(email.trim(), password);
      try {
        await acceptPlatformTerms(TERMS_VERSION);
      } catch {
        // Profile may not exist yet; TermsGate in /app will require acceptance.
      }
    } else {
      await auth.signUp({
        email: email.trim(),
        password,
        role,
        fullName: fullName.trim() || email.trim(),
        organizationName: organization.trim() || fullName.trim(),
        scale,
      });
      try {
        await acceptPlatformTerms(TERMS_VERSION);
      } catch {
        // Same as above.
      }
    }
    setBusy(false);
  }

  async function requestReset() {
    if (!email.trim()) return;
    setBusy(true);
    await auth.resetPassword(email.trim());
    setBusy(false);
  }

  if (auth.passwordRecovery) {
    return (
      <AuthFrame
        kicker="Account"
        title="Choose a new password."
        points={[
          `This replaces the password for ${email || auth.email || "your account"}.`,
          "Use the 6-digit code from the email and a password of at least 8 characters.",
        ]}
      >
          <h1>Choose a new password</h1>
          <p>Enter the code we emailed and a new password.</p>

          <div className="field">
            <label htmlFor="resetCode">Reset code</label>
            <input
              id="resetCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="6-digit code"
            />
          </div>

          <div className="field">
            <label htmlFor="newPassword">New password</label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="At least 8 characters"
            />
          </div>

          {auth.error && (
            <div className="callout callout-warn">
              <span>!</span>
              <span>{auth.error}</span>
            </div>
          )}

          {notice && (
            <div className="callout callout-ok">
              <span>✓</span>
              <span>{notice}</span>
            </div>
          )}

          <button
            type="button"
            className="btn btn-block btn-lg"
            onClick={() => {
              setBusy(true);
              void auth.completeReset(email.trim(), code.trim(), newPassword).finally(() =>
                setBusy(false)
              );
            }}
            disabled={busy || newPassword.length < 8 || code.trim().length < 6}
          >
            {busy ? "Working…" : "Save password"}
          </button>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      kicker="Okavo"
      title="Sign the scope before anyone writes code."
      points={BUYER_POINTS}
    >
        <h1>{mode === "signin" ? "Sign in to Okavo" : "Create your account"}</h1>
        <p>
          {auth.connected
            ? "Accounts are confirmed with an email code before they can sign in."
            : "Demo mode — the live account service is not configured in this build."}
        </p>
        <p className="auth-step">1 · Account</p>

        {auth.connected && (
          <div className="tabs">
            <button
              type="button"
              className={mode === "signin" ? "tab active" : "tab"}
              onClick={() => {
                setMode("signin");
                auth.clearMessages();
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === "signup" ? "tab active" : "tab"}
              onClick={() => {
                setMode("signup");
                auth.clearMessages();
              }}
            >
              Create account
            </button>
          </div>
        )}

        {(mode === "signup" || !auth.connected) && (
          <>
          <p className="auth-step">2 · Which side</p>
          <div className="role-choice">
            <button
              type="button"
              className={`role-option${role === "buyer" ? " selected" : ""}`}
              onClick={() => setRole("buyer")}
            >
              <span className="radio" />
              <span>
                <strong>I need software built</strong>
                <span>
                  Post a requirement, lock the contract, review bids and hire.
                </span>
              </span>
            </button>

            <button
              type="button"
              className={`role-option${role === "developer" ? " selected" : ""}`}
              onClick={() => setRole("developer")}
            >
              <span className="radio" />
              <span>
                <strong>I build software</strong>
                <span>
                  Verify identity and pass the build exam. Bidding activation stays unavailable
                  until Okavo&apos;s separate marketplace payment account is approved.
                </span>
              </span>
            </button>
          </div>
          </>
        )}

        {(mode === "signup" || !auth.connected) && <p className="auth-step">3 · Your details</p>}
        {auth.connected && mode === "signin" && <p className="auth-step">2 · Credentials</p>}

        {auth.connected && (
          <>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
          </>
        )}

        {(mode === "signup" || !auth.connected) && (
          <>
            <div className="field">
              <label htmlFor="fullName">Your name</label>
              <input
                id="fullName"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Arjun Mehta"
              />
            </div>
            {role === "buyer" && (
              <div className="field">
                <label htmlFor="org">Business name</label>
                <input
                  id="org"
                  value={organization}
                  onChange={(event) => setOrganization(event.target.value)}
                  placeholder="Rose Street Bakery"
                />
              </div>
            )}
          </>
        )}

        {(auth.pendingVerification || previewVerification) && (
          <div className="field">
            <label htmlFor="verifyCode">Confirmation code</label>
            <input
              id="verifyCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="6-digit code from your email"
            />
          </div>
        )}

        {auth.error && (
          <div className="callout callout-warn">
            <span>!</span>
            <span>{auth.error}</span>
          </div>
        )}

        {notice && (
          <div className="callout callout-ok">
            <span>✓</span>
            <span>{notice}</span>
          </div>
        )}

        <label className="terms-check">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
          />
          <span>
            I agree to the{" "}
            <Link to="/terms" target="_blank" rel="noreferrer">
              Okavo Terms
            </Link>{" "}
            and{" "}
            <Link to="/privacy" target="_blank" rel="noreferrer">
              Privacy
            </Link>
            . Okavo is a marketplace intermediary and does not hold build money
            or guarantee the other party’s performance.
          </span>
        </label>

        <button
          type="button"
          className="btn btn-block btn-lg"
          onClick={submit}
          disabled={
            busy ||
            !acceptedTerms ||
            (auth.connected && (!email.trim() || !password))
          }
        >
          {busy
            ? "Working…"
            : mode === "signup" && auth.connected
              ? "Create account"
              : "Continue"}
        </button>

        {auth.connected && mode === "signin" && (
          <button
            type="button"
            className="link-button"
            disabled={!email.trim() || busy}
            onClick={requestReset}
          >
            Forgot password? Email me a reset code
          </button>
        )}

        {auth.connected && (
          <button
            type="button"
            className="link-button"
            disabled={!email.trim() || busy}
            onClick={() => auth.resendVerification(email.trim())}
          >
            Didn&apos;t get the verification email? Send the code again
          </button>
        )}

        {auth.pendingVerification && (
          <button
            type="button"
            className="btn btn-block"
            disabled={busy || code.trim().length < 6}
            onClick={() => {
              setBusy(true);
              void auth
                .verifyEmail(auth.pendingVerification ?? email.trim(), code.trim())
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Working…" : "Confirm email"}
          </button>
        )}

        <p className="auth-support">
          Need help?{" "}
          <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>
        </p>
    </AuthFrame>
  );
}
