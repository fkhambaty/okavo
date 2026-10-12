import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DEVELOPER_LISTINGS } from "../../data";
import * as api from "../../lib/api";
import { REVIEW_CRITERIA, formatRating } from "../../lib/reviewCriteria";
import { useStore } from "../../store";
import type { DeveloperListing } from "../../types";
import { errorMessage } from "../../lib/errors";

export default function DeveloperProfile() {
  const { id } = useParams();
  const { connected } = useStore();
  const [developer, setDeveloper] = useState<DeveloperListing | null>(null);
  const [reviews, setReviews] = useState<api.DeveloperReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      if (!connected) {
        setDeveloper(DEVELOPER_LISTINGS.find((item) => item.id === id) ?? null);
        setReviews([]);
        setError(null);
        setLoading(false);
        return;
      }
      try {
        const [listing, history] = await Promise.all([
          api.fetchDeveloperListing(id),
          api.fetchDeveloperReviews(id),
        ]);
        if (!cancelled) {
          setDeveloper(listing);
          setReviews(history);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(errorMessage(cause));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, id]);

  if (loading) {
    return (
      <>
        <header className="topbar">
          <h1>Developer</h1>
        </header>
        <div className="content">
          <div className="card empty">
            <strong>Loading profile…</strong>
          </div>
        </div>
      </>
    );
  }

  if (error || !developer) {
    return (
      <>
        <header className="topbar">
          <h1>Developer</h1>
        </header>
        <div className="content">
          <div className="card empty">
            <strong>{error ?? "This developer is no longer listed"}</strong>
            <Link to="/app/developers">Back to developers</Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="topbar">
        <h1>{developer.name}</h1>
        <div className="topbar-actions">
          <span className="badge badge-accent">{developer.tier}</span>
          <Link className="btn btn-secondary btn-sm" to="/app/developers">
            All developers
          </Link>
        </div>
      </header>

      <div className="content content-narrow">
        <div className="stack">
          <div className="card card-pad">
            <div className="dev-row-main">
              <div>
                <p className="dev-headline">{developer.headline}</p>
                <div className="project-meta" style={{ marginTop: "0.5rem" }}>
                  <span>{developer.country}</span>
                  <span>{developer.contractsDelivered} contracts delivered</span>
                  {developer.hourlyRate !== null && (
                    <span>${developer.hourlyRate}/hr</span>
                  )}
                </div>
              </div>
              <div className="dev-score">
                <strong>{formatRating(developer.rating)}</strong>
                <span>
                  {developer.reviewCount === 0
                    ? "No reviews yet"
                    : `${developer.reviewCount} review${developer.reviewCount === 1 ? "" : "s"}`}
                </span>
              </div>
            </div>
          </div>

          {developer.reviewCount > 0 && (
            <div className="card">
              <div className="card-head">
                <h2>How buyers scored them</h2>
                {developer.lockedScopeRate !== null && (
                  <span className="badge badge-lock">
                    Locked scope delivered {developer.lockedScopeRate}%
                  </span>
                )}
              </div>
              <div style={{ padding: "1.25rem" }}>
                <div className="score-grid">
                  {REVIEW_CRITERIA.map((criterion) => (
                    <div className="score-cell" key={criterion.key}>
                      <span>{criterion.short}</span>
                      <strong>
                        {formatRating(developer.criteria[criterion.key])}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <h2>Reviews</h2>
            </div>
            <div style={{ padding: "1.25rem" }} className="stack-sm">
              {reviews.length === 0 && (
                <div className="empty">
                  <strong>
                    {connected
                      ? "No reviews yet"
                      : "Review history is not included in demo data"}
                  </strong>
                  <p>
                    {connected
                      ? "Reviews appear here only after a buyer closes a contract, so every one of them is attached to real, paid work."
                      : "Live accounts show reviews attached to completed contracts."}
                  </p>
                </div>
              )}

              {reviews.map((review) => (
                <div className="review-row" key={review.id}>
                  <div className="review-head">
                    <div>
                      <strong>{review.projectTitle}</strong>
                      <span>
                        {review.buyerOrg} · {review.createdAt}
                      </span>
                    </div>
                    <span
                      className={
                        review.matchedExpectation
                          ? "badge badge-lock"
                          : "badge badge-draft"
                      }
                    >
                      {formatRating(review.rating)} / 5
                    </span>
                  </div>

                  <div className="score-grid">
                    {REVIEW_CRITERIA.map((criterion) => (
                      <div className="score-cell" key={criterion.key}>
                        <span>{criterion.short}</span>
                        <strong>{review.scores[criterion.key]}</strong>
                      </div>
                    ))}
                  </div>

                  <p>{review.comment}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
