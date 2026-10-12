import { useState } from "react";
import * as api from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { isBackendConfigured as isSupabaseConfigured } from "../../lib/backend";
import { errorMessage } from "../../lib/errors";

const DOCUMENT_TYPES = [
  "Passport",
  "National ID card",
  "Driving licence",
  "Residence permit",
];

const COUNTRIES = [
  "India",
  "United States",
  "United Kingdom",
  "Nigeria",
  "Brazil",
  "Germany",
  "Singapore",
  "Other",
];

const MAX_BYTES = 5 * 1024 * 1024;

type Props = {
  status: string;
  onSubmitted: () => void;
};

export default function IdentityUpload({ status, onSubmitted }: Props) {
  const { userId } = useAuth();
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[0]);
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [document, setDocument] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = Boolean(document) && consent && !busy;

  function pick(
    setter: (file: File | null) => void
  ): (event: React.ChangeEvent<HTMLInputElement>) => void {
    return (event) => {
      const file = event.target.files?.[0] ?? null;
      setError(null);
      if (file && file.size > MAX_BYTES) {
        setError("That file is over 5 MB. Please upload a smaller scan.");
        setter(null);
        return;
      }
      setter(file);
    };
  }

  async function submit() {
    if (!document) return;
    setBusy(true);
    setError(null);
    try {
      if (isSupabaseConfigured && userId) {
        await api.submitIdentity(userId, {
          documentType,
          documentCountry: country,
          document,
          selfie,
        });
      }
      onSubmitted();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  if (status === "submitted" || status === "in_review") {
    return (
      <div className="callout callout-warn">
        <span>•</span>
        <span>
          Your documents are with our review team. Most checks finish within one
          business day, and you will be notified either way.
        </span>
      </div>
    );
  }

  return (
    <div className="stack-sm">
      {status === "rejected" && (
        <div className="callout callout-warn" style={{ marginBottom: "0.5rem" }}>
          <span>!</span>
          <span>
            Your last submission was not accepted. Upload a clearer photo of the
            full document, all four corners visible.
          </span>
        </div>
      )}

      <div className="field-row">
        <div className="field">
          <label htmlFor="doctype">Document type</label>
          <select
            id="doctype"
            value={documentType}
            onChange={(event) => setDocumentType(event.target.value)}
          >
            {DOCUMENT_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="country">Issuing country</label>
          <select
            id="country"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
          >
            {COUNTRIES.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="doc">Photo of the document</label>
        <input
          id="doc"
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          onChange={pick(setDocument)}
        />
        <span className="hint">
          JPG, PNG, WebP or PDF, up to 5 MB. All four corners must be visible.
        </span>
      </div>

      <div className="field">
        <label htmlFor="selfie">Photo of you holding it (optional)</label>
        <input
          id="selfie"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={pick(setSelfie)}
        />
        <span className="hint">Speeds up review, and lets us skip a video call.</span>
      </div>

      <label className="check" style={{ marginBottom: "0.75rem" }}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
        />
        I confirm this is my own document and consent to identity checks
      </label>

      {error && (
        <div className="callout callout-warn" style={{ marginBottom: "0.75rem" }}>
          <span>!</span>
          <span>{error}</span>
        </div>
      )}

      <button type="button" className="btn" disabled={!ready} onClick={submit}>
        {busy ? "Uploading…" : "Submit for verification"}
      </button>

      <p style={{ color: "var(--muted)", fontSize: "0.75rem", marginTop: "0.75rem" }}>
        Files stay in private storage that only you and the review team can open.
        Buyers never see your documents — only that you are verified. They are
        deleted 90 days after a decision.
      </p>
    </div>
  );
}
