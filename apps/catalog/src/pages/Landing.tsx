import { Link } from "react-router-dom";
import MarketingLayout from "../components/MarketingLayout";
import { FAQS, GUARANTEES } from "../content/trust";
import { MEMBERSHIP_FEE_LABEL, POSTING_FEE_LABEL } from "../lib/pricing";

const BUILDS = [
  "A website",
  "A mobile app",
  "An online store",
  "A booking system",
  "An internal tool",
  "A customer portal",
  "An AI feature",
  "Whatever you can describe",
];

const SHOTS = [
  {
    src: "/product/signin.png",
    title: "Sign-in",
    caption: "The live sign-in screen. A new account waits for an email code before it can enter.",
  },
  {
    src: "/product/how-it-works.png",
    title: "The four steps",
    caption: "The public how-it-works page. Scope is written down before a developer can bid.",
  },
  {
    src: "/product/security.png",
    title: "Payment attestation",
    caption: "The security page. Buyers pay developers themselves. Okavo records that payment. It does not hold it.",
  },
];

const BUYERS = [
  "A school principal",
  "A bakery with two counters",
  "A clinic in Nairobi",
  "A logistics firm in São Paulo",
  "A government department",
  "A Series B startup",
  "A Fortune 500 board",
];

export default function Landing() {
  return (
    <MarketingLayout>
      <section className="hero hero-ledger">
        <div className="wrap">
          <div className="hero-grid">
            <div>
              <span className="eyebrow">Websites · Apps · Software</span>
              <h1 className="ledger-title">Where the world comes to have software built.</h1>
              <p className="hero-lead">
                Describe what you need in your own words. Okavo turns it into a
                signed agreement, then verified developers build exactly that.
                A school principal and a global CEO use the same four steps and
                get the same certainty.
              </p>
              <div className="hero-actions">
                <Link className="btn btn-accent btn-lg" to="/signin">
                  Describe what you need
                </Link>
                <Link className="btn btn-secondary btn-lg" to="/signin">
                  Build on Okavo
                </Link>
              </div>
            </div>

            <div>
              <div className="lock-card lock-card-physical">
                <div className="lock-card-head">
                  <div>
                    <strong>Your agreement</strong>
                    <span>Settled before anyone starts building</span>
                  </div>
                  <span className="lock-stamp">Not escrow</span>
                </div>

                <div className="lock-card-body">
                  <p className="lock-group">What you both agree on</p>
                  <div className="lock-line">
                    <span className="tick">✓</span> Exactly what you will get,
                    in plain words
                  </div>
                  <div className="lock-line">
                    <span className="tick">✓</span> What it costs to build, and
                    to run
                  </div>
                  <div className="lock-line">
                    <span className="tick">✓</span> The date it will be ready
                  </div>
                  <div className="lock-line">
                    <span className="tick">✓</span> Who fixes it if something
                    breaks
                  </div>
                </div>

                <div className="lock-card-foot">
                  <div className="lock-price">
                    <span>The price</span>
                    <strong>You set it</strong>
                  </div>
                  <div className="lock-price">
                    <span>Changes later</span>
                    <strong>Only if you agree</strong>
                  </div>
                </div>
              </div>

              <p className="lock-caption">
                The same agreement whether you need a simple website or a system
                for a thousand staff.
              </p>
            </div>
          </div>

          {/* Every figure here is a rule the product enforces, not a count we
              would have to justify. Do not put growth metrics in this strip
              until they are real and checkable. */}
          <div className="scale-strip">
            <div className="scale-item">
              <strong>{POSTING_FEE_LABEL}</strong>
              <span>To post a requirement. No cut of your build budget</span>
            </div>
            <div className="scale-item">
              <strong>ID-checked</strong>
              <span>Every developer, by a person, before they can bid</span>
            </div>
            <div className="scale-item">
              <strong>Milestones</strong>
              <span>
                Pay your developer as work is accepted, never all up front
              </span>
            </div>
            <div className="scale-item">
              <strong>You set</strong>
              <span>The budget, before anyone quotes</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="build">
        <div className="wrap">
          <div className="section-head">
            <h2>If you can describe it, it can be built here</h2>
            <p>
              One place for everything you might need made — no agency hunt, no
              shortlist of quotes, no wondering who to trust.
            </p>
          </div>
          <div className="buyers-strip">
            {BUILDS.map((item) => (
              <span className="buyer-chip" key={item}>
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="section-tight" id="how">
        <div className="wrap">
          <div className="section-head">
            <h2>Nothing gets built until you sign what it means</h2>
            <p>
              Software goes wrong when the person paying pictured one thing and
              received another. Okavo removes the gap: your expectation becomes
              a written agreement, signed by both sides, before work begins.
            </p>
          </div>
          <ol className="ink-timeline">
            <li>
              <div className="step-num">01</div>
              <h4>Describe the outcome</h4>
              <p>
                Plain language. No specification, no stack decisions, no jargon.
              </p>
            </li>
            <li>
              <div className="step-num">02</div>
              <h4>Review what it means</h4>
              <p>
                We turn your answers into a precise list of what is in and what
                is out.
              </p>
            </li>
            <li>
              <div className="step-num">03</div>
              <h4>Sign the lock</h4>
              <p>
                Scope, build budget and monthly running cost are frozen and
                signed.
              </p>
            </li>
            <li>
              <div className="step-num">04</div>
              <h4>Developers compete</h4>
              <p>
                Verified engineers bid on identical scope. No moving targets.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section className="section-tight">
        <div className="wrap">
          <div className="section-head">
            <h2>The same four steps, whoever you are</h2>
            <p>
              Okavo does not have a small-business version and an enterprise
              version. Everyone gets the same lock. Build money is a payment
              attestation: you pay the developer yourself, then record it here.
              Okavo does not hold that money in escrow.
            </p>
          </div>
          <div className="buyers-strip">
            {BUYERS.map((buyer) => (
              <span className="buyer-chip" key={buyer}>
                {buyer}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap pov-grid">
          <div className="pov" id="buyers">
            <span className="pov-tag">For buyers</span>
            <h3>You never hire a developer</h3>
            <p>You commission an outcome and receive working software.</p>
            <ul>
              <li>
                <span className="dot" />
                Answer simple questions instead of writing a specification
              </li>
              <li>
                <span className="dot" />
                Set what you can pay to build it and to run it each month
              </li>
              <li>
                <span className="dot" />
                Compare bids priced against identical, locked scope
              </li>
              <li>
                <span className="dot" />
                Pay the first milestone to unlock countersign; later milestones only on acceptance
              </li>
              <li>
                <span className="dot" />
                Changes after signing arrive as a quote, never a surprise
              </li>
              <li>
                <span className="dot" />
                {POSTING_FEE_LABEL} per requirement keeps the board serious on both sides
              </li>
            </ul>
            <Link className="btn btn-accent" to="/signin">
              Describe what you need
            </Link>
          </div>

          <div className="pov" id="developers">
            <span className="pov-tag">For developers</span>
            <h3>Prove it once, then build</h3>
            <p>
              Browsing is free. A one-time {MEMBERSHIP_FEE_LABEL} membership unlocks bidding.
            </p>
            <ul>
              <li>
                <span className="dot" />
                Government ID and a timed build exam, both reviewed before a bid is accepted
              </li>
              <li>
                <span className="dot" />
                Judged on security, efficiency and maintainability, not puzzles
              </li>
              <li>
                <span className="dot" />
                Every project arrives with scope and budget already settled
              </li>
              <li>
                <span className="dot" />
                Paid milestone by milestone as the buyer accepts
              </li>
              <li>
                <span className="dot" />
                Extra work is a paid change order, never scope creep
              </li>
            </ul>
            <Link className="btn btn-secondary" to="/signin">
              Apply as a developer
            </Link>
          </div>
        </div>
      </section>

      <section className="section-tight" id="guarantee">
        <div className="wrap">
          <div className="section-head">
            <h2>What Okavo guarantees</h2>
            <p>
              Six promises, each one enforced by the product rather than by a
              policy you would have to argue about later.
            </p>
          </div>
          <div className="grid-2">
            {GUARANTEES.map((promise) => (
              <div className="promise-card" key={promise.title}>
                <span className="tick">✓</span>
                <div>
                  <strong>{promise.title}</strong>
                  <p>{promise.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="section-more">
            <Link className="btn btn-secondary" to="/guarantee">
              How each promise is enforced
            </Link>
          </div>
        </div>
      </section>

      <section className="section-tight" id="product">
        <div className="wrap">
          <div className="section-head">
            <h2>The product, as it is</h2>
            <p className="attestation-note">
              These are screenshots of the live Okavo pages. They are not mockups
              and they do not show other people’s projects.
            </p>
          </div>
          <div className="product-shots">
            {SHOTS.map((shot) => (
              <figure className="product-shot" key={shot.src}>
                <img src={shot.src} alt={shot.caption} />
                <figcaption>
                  <strong>{shot.title}</strong>
                  {shot.caption}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="section-tight" id="faq">
        <div className="wrap">
          <div className="section-head">
            <h2>Before you trust us with a project</h2>
            <p>The questions people actually ask, including the awkward ones.</p>
          </div>
          <div className="faq-list">
            {FAQS.slice(0, 5).map((item) => (
              <details className="faq-item" key={item.question}>
                <summary>
                  <span>{item.question}</span>
                  <span className="faq-marker" aria-hidden="true" />
                </summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
          <div className="section-more">
            <Link className="btn btn-secondary" to="/faq">
              All questions
            </Link>
          </div>
        </div>
      </section>

      <section className="section-tight">
        <div className="wrap">
          <div className="closer">
            <div>
              <h2>Say what you need. Lock it. Get it built.</h2>
              <p>
                Start with a description in your own words. Nothing reaches a
                developer until you have signed what it means.
              </p>
            </div>
            <Link className="btn btn-accent btn-lg" to="/signin">
              Get started
            </Link>
          </div>
        </div>
      </section>

    </MarketingLayout>
  );
}
