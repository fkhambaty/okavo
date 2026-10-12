import MarketingLayout from "../components/MarketingLayout";
import { TERMS_TITLE, TERMS_VERSION } from "../lib/terms";

/**
 * Platform terms. Okavo is an intermediary marketplace — not escrow, not a
 * party to the build contract. Counsel should review before relying on this
 * in a dispute; no terms can guarantee absolute immunity from every claim.
 */
export default function Terms() {
  return (
    <MarketingLayout>
      <section className="page-hero">
        <div className="wrap">
          <span className="eyebrow">Legal</span>
          <h1>{TERMS_TITLE}</h1>
          <p>
            Version {TERMS_VERSION}. These terms govern use of okavo.org. By
            creating an account or using Okavo you agree to them.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap prose">
          <h2>1. What Okavo is</h2>
          <p>
            Okavo operates an online marketplace that helps buyers describe
            software needs, freeze a Requirement Lock, and receive bids from
            identity-verified developers. Okavo is a technology platform and
            intermediary. Okavo is not a law firm, bank, escrow agent, employer
            of developers, or party to the software build contract between a
            buyer and a developer.
          </p>

          <h2>2. Your agreement with the other party</h2>
          <p>
            When a buyer awards a bid, the commercial relationship for the
            build is between the buyer and the developer. The locked scope,
            milestones, change orders, and any off-platform payments are part
            of that relationship. You must read and honour that lock. Okavo
            does not guarantee that either party will perform.
          </p>

          <h2>3. Payments (Razorpay fees vs build money)</h2>
          <p>
            Okavo collects platform fees (posting, membership, and the hire
            success fee when a bid is awarded) through Razorpay. Build money for
            milestones is paid directly between buyer and developer. Okavo does
            not hold, refund, or insure build funds. Confirm payment in Okavo
            only after you have accepted delivered work against the signed
            scope.
          </p>

          <h2>4. Milestone rule — no full prepayment culture</h2>
          <p>
            Buyers must not pay the entire build price up front through Okavo’s
            process. Work is reviewed milestone by milestone. Maximum exposure
            is intended to be one open milestone. Paying outside that pattern is
            at your own risk.
          </p>

          <h2>5. Identity, build exam, conduct, and blocking</h2>
          <p>
            Developers must pass identity checks and Okavo’s timed build exam
            before bidding. After exam submission, an exam may auto-approve
            after forty-eight hours only if its automated score is at least 70
            and no platform pause or exam-specific hold is active. Exams without
            a score, or with a lower score, remain for manual review. Reused
            repository signals, including possible forks, are review clues and
            are not automatic rejection grounds. These rules are shown to
            developers on the verification page. Buyers may request that Okavo
            block a developer for ghosting, fraud, or other serious misconduct
            after a hire. Okavo may approve or reject that request and may
            suspend accounts. Okavo is not obliged to mediate every dispute or
            to recover money paid outside the platform.
          </p>

          <h2>6. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by applicable law, Okavo, its
            operators, officers, and affiliates are not liable for any indirect,
            incidental, special, consequential, exemplary, or punitive damages;
            lost profits, data, or goodwill; or any loss arising from: (a) work
            quality or non-delivery by a developer; (b) non-payment by a buyer;
            (c) off-platform payments; (d) disputes between users; (e) downtime
            or bugs; or (f) third-party services (including Razorpay and hosting
            providers). Okavo’s total liability for claims relating to the
            service is limited to the platform fees you paid to Okavo in the
            three months before the claim.
          </p>

          <h2>7. Indemnity</h2>
          <p>
            You agree to defend and indemnify Okavo and its operators against
            claims, damages, and costs (including reasonable legal fees) arising
            from your use of the platform, your content, your breach of these
            terms, or your dealings with another user — except to the extent
            caused by Okavo’s wilful misconduct.
          </p>

          <h2>8. No warranty</h2>
          <p>
            The service is provided “as is” and “as available.” Okavo does not
            warrant uninterrupted access, error-free operation, or that any
            developer or buyer will meet your expectations.
          </p>

          <h2>9. Governing law</h2>
          <p>
            These terms are governed by the laws of India, without regard to
            conflict-of-law rules. Courts in Mumbai, Maharashtra have exclusive
            jurisdiction, subject to mandatory consumer protections that cannot
            be waived.
          </p>

          <h2>10. Changes</h2>
          <p>
            We may update these terms. The version date above is the current
            version. Continued use after notice, or a fresh acceptance at
            sign-in, constitutes agreement to the updated terms.
          </p>

          <p className="hint prose-note">
            Questions: support@okavo.org. This page is not personalised legal
            advice. Have your own lawyer review contracts that matter to you.
          </p>
        </div>
      </section>
    </MarketingLayout>
  );
}
