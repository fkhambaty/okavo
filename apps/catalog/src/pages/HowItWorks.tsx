import { Link } from "react-router-dom";
import MarketingLayout from "../components/MarketingLayout";
import { MEMBERSHIP_FEE_LABEL, POSTING_FEE_LABEL } from "../lib/pricing";

const BUYER_STEPS = [
  {
    title: "Describe the outcome in your own words",
    detail:
      "You answer plain questions: who uses it, what should be true when it is finished, what it must include, what you want ruled out. No specification, no technology choices, no jargon. If you can explain it to a colleague, you can post it.",
    takes: "About ten minutes",
  },
  {
    title: "Check the reading of your answers",
    detail:
      "Okavo turns what you wrote into a scope — a list of what is in, what is out, and how each item will be judged complete — plus a sketch of the screens your answers imply. This is where misunderstandings surface, while they are still free to fix.",
    takes: "A few minutes, and you can edit anything",
  },
  {
    title: "Publish for Q&A, then freeze the lock",
    detail:
      `Pay ${POSTING_FEE_LABEL} to open a short clarification window. Developers can ask line-item questions; bidding stays closed. When the picture is sharp, you freeze the Requirement Lock — an unchangeable copy Okavo keeps.`,
    takes: `${POSTING_FEE_LABEL} at publish; freeze opens bids`,
  },
  {
    title: "Compare bids priced against identical scope",
    detail:
      "Verified developers bid on exactly the same definition of done, so the numbers are comparable. Each bid shows that developer's rating, how often they delivered the locked scope, and how many contracts they have closed.",
    takes: "Most requirements attract bids within a week",
  },
  {
    title: "Hire (pay Okavo’s 10% fee), then accept → pay → attest milestones",
    detail:
      "You pick a bid and pay Okavo’s flat 10% hire success fee via Razorpay before the hire completes — that keeps deals on-platform. Then you accept work against the lock, pay the developer that milestone yourself, and confirm payment here. Okavo does not hold build funds.",
    takes: "10% hire fee unlocks award; then accept-then-pay",
  },
  {
    title: "Accept later milestones against the checklist",
    detail:
      "Later milestones follow the same pattern: accept delivered work against the signed scope, pay the developer, confirm in Okavo. You are never meant to prepay the whole build through Okavo’s process.",
    takes: "You are never more than one milestone exposed",
  },
  {
    title: "Accept, and own it",
    detail:
      "On final release the work is yours outright, source included, with a warranty period on anything covered by the signed scope. You close the contract by rating the developer on four things every buyer can actually judge.",
    takes: "Your review becomes part of their public record",
  },
];

const DEV_STEPS = [
  {
    title: "Verify who you are",
    detail:
      "Government ID, reviewed by a person. Until it is approved you cannot bid — the database refuses it. This is what makes a buyer on another continent comfortable hiring you.",
  },
  {
    title: "Pass the timed build exam",
    detail:
      "After ID approval you get a rotating brief from Okavo’s bank and five hours to ship a public GitHub repo plus a live URL. Okavo checks the public links safely and flags reused repositories for human review. After 48 hours, only scores of 70 or higher can auto-approve; missing or lower scores stay with an admin, and pauses or holds can stop auto-approval.",
  },
  {
    title: "Pay once, bid freely",
    detail:
      `A one-time ${MEMBERSHIP_FEE_LABEL} membership unlocks bidding after identity and the build exam are approved. When a buyer hires you, they also pay Okavo’s flat 10% hire success fee. There is no subscription.`,
  },
  {
    title: "Bid on settled work",
    detail:
      "Every bid-ready requirement is already frozen. The scope will not move under you, the budget is stated, and the buyer has already paid to post it. You are quoting on a real job, not a maybe.",
  },
  {
    title: "Countersign, then deliver milestone by milestone",
    detail:
      "When you are hired, you countersign the same freeze. The buyer pays you after accepting each milestone against the lock — Okavo does not hold that money. Anything outside the signed scope is a paid change order.",
  },
];

export default function HowItWorks() {
  return (
    <MarketingLayout>
      <section className="page-hero">
        <div className="wrap">
          <span className="eyebrow">How it works</span>
          <h1>Agree exactly what you will get, before anyone writes code</h1>
          <p>
            Most software disputes are not about effort. They are about two
            people who pictured different things and only found out at the end.
            Okavo removes the gap by making the expectation a document.
          </p>
          <p className="page-hero-follow">
            Prefer a story with faces?{" "}
            <Link to="/example">Follow the Rose Street Bakery walkthrough</Link>.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <h2>If you need something built</h2>
            <p>Seven steps, in order. You can stop at any point before you sign.</p>
          </div>

          <ol className="journey">
            {BUYER_STEPS.map((step, index) => (
              <li className="journey-step" key={step.title}>
                <div className="journey-num">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.detail}</p>
                  <span className="journey-meta">{step.takes}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section-tight" id="developers">
        <div className="wrap">
          <div className="section-head">
            <h2>If you build software</h2>
            <p>
              Browsing costs nothing. Everything below happens before your first
              bid.
            </p>
          </div>

          <ol className="journey">
            {DEV_STEPS.map((step, index) => (
              <li className="journey-step" key={step.title}>
                <div className="journey-num">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section-tight">
        <div className="wrap">
          <div className="closer">
            <div>
              <h2>See it as a bakery story — or read the guarantee.</h2>
              <p>
                The example walkthrough retells these steps with Tom and Arjun.
                The guarantee lists six promises and what enforces each one.
              </p>
            </div>
            <div className="hero-actions">
              <Link className="btn btn-accent btn-lg" to="/example">
                Example walkthrough
              </Link>
              <Link className="btn btn-secondary btn-lg" to="/guarantee">
                The guarantee
              </Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
