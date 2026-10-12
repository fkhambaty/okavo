import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../lib/errors";
import * as api from "../../lib/api";
import { useStore } from "../../store";

export default function AdminOperations() {
  const { connected } = useStore();
  const [health, setHealth] = useState<api.OperationsHealth | null>(null);
  const [events, setEvents] = useState<api.OperationsEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connected) return;
    Promise.all([api.fetchOperationsHealth(), api.fetchOperationsEvents()])
      .then(([nextHealth, nextEvents]) => {
        setHealth(nextHealth);
        setEvents(nextEvents);
      })
      .catch((cause) => setError(errorMessage(cause)));
  }, [connected]);

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Operations health</h1>
          <p className="hint">
            Payment delivery, stale orders, and identity-document cleanup.
          </p>
        </div>
        <div className="topbar-actions">
          <Link className="btn btn-secondary btn-sm" to="/app">
            Platform insights
          </Link>
        </div>
      </header>

      <div className="content">
        {!connected && (
          <div className="card empty">
            Demo data does not include live payment or retention operations.
          </div>
        )}
        {error && (
          <div className="callout callout-warn" role="alert">
            <span>!</span>
            <span>{error}</span>
          </div>
        )}

        {connected && !health ? (
          <div className="card empty">Checking operations…</div>
        ) : health ? (
          <>
            <div className="stat-row">
              <div className="stat">
                <span>Pending over 30 minutes</span>
                <strong>{health.pendingPayments}</strong>
              </div>
              <div className="stat">
                <span>Failed webhooks · 24 hours</span>
                <strong>{health.failedEvents24h}</strong>
              </div>
              <div className="stat">
                <span>Open critical events</span>
                <strong>{health.openCriticalEvents}</strong>
              </div>
              <div className="stat">
                <span>Identity files due</span>
                <strong>{health.identityDocumentsDue}</strong>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <div>
                  <h2>Recent operational events</h2>
                  <p className="hint">
                    Safe summaries only. Secrets, document paths, and provider
                    payloads are not shown.
                  </p>
                </div>
                <span className="badge">
                  Checked {new Date(health.checkedAt).toLocaleString()}
                </span>
              </div>
              <div style={{ padding: "1.25rem" }} className="stack-sm">
                {events.length === 0 && (
                  <div className="empty">
                    <strong>No operational alerts</strong>
                    Payment and retention workers have not reported a problem.
                  </div>
                )}
                {events.map((event) => (
                  <article className="bid" key={event.id}>
                    <div className="bid-top">
                      <div>
                        <strong>{event.summary}</strong>
                        <p className="hint">
                          {event.category} · {event.code}
                          {event.entityType && event.entityId
                            ? ` · ${event.entityType} ${event.entityId}`
                            : ""}
                        </p>
                      </div>
                      <span
                        className={
                          event.severity === "critical"
                            ? "badge badge-danger"
                            : event.severity === "warning"
                              ? "badge badge-draft"
                              : "badge"
                        }
                      >
                        {event.severity}
                      </span>
                    </div>
                    <p className="hint">
                      {new Date(event.createdAt).toLocaleString()}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
