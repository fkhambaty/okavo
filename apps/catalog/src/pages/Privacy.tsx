import MarketingLayout from "../components/MarketingLayout";
import { Link } from "react-router-dom";

export default function Privacy() {
  return (
    <MarketingLayout>
      <section className="page-hero">
        <div className="wrap">
          <span className="eyebrow">Legal</span>
          <h1>Privacy</h1>
          <p>
            How Okavo handles account data, identity documents, and payments
            metadata. Short version: we collect what the marketplace needs and
            do not sell your personal data.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap prose">
          <h2>What we collect</h2>
          <p>
            Account details (name, email, role), requirement and bid content,
            messages on the platform, identity documents submitted for
            verification, and payment metadata from Razorpay for platform fees.
            We do not store your full card number.
          </p>

          <h2>How we use it</h2>
          <p>
            To run the marketplace, verify developers, process platform fees,
            prevent abuse, and improve the product. Identity documents stay in
            private storage and are reviewed by Okavo for verification.
          </p>

          <h2>Identity-document retention</h2>
          <p>
            Identity files are kept in private storage while a review is open.
            Ninety days after Okavo approves or rejects the verification, a
            scheduled cleanup deletes the document and selfie, then replaces
            their stored paths with a non-sensitive “purged” marker. The
            verification decision itself may remain so the marketplace can
            remember that the check happened.
          </p>

          <h2>Payment evidence</h2>
          <p>
            Okavo does not hold build payments. A buyer may optionally save a
            bank or UPI reference and upload a receipt after accepting a
            milestone. That evidence is private to the buyer, the contracted
            developer, and authorised Okavo administrators.
          </p>

          <h2>Deletion requests</h2>
          <p>
            You may ask us to erase your account by emailing support@okavo.org.
            We delete identity files and minimise personal data, while keeping
            only records we must retain for security, tax, payment, dispute, or
            legal obligations.
          </p>

          <h2>Sharing</h2>
          <p>
            We share data with infrastructure providers (hosting, database,
            email, Razorpay) as needed to operate the service. We do not sell
            personal data. Buyers and developers see what the product role
            allows under row-level security.
          </p>

          <h2>Contact</h2>
          <p>
            Privacy questions: support@okavo.org. See also{" "}
            <Link to="/security">Security</Link> and the{" "}
            <Link to="/terms">Terms of Use</Link>.
          </p>
        </div>
      </section>
    </MarketingLayout>
  );
}
