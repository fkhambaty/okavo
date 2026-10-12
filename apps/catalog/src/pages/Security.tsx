import { Link } from "react-router-dom";
import MarketingLayout from "../components/MarketingLayout";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "../brand";

const CONTROLS = [
  {
    area: "Payments",
    detail:
      "Platform fees are collected by Razorpay. Card and UPI details never touch our servers — payment happens inside Razorpay's own checkout. Signed callbacks are recorded once, the provider order and payment IDs stay separate, and the amount and currency must match our order before one atomic database step marks a fee paid.",
  },
  {
    area: "Build payments",
    detail:
      "Okavo does not hold build money or provide escrow. A buyer first accepts a submitted milestone against the signed scope, pays the developer directly, and then records that payment once. An optional reference or receipt stays private to the two contract parties and authorised Okavo administrators.",
  },
  {
    area: "Your requirements",
    detail:
      "A draft requirement is visible only to you until you sign it. Once signed, verified developers can see the scope so they can bid — they cannot see your other projects, your contracts, your payments or anyone else's.",
  },
  {
    area: "Separation between accounts",
    detail:
      "The API checks the signed-in account on every request. A buyer receives their own drafts, contracts, and payments. Other buyers do not. Verified developers see a locked public scope, not another company's private records.",
  },
  {
    area: "Identity documents",
    detail:
      "Government IDs are stored privately. Only the developer who uploaded a file and Okavo admins can open it, and only while signed in. Buyers never see the document. Ninety days after a decision, the file is deleted and the stored path is marked purged.",
  },
  {
    area: "Operational alerts",
    detail:
      "Payment mismatches, failed callbacks, stale orders, and overdue identity cleanup create structured operational events. Administrators see health counts and safe summaries without raw identity paths, payment payloads, keys, or secrets.",
  },
  {
    area: "Personal details",
    detail:
      "Email addresses and billing details are readable only by their owner. The marketplace exposes a name, a country and a company name, because that is what the transaction needs — nothing beyond it.",
  },
  {
    area: "Where your data lives",
    detail:
      "Accounts, projects, payments, and private files are stored in Cloudflare D1. The site and the API are served over HTTPS. Identity files are not on a public file host. If your organisation needs data to stay in a particular region, make it a line in your locked scope and developers bid against that requirement.",
  },
  {
    area: "Analytics",
    detail:
      "We count visits to okavo.org first-party, without third-party advertising trackers. No raw IP address is stored; unique visitors are a salted hash that rotates every day, so traffic can be counted without identifying a person.",
  },
];

export default function Security() {
  return (
    <MarketingLayout>
      <section className="page-hero">
        <div className="wrap">
          <span className="eyebrow">Security</span>
          <h1>Where your money, your documents and your data actually sit</h1>
          <p>
            Written for the person who has to sign off on spending real money
            with a company they have not used before. No certification badges
            we have not earned — just what is true today.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="promise-list">
            {CONTROLS.map((control, index) => (
              <article className="promise" key={control.area}>
                <div className="promise-num">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div>
                  <h2>{control.area}</h2>
                  <p>{control.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-tight">
        <div className="wrap">
          <div className="card card-pad honesty">
            <h2>What we are not claiming</h2>
            <p>
              Okavo is not SOC 2 certified, not ISO 27001 certified, and has not
              completed a third-party penetration test. Those take time and
              money a company of our age has not spent yet, and we would rather
              say so than imply otherwise with a badge.
            </p>
            <p>
              If your procurement process requires any of those before you can
              buy, tell us at{" "}
              <a className="footer-mail" href={SUPPORT_MAILTO}>
                {SUPPORT_EMAIL}
              </a>{" "}
              — it is useful for us to know which one blocks you first.
            </p>
          </div>
        </div>
      </section>

      <section className="section-tight">
        <div className="wrap">
          <div className="closer">
            <div>
              <h2>Found something we should fix?</h2>
              <p>
                Report a security issue to {SUPPORT_EMAIL} and we will reply.
                We will not threaten anyone who reports a vulnerability in good
                faith.
              </p>
            </div>
            <Link className="btn btn-accent btn-lg" to="/guarantee">
              Read the guarantee
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
