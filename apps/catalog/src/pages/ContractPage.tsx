import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { money } from "../format";
import * as api from "../lib/api";
import { REVIEW_CRITERIA, formatRating } from "../lib/reviewCriteria";
import { useStore } from "../store";
import type { ReviewScores } from "../types";

export default function ContractPage() {
  const { id } = useParams();
  const {
    projects,
    role,
    name,
    userId,
    connected,
    fundMilestone,
    submitMilestone,
    acceptMilestone,
    createChangeOrder,
    priceChangeOrder,
    decideChangeOrder,
    raiseDispute,
    resolveDispute,
    leaveReview,
    countersignContract,
  } = useStore();

  const project = projects.find((p) => p.id === id);
  const isBuyer = role === "buyer";

  const [changeTitle, setChangeTitle] = useState("");
  const [changeDetail, setChangeDetail] = useState("");
  const [priceAmount, setPriceAmount] = useState("900");
  const [priceWeeks, setPriceWeeks] = useState("1");
  const [pricingOrderId, setPricingOrderId] = useState<string | null>(null);
  const [deliverySummary, setDeliverySummary] = useState("");
  const [deliveryUrl, setDeliveryUrl] = useState("");
  const [activeMilestone, setActiveMilestone] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeScopeIds, setDisputeScopeIds] = useState<string[]>([]);
  const [showDispute, setShowDispute] = useState(false);
  const [reviewComment, setReviewComment] = useState("");
  const [scores, setScores] = useState<ReviewScores>({
    scope: 5,
    quality: 5,
    communication: 5,
    timeliness: 5,
  });
  const reviewAverage =
    (scores.scope + scores.quality + scores.communication + scores.timeliness) / 4;
  const [payError, setPayError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockNote, setBlockNote] = useState<string | null>(null);
  const [proofMilestoneId, setProofMilestoneId] = useState<string | null>(null);
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [paymentProofs, setPaymentProofs] = useState<
    api.ExternalPaymentProof[]
  >([]);

  useEffect(() => {
    if (!connected || !project) return;
    api
      .fetchExternalPaymentProofs(project.milestones.map((milestone) => milestone.id))
      .then(setPaymentProofs)
      .catch(() => setPaymentProofs([]));
  }, [connected, project]);

  async function confirmPaidOutside(projectId: string, milestoneId: string) {
    const ok = window.confirm(
      "Confirm only after you have already paid your developer for this milestone outside Okavo.\n\n" +
        "You should have accepted the submitted work against the signed scope first. " +
        "Okavo did not hold this money and cannot refund it. " +
        "Never pay the full build price up front."
    );
    if (!ok) return;
    setPayError(null);
    setConfirmingId(milestoneId);
    try {
      if (!connected) {
        fundMilestone(projectId, milestoneId);
        return;
      }
      await api.fundMilestone(
        milestoneId,
        paymentReference,
        paymentProof,
        userId ?? undefined
      );
      window.location.reload();
    } catch (cause) {
      setPayError(
        cause instanceof Error
          ? cause.message
          : "Could not confirm this outside payment."
      );
    } finally {
      setConfirmingId(null);
    }
  }

  if (!project) {
    return (
      <>
        <header className="topbar">
          <h1>Contract</h1>
        </header>
        <div className="content">
          <div className="card empty">
            <strong>Contract not found</strong>
            <Link to="/app">Back to workspace</Link>
          </div>
        </div>
      </>
    );
  }

  const included = project.scope.filter((item) => item.included);
  const excluded = project.scope.filter((item) => !item.included);
  const awarded = project.bids.find((bid) => bid.status === "awarded");
  const developerCountersigned = Boolean(
    project.developerSignedAt ||
      project.stage === "in_delivery" ||
      project.stage === "delivered" ||
      project.stage === "closed"
  );
  const awaitingCountersign = Boolean(awarded) && !developerCountersigned;
  const iAmAwardedDeveloper =
    !isBuyer && Boolean(awarded && userId && awarded.developerId === userId);
  const canCountersign =
    awaitingCountersign && iAmAwardedDeveloper;
  const contractValue = awarded?.amount ?? project.budgetMax;
  const releasedTotal = project.milestones
    .filter((m) => m.status === "released")
    .reduce((sum, m) => sum + m.amount, 0);
  const escrowTotal = project.milestones
    .filter((m) => m.status === "funded" || m.status === "submitted")
    .reduce((sum, m) => sum + m.amount, 0);
  const canReview =
    project.stage === "delivered" && project.reviews.length === 0 && isBuyer;

  function submitChangeOrder() {
    if (!project || !changeTitle.trim()) return;
    createChangeOrder(project.id, {
      title: changeTitle.trim(),
      description: changeDetail.trim() || "No further detail provided.",
      raisedBy: isBuyer ? "buyer" : "developer",
    });
    setChangeTitle("");
    setChangeDetail("");
  }

  function submitWork(milestoneId: string) {
    if (!project) return;
    submitMilestone(
      project.id,
      milestoneId,
      deliverySummary.trim() || "Work submitted for review.",
      deliveryUrl.trim()
    );
    setActiveMilestone(null);
    setDeliverySummary("");
    setDeliveryUrl("");
  }

  return (
    <>
      <header className="topbar">
        <h1>{project.title}</h1>
        <div className="topbar-actions">
          <span className="badge">{project.lockId ?? "Unsigned"}</span>
          <Link className="btn btn-secondary btn-sm" to={`/app/project/${project.id}`}>
            Requirement and bids
          </Link>
        </div>
      </header>

      <div className="content">
        <div className="split">
          <div className="stack">
            <div className="contract">
              <div className="contract-head">
                <div>
                  <h2>Contract {project.lockId}</h2>
                  <p>
                    {project.org} and {project.awardedTo ?? "an awarded developer"} ·
                    Locked {project.lockedAt}
                  </p>
                </div>
                <span className="contract-id">v{project.versions.length}</span>
              </div>

              <div className="contract-section">
                <h3>Commercial terms</h3>
                <div className="terms">
                  <div className="term">
                    <span>Agreed build price</span>
                    <strong>{money(contractValue)}</strong>
                  </div>
                  <div className="term">
                    <span>Monthly running cost</span>
                    <strong>{money(project.monthlyOps)}</strong>
                  </div>
                  <div className="term">
                    <span>Timeline</span>
                    <strong>{project.timelineWeeks} weeks</strong>
                  </div>
                </div>
              </div>

              <div className="contract-section">
                <h3>In scope — the definition of done</h3>
                {included.map((item) => (
                  <div className="scope-item" key={item.id}>
                    <span className="scope-mark">✓</span>
                    <div>
                      <strong>{item.label}</strong>
                      <p>{item.detail}</p>
                      {item.acceptanceCriteria && (
                        <p style={{ marginTop: "0.3rem", color: "var(--accent)" }}>
                          Accepted when: {item.acceptanceCriteria}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {excluded.length > 0 && (
                <div className="contract-section">
                  <h3>Out of scope</h3>
                  {excluded.map((item) => (
                    <div className="scope-item" key={item.id}>
                      <span className="scope-mark out">✕</span>
                      <div>
                        <strong>{item.label}</strong>
                        <p>{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="contract-section">
                <h3>Signatures</h3>
                <div className="signature-row">
                  <div className="signature signed">
                    <span>Buyer</span>
                    <strong>
                      {project.org} — signed {project.lockedAt}
                    </strong>
                  </div>
                  <div className={`signature${developerCountersigned ? " signed" : ""}`}>
                    <span>Developer</span>
                    <strong>
                      {developerCountersigned
                        ? `${awarded?.developerName ?? "Developer"} — countersigned${project.developerSignedAt ? ` ${project.developerSignedAt}` : ""}`
                        : awarded
                          ? "Awarded — awaiting countersign"
                          : "Signs after hire"}
                    </strong>
                  </div>
                </div>
                {awaitingCountersign && iAmAwardedDeveloper && (
                  <p style={{ color: "var(--muted)", marginTop: "0.85rem" }}>
                    Countersign to start delivery. You get paid after the buyer
                    accepts each milestone’s work — not as a full prepayment.
                  </p>
                )}
                {canCountersign && (
                  <div className="callout callout-warn" style={{ marginTop: "1rem" }}>
                    <span>!</span>
                    <span>
                      Countersigning means you accept the locked scope as the only
                      definition of done. Okavo does not hold build money.
                    </span>
                  </div>
                )}
                {canCountersign && (
                  <button
                    type="button"
                    className="btn btn-lg"
                    style={{ marginTop: "0.85rem" }}
                    onClick={() => countersignContract(project.id)}
                  >
                    Countersign the locked scope
                  </button>
                )}
                {awaitingCountersign && isBuyer && (
                  <p style={{ color: "var(--muted)", marginTop: "0.85rem" }}>
                    Waiting for {awarded?.developerName ?? "the developer"} to
                    countersign. Then they submit work → you accept → you pay
                    that milestone only.
                  </p>
                )}
              </div>

              <div className="contract-section">
                <h3>Warranty</h3>
                <p style={{ color: "var(--body)" }}>
                  Defects measured against this scope are fixed free for{" "}
                  {project.warrantyDays} days after acceptance. New behaviour is a
                  change order, not a warranty claim.
                </p>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h2>Milestones</h2>
                <span className="badge">
                  {money(releasedTotal)} accepted · {money(escrowTotal)} in
                  progress
                </span>
              </div>
              <div style={{ padding: "1.25rem" }} className="stack-sm">
                {payError && (
                  <div className="callout callout-warn" role="alert">
                    <span>!</span>
                    <span>{payError}</span>
                  </div>
                )}

                <div className="callout callout-info">
                  <span>i</span>
                  <span>
                    Payment attestation, not escrow. The developer submits
                    proof, you accept it against the signed scope, you pay that
                    milestone yourself, then you record the payment here. Never
                    pay the full build up front. The first milestone is capped
                    near 20%. Okavo does not hold or refund build money.
                  </span>
                </div>

                {project.milestones.length === 0 && (
                  <div className="empty">
                    <strong>No milestones yet</strong>
                    Milestones are created when a bid is awarded.
                  </div>
                )}

                {project.milestones.map((milestone) => (
                  <div className="milestone" key={milestone.id}>
                    <div className="milestone-top">
                      <div>
                        <strong>{milestone.title}</strong>
                        <p>{milestone.description}</p>
                      </div>
                      <div className="money">
                        <strong>{money(milestone.amount)}</strong>
                        <span>{milestone.status.replace("_", " ")}</span>
                      </div>
                    </div>

                    {milestone.deliverable && (
                      <div className="deliverable">
                        <strong>Submitted {milestone.deliverable.submittedAt}</strong>
                        <p>{milestone.deliverable.summary}</p>
                        {milestone.deliverable.previewUrl && (
                          <a
                            href={milestone.deliverable.previewUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {milestone.deliverable.previewUrl}
                          </a>
                        )}
                      </div>
                    )}

                    {isBuyer &&
                      milestone.status === "accepted" &&
                      proofMilestoneId === milestone.id && (
                        <div className="submit-box">
                          <div className="field">
                            <label htmlFor={`payment-reference-${milestone.id}`}>
                              Payment reference (optional)
                            </label>
                            <input
                              id={`payment-reference-${milestone.id}`}
                              value={paymentReference}
                              maxLength={200}
                              onChange={(event) =>
                                setPaymentReference(event.target.value)
                              }
                              placeholder="Bank, UPI, or transfer reference"
                            />
                          </div>
                          <div className="field">
                            <label htmlFor={`payment-proof-${milestone.id}`}>
                              Private receipt or proof (optional)
                            </label>
                            <input
                              id={`payment-proof-${milestone.id}`}
                              type="file"
                              accept="image/*,.pdf"
                              onChange={(event) =>
                                setPaymentProof(event.target.files?.[0] ?? null)
                              }
                            />
                            <span className="hint">
                              Only both contract parties and Okavo admins can open it.
                            </span>
                          </div>
                        </div>
                      )}

                    <div className="bid-actions">
                      {isBuyer && milestone.status === "submitted" && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => acceptMilestone(project.id, milestone.id)}
                        >
                          Accept work against signed scope
                        </button>
                      )}
                      {isBuyer && milestone.status === "accepted" && (
                        <>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              setProofMilestoneId((current) =>
                                current === milestone.id ? null : milestone.id
                              )
                            }
                          >
                            {proofMilestoneId === milestone.id
                              ? "Hide payment details"
                              : "Add payment details"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={confirmingId === milestone.id}
                            onClick={() =>
                              void confirmPaidOutside(project.id, milestone.id)
                            }
                          >
                            {confirmingId === milestone.id
                              ? "Confirming…"
                              : `Confirm paid ${money(milestone.amount)}`}
                          </button>
                        </>
                      )}
                      {isBuyer &&
                        milestone.status === "pending" &&
                        !awarded && (
                          <span className="badge badge-draft">
                            Hire a developer first
                          </span>
                        )}
                      {!isBuyer &&
                        developerCountersigned &&
                        (milestone.status === "in_progress" ||
                          milestone.status === "funded") && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => setActiveMilestone(milestone.id)}
                          >
                            Submit work
                          </button>
                        )}
                      {milestone.status === "released" && (
                        <>
                          <span className="badge badge-lock">Paid &amp; closed</span>
                          {paymentProofs
                            .filter((proof) => proof.milestoneId === milestone.id)
                            .map((proof) => (
                              <span key={proof.milestoneId}>
                                {proof.reference && (
                                  <span className="badge">
                                    Ref: {proof.reference}
                                  </span>
                                )}
                                {proof.proofPath && (
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => {
                                      void api
                                        .signedPaymentProofUrl(proof.proofPath!)
                                        .then((url) =>
                                          window.open(url, "_blank", "noopener,noreferrer")
                                        )
                                        .catch(() =>
                                          setPayError("Could not open the private proof.")
                                        );
                                    }}
                                  >
                                    Open private proof
                                  </button>
                                )}
                              </span>
                            ))}
                        </>
                      )}
                      {milestone.status === "accepted" && !isBuyer && (
                        <span className="badge badge-draft">
                          Work accepted — awaiting buyer payment
                        </span>
                      )}
                      {!isBuyer && milestone.status === "pending" && (
                        <span className="badge badge-draft">
                          {developerCountersigned
                            ? "Waiting for previous milestone to close"
                            : "Awaiting countersign"}
                        </span>
                      )}
                    </div>

                    {activeMilestone === milestone.id && (
                      <div className="submit-box">
                        <div className="field">
                          <label htmlFor="summary">What did you deliver?</label>
                          <textarea
                            id="summary"
                            rows={3}
                            value={deliverySummary}
                            onChange={(event) => setDeliverySummary(event.target.value)}
                            placeholder="Which locked scope items this covers."
                          />
                        </div>
                        <div className="field">
                          <label htmlFor="url">Preview link</label>
                          <input
                            id="url"
                            value={deliveryUrl}
                            onChange={(event) => setDeliveryUrl(event.target.value)}
                            placeholder="https://staging.example.com"
                          />
                        </div>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => submitWork(milestone.id)}
                          >
                            Submit for review
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setActiveMilestone(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h2>Change orders</h2>
                <span className="badge">{project.changeOrders.length}</span>
              </div>
              <div style={{ padding: "1.25rem" }} className="stack-sm">
                <div className="callout callout-info">
                  <span>i</span>
                  <span>
                    Change order protocol: (1) propose the delta, (2) developer
                    prices impact, (3) mutual accept appends a new locked scope
                    line. The original freeze stays intact.
                  </span>
                </div>

                {project.changeOrders.map((order) => (
                  <div className="bid" key={order.id}>
                    <div className="bid-top">
                      <div>
                        <strong>{order.title}</strong>
                        <p style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>
                          Raised by {order.raisedBy} on {order.createdAt}
                        </p>
                      </div>
                      <div className="money">
                        <strong>
                          {order.amount ? money(order.amount) : "Not priced"}
                        </strong>
                        <span>
                          {order.addedWeeks > 0
                            ? `+${order.addedWeeks} week${order.addedWeeks > 1 ? "s" : ""}`
                            : "No timeline impact"}
                        </span>
                      </div>
                    </div>
                    <p className="bid-note">{order.description}</p>
                    <div className="bid-actions">
                      {order.status === "proposed" && !isBuyer && (
                        pricingOrderId === order.id ? (
                          <div className="submit-box" style={{ width: "100%" }}>
                            <div className="field">
                              <label>Price (USD)</label>
                              <input
                                value={priceAmount}
                                onChange={(e) => setPriceAmount(e.target.value)}
                              />
                            </div>
                            <div className="field">
                              <label>Added weeks</label>
                              <input
                                value={priceWeeks}
                                onChange={(e) => setPriceWeeks(e.target.value)}
                              />
                            </div>
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => {
                                  const amount = Number(priceAmount);
                                  const weeks = Number(priceWeeks);
                                  if (!Number.isFinite(amount) || amount < 0) return;
                                  if (!Number.isFinite(weeks) || weeks < 0) return;
                                  priceChangeOrder(
                                    project.id,
                                    order.id,
                                    amount,
                                    weeks
                                  );
                                  setPricingOrderId(null);
                                }}
                              >
                                Send price
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setPricingOrderId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => setPricingOrderId(order.id)}
                          >
                            Price this change
                          </button>
                        )
                      )}
                      {order.status === "priced" && isBuyer && (
                        <>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() =>
                              decideChangeOrder(project.id, order.id, true)
                            }
                          >
                            Accept and add to scope
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              decideChangeOrder(project.id, order.id, false)
                            }
                          >
                            Decline
                          </button>
                        </>
                      )}
                      {order.status === "accepted" && (
                        <span className="badge badge-lock">Added to scope</span>
                      )}
                      {order.status === "declined" && (
                        <span className="badge badge-danger">Declined</span>
                      )}
                      {order.status === "proposed" && isBuyer && (
                        <span className="badge badge-draft">Awaiting a price</span>
                      )}
                    </div>
                  </div>
                ))}

                <div className="submit-box">
                  <div className="field">
                    <label htmlFor="co-title">Raise a change order</label>
                    <input
                      id="co-title"
                      value={changeTitle}
                      onChange={(event) => setChangeTitle(event.target.value)}
                      placeholder="Add a yearly statement PDF"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="co-detail">Why is it needed?</label>
                    <textarea
                      id="co-detail"
                      rows={2}
                      value={changeDetail}
                      onChange={(event) => setChangeDetail(event.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={!changeTitle.trim()}
                    onClick={submitChangeOrder}
                  >
                    Submit change order
                  </button>
                </div>
              </div>
            </div>

            {canReview && (
              <div className="card">
                <div className="card-head">
                  <h2>Close the contract</h2>
                  <span className="badge badge-accent">
                    Overall {reviewAverage.toFixed(1)} / 5
                  </span>
                </div>
                <div style={{ padding: "1.25rem" }}>
                  <p className="hint" style={{ marginBottom: "1.25rem" }}>
                    Four questions, answered from the contract you signed. The
                    overall score is their average — you do not set it
                    separately, so the number always matches the detail.
                  </p>

                  {REVIEW_CRITERIA.map((criterion) => (
                    <div className="field" key={criterion.key}>
                      <label htmlFor={`score-${criterion.key}`}>
                        {criterion.label}
                      </label>
                      <span
                        className="hint"
                        style={{ display: "block", marginBottom: "0.4rem" }}
                      >
                        {criterion.help}
                      </span>
                      <select
                        id={`score-${criterion.key}`}
                        value={scores[criterion.key]}
                        onChange={(event) =>
                          setScores((prev) => ({
                            ...prev,
                            [criterion.key]: Number(event.target.value),
                          }))
                        }
                      >
                        {criterion.options.map((option, index) => (
                          <option key={option} value={5 - index}>
                            {5 - index} — {option}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}

                  <div className="field">
                    <label htmlFor="review">
                      Anything the next buyer should know
                    </label>
                    <textarea
                      id="review"
                      rows={3}
                      value={reviewComment}
                      onChange={(event) => setReviewComment(event.target.value)}
                      placeholder="What went well, and what you would watch for."
                    />
                  </div>

                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      leaveReview(project.id, {
                        scores,
                        comment: reviewComment.trim() || "No comment left.",
                        author: name || project.org,
                      })
                    }
                  >
                    Publish review and close
                  </button>
                </div>
              </div>
            )}

            {project.reviews.length > 0 && (
              <div className="card">
                <div className="card-head">
                  <h2>Review</h2>
                </div>
                <div style={{ padding: "1.25rem" }}>
                  {project.reviews.map((review) => (
                    <div key={review.id}>
                      <strong>
                        {formatRating(review.rating)} / 5 ·{" "}
                        {review.matchedExpectation
                          ? "Matched the locked expectation"
                          : "Did not match"}
                      </strong>
                      <div className="score-grid">
                        {REVIEW_CRITERIA.map((criterion) => (
                          <div className="score-cell" key={criterion.key}>
                            <span>{criterion.short}</span>
                            <strong>{review.scores[criterion.key]}</strong>
                          </div>
                        ))}
                      </div>
                      <p style={{ color: "var(--body)", marginTop: "0.35rem" }}>
                        {review.comment}
                      </p>
                      <p style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>
                        {review.author} · {review.createdAt}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="sticky-side">
            <div className="card card-pad">
              <h3 style={{ fontSize: "0.9375rem", marginBottom: "0.85rem" }}>
                Money
              </h3>
              <div className="stat-row" style={{ gridTemplateColumns: "1fr", marginBottom: 0, gap: "0.6rem" }}>
                <div className="stat">
                  <span>Contract value</span>
                  <strong>{money(contractValue)}</strong>
                </div>
                <div className="stat">
                  <span>Confirmed outside Okavo</span>
                  <strong>{money(escrowTotal)}</strong>
                </div>
                <div className="stat">
                  <span>Accepted</span>
                  <strong>{money(releasedTotal)}</strong>
                </div>
              </div>
            </div>

            <div className="card card-pad">
              <h3 style={{ fontSize: "0.9375rem", marginBottom: "0.85rem" }}>
                Version history
              </h3>
              <div className="timeline">
                {project.versions.map((version) => (
                  <div className="timeline-item" key={version.version}>
                    <strong>v{version.version}</strong>
                    <p>{version.reason}</p>
                    <span>{version.createdAt}</span>
                  </div>
                ))}
                {project.versions.length === 0 && (
                  <p style={{ color: "var(--muted)" }}>Not locked yet.</p>
                )}
              </div>
            </div>

            <div className="card card-pad">
              <h3 style={{ fontSize: "0.9375rem", marginBottom: "0.6rem" }}>
                Dispute
              </h3>
              {project.dispute ? (
                <>
                  <span
                    className={
                      project.dispute.status === "resolved"
                        ? "badge badge-lock"
                        : "badge badge-danger"
                    }
                  >
                    {project.dispute.status}
                  </span>
                  <p style={{ color: "var(--body)", margin: "0.6rem 0" }}>
                    {project.dispute.reason}
                  </p>
                  {project.dispute.scopeItemIds &&
                    project.dispute.scopeItemIds.length > 0 && (
                      <ul
                        style={{
                          margin: "0 0 0.75rem",
                          paddingLeft: "1.1rem",
                          color: "var(--muted)",
                          fontSize: "0.8125rem",
                        }}
                      >
                        {project.dispute.scopeItemIds.map((scopeId) => {
                          const item = project.scope.find((s) => s.id === scopeId);
                          return (
                            <li key={scopeId}>
                              {item?.label ?? "Scope line"}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  {project.dispute.resolutionNote && (
                    <p style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>
                      {project.dispute.resolutionNote}
                    </p>
                  )}
                  {project.dispute.status !== "resolved" && role === "admin" && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm btn-block"
                      onClick={() =>
                        resolveDispute(
                          project.id,
                          "Resolved by Okavo review against the locked scope."
                        )
                      }
                    >
                      Mark resolved
                    </button>
                  )}
                  {project.dispute.status !== "resolved" && role !== "admin" && (
                    <p style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>
                      Okavo reviews open disputes against the locked scope lines
                      above.
                    </p>
                  )}
                </>
              ) : showDispute ? (
                <>
                  <div className="field">
                    <label>Which locked lines are in dispute?</label>
                    <div className="stack-sm" style={{ marginTop: "0.4rem" }}>
                      {included.map((item) => {
                        const checked = disputeScopeIds.includes(item.id);
                        return (
                          <label
                            key={item.id}
                            style={{
                              display: "flex",
                              gap: "0.5rem",
                              alignItems: "flex-start",
                              fontSize: "0.8125rem",
                              color: "var(--body)",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setDisputeScopeIds((prev) =>
                                  checked
                                    ? prev.filter((id) => id !== item.id)
                                    : [...prev, item.id]
                                )
                              }
                            />
                            <span>{item.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="dispute">What went wrong?</label>
                    <textarea
                      id="dispute"
                      rows={3}
                      value={disputeReason}
                      onChange={(event) => setDisputeReason(event.target.value)}
                      placeholder="Explain how the locked lines were not met."
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-block"
                    disabled={
                      !disputeReason.trim() || disputeScopeIds.length === 0
                    }
                    onClick={() => {
                      raiseDispute(
                        project.id,
                        disputeReason,
                        isBuyer ? "buyer" : "developer",
                        disputeScopeIds
                      );
                      setShowDispute(false);
                      setDisputeReason("");
                      setDisputeScopeIds([]);
                    }}
                  >
                    Open dispute
                  </button>
                </>
              ) : (
                <>
                  <p style={{ color: "var(--muted)", marginBottom: "0.85rem" }}>
                    Locked acceptance lines are the binding rubric. If a milestone
                    is rejected, Okavo mediates against those lines (human
                    arbitration on the checklist — not vibes). Okavo does not hold
                    build money while a dispute is open.
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm btn-block"
                    onClick={() => setShowDispute(true)}
                  >
                    Raise a dispute
                  </button>
                </>
              )}
            </div>

            {isBuyer && awarded?.developerId && (
              <div className="card card-pad" style={{ marginTop: "1rem" }}>
                <h2 style={{ marginTop: 0 }}>Request developer block</h2>
                <p className="hint">
                  If they ghosted you or cheated, ask Okavo to ban them from
                  bidding. This does not refund money paid outside Okavo.
                </p>
                <div className="field">
                  <label htmlFor="block-reason">What happened?</label>
                  <textarea
                    id="block-reason"
                    rows={3}
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    placeholder="Ghosted after payment, delivered nothing, fraud…"
                  />
                </div>
                {blockNote && <p className="hint">{blockNote}</p>}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={blockBusy || blockReason.trim().length < 8}
                  onClick={() => {
                    void (async () => {
                      setBlockBusy(true);
                      setBlockNote(null);
                      try {
                        await api.requestDeveloperBlock(
                          awarded.developerId!,
                          blockReason.trim(),
                          undefined,
                          project.id
                        );
                        setBlockNote("Request sent to Okavo for review.");
                        setBlockReason("");
                      } catch (cause) {
                        setBlockNote(
                          cause instanceof Error
                            ? cause.message
                            : "Could not send block request."
                        );
                      } finally {
                        setBlockBusy(false);
                      }
                    })();
                  }}
                >
                  {blockBusy ? "Sending…" : "Send block request"}
                </button>
              </div>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
