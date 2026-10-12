import { useCallback, useEffect, useState } from "react";
import * as examApi from "../../lib/exam";
import {
  EXAM_AUTO_APPROVE_MIN_SCORE,
  type BuildExam,
  type ExamControls,
} from "../../lib/exam";
import { checkGuardrails } from "../../lib/guardrails";
import { getAccessToken } from "../../lib/sessionClient";

export default function AdminExams() {
  const [rows, setRows] = useState<BuildExam[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [controls, setControls] = useState<ExamControls | null>(null);
  const [controlsBusy, setControlsBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [exams, nextControls] = await Promise.all([
        examApi.listOpenBuildExams(),
        examApi.fetchExamControls(),
      ]);
      setRows(exams);
      setControls(nextControls);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load exams");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <header className="topbar">
        <h1>Build exams</h1>
        <div className="topbar-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </header>
      <div className="content">
        <p className="page-lede">
          Timed developer challenges. After 48 hours, only an exam scoring{" "}
          {EXAM_AUTO_APPROVE_MIN_SCORE}+ can auto-approve. Missing or lower
          scores stay here for a person. Duplicate repositories and forks are
          flagged for review, never automatically rejected.
        </p>
        {controls && (
          <div className="card card-pad u-mb">
            <strong>Operational controls</strong>
            <p className="hint">
              Use these switches during incidents or when the review team is
              unavailable. Every change is written to the audit log.
            </p>
            <div className="bid-actions" style={{ marginTop: "0.75rem" }}>
              <label>
                <input
                  type="checkbox"
                  checked={controls.startsPaused}
                  disabled={controlsBusy}
                  onChange={(event) => {
                    const startsPaused = event.target.checked;
                    void (async () => {
                      setControlsBusy(true);
                      try {
                        await examApi.adminSetExamPauses(
                          startsPaused,
                          controls.autoApprovePaused
                        );
                        await load();
                      } catch (cause) {
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : "Could not update exam controls"
                        );
                      } finally {
                        setControlsBusy(false);
                      }
                    })();
                  }}
                />{" "}
                Pause new starts
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={controls.autoApprovePaused}
                  disabled={controlsBusy}
                  onChange={(event) => {
                    const autoApprovePaused = event.target.checked;
                    void (async () => {
                      setControlsBusy(true);
                      try {
                        await examApi.adminSetExamPauses(
                          controls.startsPaused,
                          autoApprovePaused
                        );
                        await load();
                      } catch (cause) {
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : "Could not update exam controls"
                        );
                      } finally {
                        setControlsBusy(false);
                      }
                    })();
                  }}
                />{" "}
                Pause all auto-approvals
              </label>
            </div>
          </div>
        )}
        {error && (
          <div className="callout callout-warn" role="alert">
            <span>!</span>
            <span>{error}</span>
          </div>
        )}
        {rows.length === 0 ? (
          <div className="card empty">
            <strong>No exams waiting</strong>
          </div>
        ) : (
          <div className="stack">
            {rows.map((exam) => (
              <div className="card card-pad" key={exam.id}>
                <strong>{exam.brief?.title ?? "Brief"}</strong>
                <p className="hint">
                  Status {exam.status.replace(/_/g, " ")}
                  {exam.reviewDeadlineAt
                    ? ` · decide by ${new Date(exam.reviewDeadlineAt).toLocaleString()}`
                    : ""}
                  {exam.autoScoreOverall !== null
                    ? ` · auto-score ${exam.autoScoreOverall}/100`
                    : ""}
                </p>
                {exam.duplicateRepo && (
                  <div className="callout callout-warn">
                    <span>!</span>
                    <span>
                      Repository duplicate detected. This is a review flag only;
                      a legitimate fork must not be rejected automatically.
                    </span>
                  </div>
                )}
                {exam.autoApprovalHold && (
                  <div className="callout callout-warn">
                    <span>!</span>
                    <span>
                      Auto-approval held
                      {exam.autoApprovalHoldReason
                        ? `: ${exam.autoApprovalHoldReason}`
                        : "."}
                    </span>
                  </div>
                )}
                <p>
                  <a href={exam.githubUrl ?? "#"} target="_blank" rel="noreferrer">
                    Repo
                  </a>
                  {" · "}
                  <a href={exam.liveUrl ?? "#"} target="_blank" rel="noreferrer">
                    Live
                  </a>
                </p>
                {exam.adminQuestion && (
                  <p>
                    <strong>Question:</strong> {exam.adminQuestion}
                  </p>
                )}
                {exam.developerReply && (
                  <p>
                    <strong>Reply:</strong> {exam.developerReply}
                  </p>
                )}
                <div className="bid-actions" style={{ marginTop: "0.75rem" }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={busyId === exam.id}
                    onClick={() => {
                      void (async () => {
                        setBusyId(exam.id);
                        try {
                          const accessToken = await getAccessToken();
                          if (accessToken) {
                            await examApi.requestExamAnalysis(
                              exam.id,
                              accessToken
                            );
                          }
                          await load();
                        } finally {
                          setBusyId(null);
                        }
                      })();
                    }}
                  >
                    Run auto-score
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busyId === exam.id}
                    onClick={() => {
                      const q = window.prompt("Question for the developer:");
                      if (!q) return;
                      const guard = checkGuardrails("exam_question", q);
                      if (!guard.ok) {
                        setError(guard.message);
                        return;
                      }
                      void (async () => {
                        setBusyId(exam.id);
                        try {
                          await examApi.adminAskExam(exam.id, q);
                          await load();
                        } catch (cause) {
                          setError(
                            cause instanceof Error ? cause.message : "Ask failed"
                          );
                        } finally {
                          setBusyId(null);
                        }
                      })();
                    }}
                  >
                    Ask question
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busyId === exam.id}
                    onClick={() => {
                      const hold = !exam.autoApprovalHold;
                      const reason = hold
                        ? window.prompt("Why should auto-approval wait?")
                        : null;
                      if (hold && reason === null) return;
                      void (async () => {
                        setBusyId(exam.id);
                        try {
                          await examApi.adminSetExamHold(
                            exam.id,
                            hold,
                            reason ?? undefined
                          );
                          await load();
                        } catch (cause) {
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : "Could not change hold"
                          );
                        } finally {
                          setBusyId(null);
                        }
                      })();
                    }}
                  >
                    {exam.autoApprovalHold
                      ? "Clear auto-approve hold"
                      : "Hold auto-approval"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={busyId === exam.id}
                    onClick={() => {
                      void (async () => {
                        setBusyId(exam.id);
                        try {
                          await examApi.adminDecideExam(exam.id, true);
                          await load();
                        } catch (cause) {
                          setError(
                            cause instanceof Error ? cause.message : "Approve failed"
                          );
                        } finally {
                          setBusyId(null);
                        }
                      })();
                    }}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busyId === exam.id}
                    onClick={() => {
                      const notes = window.prompt("Rejection notes:");
                      if (notes === null) return;
                      void (async () => {
                        setBusyId(exam.id);
                        try {
                          await examApi.adminDecideExam(exam.id, false, notes);
                          await load();
                        } catch (cause) {
                          setError(
                            cause instanceof Error ? cause.message : "Reject failed"
                          );
                        } finally {
                          setBusyId(null);
                        }
                      })();
                    }}
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
