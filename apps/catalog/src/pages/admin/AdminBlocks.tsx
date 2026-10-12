import { useCallback, useEffect, useState } from "react";
import * as api from "../../lib/api";
import { useStore } from "../../store";

type BlockRow = {
  id: string;
  buyerId: string;
  developerId: string;
  projectId: string | null;
  reason: string;
  detail: string | null;
  status: string;
  createdAt: string;
};

export default function AdminBlocks() {
  const { connected } = useStore();
  const [rows, setRows] = useState<BlockRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!connected) {
      setRows([]);
      setError(null);
      return;
    }
    try {
      setError(null);
      setRows(await api.listBlockRequests("open"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load blocks");
    }
  }, [connected]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, approve: boolean) {
    const note = window.prompt(
      approve
        ? "Optional note (shown as block reason):"
        : "Optional note for rejection:"
    );
    if (note === null) return;
    setBusyId(id);
    try {
      await api.reviewDeveloperBlock(id, approve, note);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Review failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <header className="topbar">
        <h1>Block requests</h1>
        <div className="topbar-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </header>
      <div className="content">
        <p className="page-lede">
          Buyers request blocks for ghosting or cheating. Approving bans the
          developer from bidding on Okavo.
        </p>
        {error && (
          <div className="callout callout-warn" role="alert">
            <span>!</span>
            <span>{error}</span>
          </div>
        )}
        {rows.length === 0 ? (
          <div className="card empty">
            <strong>No open block requests</strong>
          </div>
        ) : (
          <div className="stack">
            {rows.map((row) => (
              <div className="card card-pad" key={row.id}>
                <strong>Developer {row.developerId.slice(0, 8)}…</strong>
                <p style={{ margin: "0.35rem 0" }}>{row.reason}</p>
                {row.detail && <p className="hint">{row.detail}</p>}
                <p className="hint">Filed {row.createdAt}</p>
                <div className="bid-actions" style={{ marginTop: "0.75rem" }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={busyId === row.id}
                    onClick={() => void review(row.id, true)}
                  >
                    Approve block
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busyId === row.id}
                    onClick={() => void review(row.id, false)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
