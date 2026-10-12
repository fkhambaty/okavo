import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ContractPanel from "../../components/ContractPanel";
import { DEVELOPER_LISTINGS } from "../../data";
import { initials, money } from "../../format";
import * as api from "../../lib/api";
import { collectFee } from "../../lib/checkout";
import { hireFeeUsdLabel } from "../../lib/exam";
import { formatRating } from "../../lib/reviewCriteria";
import { useStore } from "../../store";
import type { DeveloperListing } from "../../types";

export default function BuyerProject() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    projects,
    lockProject,
    setBidStatus,
    awardBid,
    inviteBuilder,
    connected,
    name,
    email,
  } = useStore();
  const project = projects.find((p) => p.id === id);

  // A price means nothing without a track record next to it.
  const [ratings, setRatings] = useState<Record<string, DeveloperListing>>({});
  const [messaging, setMessaging] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteNote, setInviteNote] = useState<string | null>(null);
  const [hireBusy, setHireBusy] = useState<string | null>(null);
  const [hireError, setHireError] = useState<string | null>(null);
  const [clarifications, setClarifications] = useState<api.ClarificationRequest[]>([]);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [answerError, setAnswerError] = useState<string | null>(null);


  /** Opens (creating if needed) the conversation with one bidder. */
  async function message(developerId: string) {
    if (!id) return;
    setMessaging(developerId);
    try {
      const threadId = await api.openThread(id, developerId);
      navigate(`/app/messages?thread=${threadId}`);
    } catch {
      navigate("/app/messages");
    } finally {
      setMessaging(null);
    }
  }

  useEffect(() => {
    if (!connected) {
      setRatings(
        Object.fromEntries(DEVELOPER_LISTINGS.map((dev) => [dev.id, dev]))
      );
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await api.fetchDeveloperDirectory();
        if (cancelled) return;
        setRatings(Object.fromEntries(list.map((dev) => [dev.id, dev])));
      } catch {
        // The bids are still usable without the ratings overlay.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connected]);

  useEffect(() => {
    if (!connected || !id) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await api.fetchClarifications(id);
        if (!cancelled) setClarifications(rows);
      } catch {
        // Optional overlay.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, id]);

  if (!project) {
    return (
      <>
        <header className="topbar">
          <h1>Requirement</h1>
        </header>
        <div className="content">
          <div className="card empty">
            <strong>This requirement no longer exists</strong>
            <Link to="/app">Back to overview</Link>
          </div>
        </div>
      </>
    );
  }

  if (project.ownedByMe === false) {
    return (
      <>
        <header className="topbar">
          <h1>Requirement</h1>
        </header>
        <div className="content">
          <div className="card empty">
            <strong>This requirement belongs to another buyer</strong>
            <Link to="/app">Back to overview</Link>
          </div>
        </div>
      </>
    );
  }

  const clarifying = project.stage === "clarifying";
  const frozen =
    project.stage !== "drafting" && project.stage !== "clarifying";
  const awarded = project.bids.find((bid) => bid.status === "awarded");

  return (
    <>
      <header className="topbar">
        <h1>{project.title}</h1>
        <div className="topbar-actions">
          {frozen ? (
            <>
              <span className="badge badge-lock">{project.lockId}</span>
              <Link
                className="btn btn-secondary btn-sm"
                to={`/app/contract/${project.id}`}
              >
                Open contract
              </Link>
            </>
          ) : clarifying ? (
            <span className="badge badge-accent">Q&amp;A · ~48h recommended</span>
          ) : (
            <span className="badge badge-draft">Draft</span>
          )}
        </div>
      </header>

      <div className="content">
        <div className="split">
          <div className="stack">
            <ContractPanel
              project={project}
              viewer="buyer"
              onLock={() => lockProject(project.id)}
            />


            {clarifying && (
              <div className="card card-pad">
                <h3 style={{ fontSize: "0.9375rem", marginBottom: "0.6rem" }}>
                  Clarification inbox
                </h3>
                <p style={{ color: "var(--muted)", marginBottom: "0.85rem" }}>
                  Answer line questions before you freeze. Recommended window ~48 hours.
                </p>
                {clarifications.length === 0 ? (
                  <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
                    No questions yet. Developers can ask while this is in Q&amp;A.
                  </p>
                ) : (
                  <div className="stack-sm">
                    {clarifications.map((row) => (
                      <div key={row.id} className="bid">
                        <p className="bid-note"><strong>Q:</strong> {row.question}</p>
                        {row.answer ? (
                          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
                            <strong>A:</strong> {row.answer}
                          </p>
                        ) : (
                          <>
                            <div className="field">
                              <label>Your answer</label>
                              <textarea
                                rows={2}
                                value={answerDrafts[row.id] ?? ""}
                                onChange={(e) =>
                                  setAnswerDrafts((prev) => ({
                                    ...prev,
                                    [row.id]: e.target.value,
                                  }))
                                }
                              />
                            </div>
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => {
                                void (async () => {
                                  const answer = (answerDrafts[row.id] ?? "").trim();
                                  if (!answer) return;
                                  setAnswerError(null);
                                  try {
                                    await api.answerClarification(row.id, answer);
                                    setClarifications(
                                      await api.fetchClarifications(project.id)
                                    );
                                  } catch (cause) {
                                    setAnswerError(
                                      cause instanceof Error
                                        ? cause.message
                                        : "Could not save that answer."
                                    );
                                  }
                                })();
                              }}
                            >
                              Post answer
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="card">
              <div className="card-head">
                <h2>
                  {frozen
                    ? "Bids on this locked contract"
                    : clarifying
                      ? "Bidding opens after freeze"
                      : "Bids"}
                </h2>
                <span className="badge">{project.publicBidCount} received</span>
              </div>
              <div style={{ padding: "1.25rem" }} className="stack-sm">
                {hireError && (
                  <div className="callout callout-warn" role="alert">
                    <span>!</span>
                    <span>{hireError}</span>
                  </div>
                )}
                {answerError && (
                  <div className="callout callout-warn" role="alert">
                    <span>!</span>
                    <span>{answerError}</span>
                  </div>
                )}
                {!frozen && (
                  <div className="callout callout-warn">
                    <span>!</span>
                    <span>
                      {clarifying
                        ? "Q&A is open. Answer developer clarifications, then freeze to open bids (about 48 hours is recommended)."
                        : "Finish the draft, then open Q&A or freeze when the preview looks right."}
                    </span>
                  </div>
                )}

                {frozen && project.publicBidCount === 0 && (
                  <div className="empty">
                    <strong>No bids yet</strong>
                    Locked. Verified developers can now bid.
                  </div>
                )}

                {frozen &&
                  project.bids.map((bid) => {
                    const record = ratings[bid.developerId];
                    return (
                    <div className="bid" key={bid.id}>
                      <div className="bid-top">
                        <div className="bid-who">
                          <span className="avatar">
                            {initials(bid.developerName)}
                          </span>
                          <span>
                            <strong>{bid.developerName}</strong>
                            <span>
                              {bid.country} · {bid.tier} · bid {bid.submittedAt}
                            </span>
                          </span>
                        </div>
                        <div className="money">
                          <strong>{money(bid.amount)}</strong>
                          <span>
                            {money(bid.monthlyOps)} / month · {bid.weeks} weeks
                          </span>
                        </div>
                      </div>

                      {record && (
                        <div className="bid-record">
                          <span>
                            <strong>{formatRating(record.rating)}</strong>
                            {record.reviewCount === 0
                              ? " no reviews yet"
                              : ` from ${record.reviewCount} review${record.reviewCount === 1 ? "" : "s"}`}
                          </span>
                          {record.lockedScopeRate !== null && (
                            <span>
                              Delivered the locked scope{" "}
                              <strong>{record.lockedScopeRate}%</strong> of the time
                            </span>
                          )}
                          <span>{record.contractsDelivered} contracts delivered</span>
                          <Link to={`/app/developers/${bid.developerId}`}>
                            See reviews
                          </Link>
                        </div>
                      )}

                      <p className="bid-note">{bid.note}</p>
                      <div className="bid-actions">
                        {bid.status === "awarded" ? (
                          <>
                            <span className="badge badge-lock">
                              {project.developerSignedAt ||
                              project.stage === "in_delivery" ||
                              project.stage === "delivered" ||
                              project.stage === "closed"
                                ? "Hired — countersigned"
                                : "Hired — awaiting countersign"}
                            </span>
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => navigate(`/app/contract/${project.id}`)}
                            >
                              Open contract
                            </button>
                          </>
                        ) : bid.status === "declined" ? (
                          <span className="badge badge-danger">Declined</span>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn btn-sm"
                              disabled={Boolean(awarded) || hireBusy === bid.id}
                              onClick={() => {
                                void (async () => {
                                  setHireError(null);
                                  if (!connected) {
                                    awardBid(project.id, bid.id);
                                    return;
                                  }
                                  setHireBusy(bid.id);
                                  try {
                                    const paid = await api.hireSuccessFeePaid(bid.id);
                                    if (!paid) {
                                      const result = await collectFee(
                                        "platform_fee",
                                        { name, email },
                                        { bidId: bid.id }
                                      );
                                      if (result.status !== "paid") {
                                        setHireError(
                                          result.status === "cancelled"
                                            ? "Hire fee payment cancelled."
                                            : result.status === "pending"
                                              ? "Payment still confirming — try Hire again shortly."
                                              : result.message
                                        );
                                        return;
                                      }
                                    }
                                    awardBid(project.id, bid.id);
                                  } catch (cause) {
                                    setHireError(
                                      cause instanceof Error
                                        ? cause.message
                                        : "Could not complete hire."
                                    );
                                  } finally {
                                    setHireBusy(null);
                                  }
                                })();
                              }}
                            >
                              {hireBusy === bid.id
                                ? "Opening fee…"
                                : `Hire · pay 10% fee (${hireFeeUsdLabel(Math.round(bid.amount * 100))})`}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() =>
                                setBidStatus(project.id, bid.id, "shortlisted")
                              }
                            >
                              Shortlist
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() =>
                                setBidStatus(project.id, bid.id, "declined")
                              }
                            >
                              Decline
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={messaging === bid.developerId}
                              onClick={() => message(bid.developerId)}
                            >
                              {messaging === bid.developerId
                                ? "Opening…"
                                : "Ask a question"}
                            </button>
                            {bid.status === "shortlisted" && (
                              <span className="badge badge-accent">
                                Shortlisted
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    );
                  })}
              </div>
            </div>
          </div>

          <aside className="sticky-side">
            <div className="card card-pad">
              <h3 style={{ fontSize: "0.9375rem", marginBottom: "0.85rem" }}>
                Requirement
              </h3>
              <p style={{ color: "var(--body)", marginBottom: "1rem" }}>
                {project.outcome}
              </p>
              <div className="chips">
                {project.skills.map((skill) => (
                  <span className="chip" key={skill}>
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            <div className="card card-pad">
              <h3 style={{ fontSize: "0.9375rem", marginBottom: "0.6rem" }}>
                What happens next
              </h3>
              <div className="timeline">
                <div className="timeline-item">
                  <strong>1</strong>
                  <p>Publish for Q&amp;A, then freeze the requirement lock</p>
                </div>
                <div className="timeline-item">
                  <strong>2</strong>
                  <p>Verified developers bid on identical scope</p>
                </div>
                <div className="timeline-item">
                  <strong>3</strong>
                  <p>Hire, fund the first milestone, then countersign</p>
                </div>
                <div className="timeline-item">
                  <strong>4</strong>
                  <p>Accept later milestones against the signed checklist</p>
                </div>
              </div>
            </div>

            {frozen && (
              <div className="card card-pad">
                <h3 style={{ fontSize: "0.9375rem", marginBottom: "0.6rem" }}>
                  Invite a builder
                </h3>
                <p style={{ color: "var(--muted)", marginBottom: "0.85rem" }}>
                  Email someone the locked brief. They still bid on the same
                  frozen scope.
                </p>
                <div className="field">
                  <label htmlFor="invite-email">Builder email</label>
                  <input
                    id="invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="builder@example.com"
                  />
                </div>
                {inviteNote && (
                  <p
                    style={{
                      color: "var(--muted)",
                      fontSize: "0.8125rem",
                      marginBottom: "0.6rem",
                    }}
                  >
                    {inviteNote}
                  </p>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm btn-block"
                  disabled={inviteBusy || !inviteEmail.trim()}
                  onClick={() => {
                    void (async () => {
                      setInviteBusy(true);
                      setInviteNote(null);
                      try {
                        await inviteBuilder(project.id, inviteEmail.trim());
                        setInviteNote(`Invite sent to ${inviteEmail.trim()}.`);
                        setInviteEmail("");
                      } catch {
                        setInviteNote(
                          "Could not send invite. Check the email and try again."
                        );
                      } finally {
                        setInviteBusy(false);
                      }
                    })();
                  }}
                >
                  {inviteBusy ? "Sending…" : "Send invite"}
                </button>
              </div>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
