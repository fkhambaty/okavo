import { useCallback, useEffect, useState } from "react";
import * as api from "../../lib/api";
import { isBackendConfigured as isSupabaseConfigured } from "../../lib/backend";
import { errorMessage } from "../../lib/errors";

export default function AdminVerifications() {
  const [items, setItems] = useState<api.ReviewItem[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    try {
      setItems(await api.fetchVerificationQueue());
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function openDocument(path: string) {
    try {
      const url = await api.signedDocumentUrl(path);
      window.open(url, "_blank", "noopener");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function decide(item: api.ReviewItem, approved: boolean) {
    setBusyId(item.id);
    try {
      await api.decideVerification(item.id, item.developerId, approved);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  }

  const pending = items.filter((item) => item.status === "submitted");
  const decided = items.filter((item) => item.status !== "submitted");

  return (
    <>
      <header className="topbar">
        <h1>Identity review</h1>
        <div className="topbar-actions">
          <span className="badge badge-draft">{pending.length} waiting</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={load}>
            Refresh
          </button>
        </div>
      </header>

      <div className="content">
        {error && (
          <div className="callout callout-warn" style={{ marginBottom: "1rem" }}>
            <span>!</span>
            <span>{error}</span>
          </div>
        )}

        <div className="card" style={{ marginBottom: "1rem" }}>
          <div className="card-head">
            <h2>Waiting for a decision</h2>
          </div>
          <div style={{ padding: "1.25rem" }} className="stack-sm">
            {loading && <div className="empty">Loading…</div>}

            {!loading && pending.length === 0 && (
              <div className="empty">
                <strong>Queue is clear</strong>
                Nothing is waiting on review.
              </div>
            )}

            {pending.map((item) => (
              <div className="bid" key={item.id}>
                <div className="bid-top">
                  <div>
                    <strong>{item.developerName}</strong>
                    <p style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>
                      {item.documentType} · issued in {item.documentCountry} ·
                      submitted {item.submittedAt}
                    </p>
                  </div>
                  <span className="badge badge-draft">In review</span>
                </div>

                <div className="bid-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => openDocument(item.documentPath)}
                  >
                    Open document
                  </button>
                  {item.selfiePath && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => openDocument(item.selfiePath as string)}
                    >
                      Open selfie
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={busyId === item.id}
                    onClick={() => decide(item, true)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busyId === item.id}
                    onClick={() => decide(item, false)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {decided.length > 0 && (
          <div className="card">
            <div className="card-head">
              <h2>Decided</h2>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Developer</th>
                  <th>Document</th>
                  <th>Submitted</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {decided.map((item) => (
                  <tr key={item.id}>
                    <td>{item.developerName}</td>
                    <td>
                      {item.documentType} · {item.documentCountry}
                    </td>
                    <td>{item.submittedAt}</td>
                    <td>
                      <span
                        className={
                          item.status === "approved"
                            ? "badge badge-lock"
                            : "badge badge-danger"
                        }
                      >
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ color: "var(--muted)", fontSize: "0.8125rem", marginTop: "1rem" }}>
          Documents open through short-lived signed links. Approving sets the
          developer to verified, which the bidding trigger checks before any bid
          is accepted.
        </p>
      </div>
    </>
  );
}
