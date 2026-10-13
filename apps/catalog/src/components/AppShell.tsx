import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "../brand";
import Logo from "./Logo";
import { initials } from "../format";
import { MEMBERSHIP_FEE_LABEL } from "../lib/pricing";
import { lockPageScroll } from "../lib/scrollLock";
import { useStore } from "../store";

const BUYER_NAV = [
  { to: "/app", label: "Overview", end: true },
  { to: "/app/new", label: "New requirement", end: false },
  { to: "/app/developers", label: "Developers", end: false },
  { to: "/app/contracts", label: "Contracts", end: false },
  { to: "/app/payments", label: "Payments", end: false },
  { to: "/app/messages", label: "Messages", end: false },
  { to: "/app/notifications", label: "Notifications", end: false },
];

const DEV_NAV = [
  { to: "/app", label: "Find projects", end: true },
  { to: "/app/bids", label: "My bids", end: false },
  { to: "/app/contracts", label: "Contracts", end: false },
  { to: "/app/earnings", label: "Earnings", end: false },
  { to: "/app/messages", label: "Messages", end: false },
  { to: "/app/verification", label: "Verification", end: false },
  { to: "/app/notifications", label: "Notifications", end: false },
];

const ADMIN_NAV = [
  { to: "/app", label: "Insights", end: true },
  { to: "/app/traffic", label: "Traffic", end: false },
  { to: "/app/audit", label: "Audit logs", end: false },
  { to: "/app/exams", label: "Build exams", end: false },
  { to: "/app/blocks", label: "Block requests", end: false },
  { to: "/app/operations", label: "Operations health", end: false },
  { to: "/app/verifications", label: "Identity review", end: false },
  { to: "/app/contracts", label: "All contracts", end: false },
];

export default function AppShell() {
  const {
    role,
    name,
    signOut,
    projects,
    notifications,
    developerAccount,
    connected,
    demoMode,
    loading,
    error,
  } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const isBuyer = role === "buyer";
  const isAdmin = role === "admin";
  const nav = isAdmin ? ADMIN_NAV : isBuyer ? BUYER_NAV : DEV_NAV;

  const openCount = projects.filter((p) => p.stage === "locked").length;
  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!navOpen) return;
    return lockPageScroll();
  }, [navOpen]);

  // Await the sign-out first: navigating while the session is still live
  // bounces "/" straight back to the workspace and lands on the sign-in page.
  async function handleSignOut() {
    setNavOpen(false);
    await signOut();
    navigate("/", { replace: true });
  }

  function badgeFor(label: string) {
    if (label === "Notifications" && unread > 0) return unread;
    if (label === "Find projects") return openCount;
    return null;
  }

  const workspaceLabel = isAdmin
    ? "Admin console"
    : isBuyer
      ? "Buyer workspace"
      : "Developer workspace";

  return (
    <div className={navOpen ? "app nav-open" : "app"}>
      <a className="skip-link" href="#workspace-main">
        Skip to content
      </a>
      <header className="mobile-bar">
        <button
          type="button"
          className="menu-toggle"
          aria-expanded={navOpen}
          aria-controls="app-sidebar"
          aria-label={navOpen ? "Close menu" : "Open menu"}
          onClick={() => setNavOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
        <Logo size={20} />
        <span className="mobile-bar-role">
          {connected ? workspaceLabel : "Demo data"}
        </span>
      </header>

      {navOpen && (
        <button
          type="button"
          className="nav-backdrop"
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
        />
      )}

      <aside className="sidebar" id="app-sidebar">
        <div className="sidebar-brand">
          <Logo />
          <button
            type="button"
            className="menu-close"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          >
            ×
          </button>
        </div>
        <div className="side-role">{workspaceLabel}</div>

        <nav className="side-nav">
          {nav.map((item) => {
            const count = badgeFor(item.label);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }: { isActive: boolean }) =>
                  isActive ? "side-link active" : "side-link"
                }
              >
                <span>{item.label}</span>
                {count !== null && <span className="side-count">{count}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="side-foot">
          <div className="conn">
            <span className={connected ? "conn-dot live" : "conn-dot"} />
            {connected
              ? loading
                ? "Syncing your workspace"
                : "Live database"
              : "Demo data"}
          </div>
          {!isBuyer && !isAdmin && !developerAccount.membershipPaid && (
            <div className="side-lock-note">
              <strong>Bidding locked</strong>
              <span>Pay {MEMBERSHIP_FEE_LABEL} once to bid</span>
            </div>
          )}
          <div className="side-user">
            <span className="avatar">{initials(name || "Okavo User")}</span>
            <span className="side-user-text">
              <strong>{name}</strong>
              <span>
                {demoMode && isBuyer
                  ? "Principal · lifetime"
                  : isAdmin
                    ? "Administrator"
                    : isBuyer
                      ? "Buyer"
                      : developerAccount.membershipPaid &&
                          developerAccount.identityStatus === "approved"
                        ? `${developerAccount.tier} · bidding active`
                        : developerAccount.membershipPaid
                          ? `${developerAccount.tier} · ID required to bid`
                          : `${developerAccount.tier} · bidding locked`}
              </span>
            </span>
          </div>
          <a className="side-support" href={SUPPORT_MAILTO}>
            {SUPPORT_EMAIL}
          </a>
          <button type="button" className="side-signout" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="main" id="workspace-main">
        {error && (
          <div className="db-error">
            <strong>Database error</strong>
            <span>{error}</span>
          </div>
        )}
        <Outlet />
      </div>
    </div>
  );
}
