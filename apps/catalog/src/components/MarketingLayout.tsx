import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "../brand";
import { lockPageScroll } from "../lib/scrollLock";
import Logo from "./Logo";

const NAV = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/example", label: "Example" },
  { href: "/guarantee", label: "Guarantee" },
  { href: "/faq", label: "FAQ" },
  { href: "/about", label: "About" },
];

/** Public shell: the same navigation and footer on every marketing page. */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    return lockPageScroll();
  }, [menuOpen]);

  const close = () => setMenuOpen(false);

  return (
    <>
      <header className="market-nav">
        <div className="wrap market-nav-inner">
          <Link to="/" onClick={close}>
            <Logo />
          </Link>
          <nav className="market-links" aria-label="Primary">
            {NAV.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                className={({ isActive }) =>
                  isActive ? "market-link active" : "market-link"
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="nav-right">
            <Link className="btn btn-secondary btn-sm" to="/signin">
              Sign in
            </Link>
            <Link className="btn btn-accent btn-sm nav-cta" to="/signin">
              Get started
            </Link>
            <button
              type="button"
              className="menu-toggle market-menu-toggle"
              aria-expanded={menuOpen}
              aria-controls="market-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="market-menu" id="market-menu">
            <div className="wrap market-menu-inner">
              {NAV.map((item) => (
                <NavLink
                  key={item.href}
                  to={item.href}
                  className={({ isActive }) =>
                    isActive ? "market-link active" : "market-link"
                  }
                  onClick={close}
                >
                  {item.label}
                </NavLink>
              ))}
              <div className="market-menu-actions">
                <Link className="btn btn-secondary" to="/signin" onClick={close}>
                  Sign in
                </Link>
                <Link className="btn btn-accent" to="/signin" onClick={close}>
                  Get started
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      {children}

      <footer className="footer">
        <div className="wrap">
          <div className="footer-cols">
            <div>
              <Logo size={20} />
              <p className="footer-line">
                Websites, apps and software — built on a signed agreement.
              </p>
            </div>
            <div>
              <h4>Product</h4>
              <Link to="/how-it-works">How it works</Link>
              <Link to="/example">Example walkthrough</Link>
              <Link to="/guarantee">The guarantee</Link>
              <Link to="/security">Security</Link>
              <Link to="/faq">Questions</Link>
            </div>
            <div>
              <h4>Company</h4>
              <Link to="/about">About Okavo</Link>
              <Link to="/terms">Terms of Use</Link>
              <Link to="/privacy">Privacy</Link>
              <a href={SUPPORT_MAILTO}>Contact us</a>
            </div>
            <div>
              <h4>Get started</h4>
              <Link to="/signin">Describe what you need</Link>
              <Link to="/signin">Apply as a developer</Link>
            </div>
          </div>

          <div className="footer-base">
            <span>© {new Date().getFullYear()} Okavo</span>
            <a className="footer-mail" href={SUPPORT_MAILTO}>
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
