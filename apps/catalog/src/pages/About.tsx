import { Link } from "react-router-dom";
import MarketingLayout from "../components/MarketingLayout";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "../brand";
import { MEMBERSHIP_FEE_LABEL, POSTING_FEE_LABEL } from "../lib/pricing";

/**
 * Company voice, deliberately. An unsigned letter written in the first person
 * reads worse than no letter at all, so if a named founder note goes back in,
 * put the name back with it.
 */
const WHY_OKAVO = [
  "Okavo exists because the same thing keeps happening. Someone who is excellent at running a bakery, a clinic or a logistics firm decides they need software. They describe what they want. Money changes hands. Months later they receive something that is technically what they asked for and practically not what they meant.",
  "Nobody in that story is a villain. The developer built what they understood. The buyer described what they pictured. The gap between those two things is where the money goes.",
  "So Okavo is built around one stubborn rule: the expectation becomes a document, signed by both people, before a line of code is written. Everything else in the product exists to protect that rule.",
];

const PRINCIPLES = [
  {
    title: "The agreement outranks everyone, including us",
    body: "Once you sign, the scope is frozen and Okavo keeps a copy that cannot be edited. We do not get to reinterpret it later, and neither does anyone else.",
  },
  {
    title: "Say the price out loud",
    body: `${POSTING_FEE_LABEL} to post a requirement. ${MEMBERSHIP_FEE_LABEL} once for a developer to start bidding. Marketplace commission is a flat 10% on the awarded build — that cut is not auto-collected yet; posting and membership fees are live. No enterprise tier with a hidden number.`,
  },
  {
    title: "Everyone gets the same product",
    body: "There is no small-business version and no enterprise version. A school principal and a global CEO go through the same four steps and get the same lock, the same milestones and the same guarantee.",
  },
  {
    title: "Never claim what we cannot show",
    body: "We would rather tell you we are new than decorate this page with logos we have not earned. Every number on this site is one you could check.",
  },
];

export default function About() {
  return (
    <MarketingLayout>
      <section className="page-hero">
        <div className="wrap">
          <span className="eyebrow">About Okavo</span>
          <h1>Software goes wrong in the gap between what was meant and what was heard</h1>
          <p>
            Okavo exists to close that gap before it costs anyone money. Not
            with better project management — with a signed agreement that
            everything else has to obey.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="split-prose">
            <div>
              <h2>Why Okavo exists</h2>
              {WHY_OKAVO.map((paragraph) => (
                <p key={paragraph.slice(0, 24)}>{paragraph}</p>
              ))}
            </div>

            <aside className="card card-pad honesty">
              <h3>Where we are today</h3>
              <p>
                Okavo launched in 2026. We are early and deliberately small: a
                hand-verified group of developers rather than an open flood of
                applicants.
              </p>
              <p>
                That means we cannot show you a decade of case studies. It also
                means every developer on the platform has been checked by a
                person, and that when you email support you reach someone who
                can actually change things.
              </p>
              <a className="footer-mail" href={SUPPORT_MAILTO}>
                {SUPPORT_EMAIL}
              </a>
            </aside>
          </div>
        </div>
      </section>

      <section className="section-tight">
        <div className="wrap">
          <div className="section-head">
            <h2>What we hold ourselves to</h2>
            <p>
              Four rules we would rather lose business than break.
            </p>
          </div>
          <div className="grid-2">
            {PRINCIPLES.map((principle) => (
              <article className="card card-pad principle" key={principle.title}>
                <h3>{principle.title}</h3>
                <p>{principle.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-tight">
        <div className="wrap">
          <div className="closer">
            <div>
              <h2>Try it on something real.</h2>
              <p>
                Describing what you need is free. You only pay when you publish.
              </p>
            </div>
            <Link className="btn btn-accent btn-lg" to="/signin">
              Describe what you need
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
