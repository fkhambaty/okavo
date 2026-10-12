import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../../lib/api";
import { errorMessage } from "../../lib/errors";

const BUCKETS: {
  id: api.AuditAgeBucket;
  label: string;
  hint: string;
}[] = [
  { id: "7d", label: "Last 7 days", hint: "0–7 days ago" },
  { id: "14d", label: "7–14 days", hint: "Exclusive next window" },
  { id: "30d", label: "14–30 days", hint: "Exclusive next window" },
  { id: "older", label: "Older than 30", hint: "Archive window" },
];

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function actionLabel(action: string) {
  return action.replace(/\./g, " · ");
}

export default function AdminAuditLogs() {
  const [bucket, setBucket] = useState<api.AuditAgeBucket>("7d");
  const [counts, setCounts] = useState<Record<api.AuditAgeBucket, number> | null>(
    null
  );
  const [rows, setRows] = useState<api.AuditEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (next: api.AuditAgeBucket) => {
    setLoading(true);
    setError(null);
    try {
      const [nextCounts, nextRows] = await Promise.all([
        api.fetchAuditBucketCounts(),
        api.fetchAuditEvents(next, 250, 0),
      ]);
      setCounts(nextCounts);
      setRows(nextRows);
    } catch (cause) {
      setError(errorMessage(cause));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(bucket);
  }, [bucket, load]);

  return (
    <>
      <header className="topbar">
        <h1>Audit logs</h1>
        <div className="topbar-actions">
          <Link className="btn btn-secondary btn-sm" to="/app">
            Insights
          </Link>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void load(bucket)}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </header>

      <div className="content">
        <p className="page-lede">
          Security and money actions — sign-in, fees, publish, lock, bid,
          hire, fund, accept, clarifications, guardrail blocks, and grounded
          assist. Age buckets are exclusive partitions so each event appears in
          exactly one tab.
        </p>

        <div className="ex-tabs" role="tablist" aria-label="Audit age buckets">
          {BUCKETS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`ex-tab${bucket === item.id ? " on" : ""}`}
              role="tab"
              aria-selected={bucket === item.id}
              onClick={() => setBucket(item.id)}
            >
              {item.label}
              {counts ? ` · ${counts[item.id]}` : ""}
            </button>
          ))}
        </div>

        {error && (
          <div className="callout callout-warn" style={{ marginBottom: "1rem" }}>
            <span>!</span>
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="card empty">Loading audit partition…</div>
        ) : rows.length === 0 ? (
          <div className="card empty">
            <strong>No events in this window</strong>
            {BUCKETS.find((b) => b.id === bucket)?.hint}
          </div>
        ) : (
          <div className="card">
            <div className="card-head">
              <h2>
                {BUCKETS.find((b) => b.id === bucket)?.label} · {rows.length}{" "}
                shown
              </h2>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {formatWhen(row.createdAt)}
                      </td>
                      <td>
                        <strong>{row.actorName ?? "Unknown"}</strong>
                        <div
                          style={{
                            color: "var(--muted)",
                            fontSize: "0.8125rem",
                          }}
                        >
                          {row.actorRole ?? "—"}
                          {row.actorEmail ? ` · ${row.actorEmail}` : ""}
                        </div>
                      </td>
                      <td>
                        <code style={{ fontSize: "0.8125rem" }}>
                          {actionLabel(row.action)}
                        </code>
                      </td>
                      <td style={{ fontSize: "0.8125rem" }}>
                        {row.entityType}
                        <div style={{ color: "var(--muted)" }}>
                          {row.entityId.slice(0, 8)}…
                        </div>
                      </td>
                      <td
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--muted)",
                          maxWidth: "16rem",
                        }}
                      >
                        {Object.keys(row.detail).length === 0
                          ? "—"
                          : JSON.stringify(row.detail)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
