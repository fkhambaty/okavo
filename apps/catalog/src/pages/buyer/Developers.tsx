import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DEVELOPER_LISTINGS } from "../../data";
import * as api from "../../lib/api";
import { formatRating } from "../../lib/reviewCriteria";
import { useStore } from "../../store";
import type { DeveloperListing, DeveloperTier } from "../../types";
import { errorMessage } from "../../lib/errors";

type SortKey = "rating" | "delivered" | "rate" | "scope";

const TIERS: DeveloperTier[] = ["Verified", "Principal"];

const RATING_STEPS = [
  { value: 0, label: "Any rating" },
  { value: 4, label: "4.0+" },
  { value: 4.5, label: "4.5+" },
  { value: 4.8, label: "4.8+" },
];

const DELIVERED_STEPS = [
  { value: 0, label: "Any experience" },
  { value: 5, label: "5+ contracts" },
  { value: 15, label: "15+ contracts" },
  { value: 30, label: "30+ contracts" },
];

const SORTS: { value: SortKey; label: string }[] = [
  { value: "rating", label: "Highest rated" },
  { value: "scope", label: "Best at delivering the locked scope" },
  { value: "delivered", label: "Most contracts delivered" },
  { value: "rate", label: "Lowest hourly rate" },
];

export default function Developers() {
  const { connected } = useStore();
  const [developers, setDevelopers] = useState<DeveloperListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [minRating, setMinRating] = useState(0);
  const [minDelivered, setMinDelivered] = useState(0);
  const [tiers, setTiers] = useState<DeveloperTier[]>([]);
  const [maxRate, setMaxRate] = useState("");
  const [country, setCountry] = useState("");
  const [reviewedOnly, setReviewedOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("rating");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!connected) {
        setDevelopers(DEVELOPER_LISTINGS);
        setError(null);
        setLoading(false);
        return;
      }
      try {
        const list = await api.fetchDeveloperDirectory();
        if (!cancelled) setDevelopers(list);
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
  }, [connected]);

  const countries = useMemo(
    () =>
      Array.from(new Set(developers.map((d) => d.country).filter(Boolean))).sort(),
    [developers]
  );

  const results = useMemo(() => {
    const rateCeiling = Number(maxRate);
    const filtered = developers.filter((dev) => {
      if (minRating > 0 && (dev.rating ?? 0) < minRating) return false;
      if (dev.contractsDelivered < minDelivered) return false;
      if (tiers.length > 0 && !tiers.includes(dev.tier)) return false;
      if (reviewedOnly && dev.reviewCount === 0) return false;
      if (country && dev.country !== country) return false;
      if (
        maxRate.trim() !== "" &&
        Number.isFinite(rateCeiling) &&
        (dev.hourlyRate ?? 0) > rateCeiling
      ) {
        return false;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      switch (sort) {
        case "rating":
          return (b.rating ?? -1) - (a.rating ?? -1);
        case "scope":
          return (b.criteria.scope ?? -1) - (a.criteria.scope ?? -1);
        case "delivered":
          return b.contractsDelivered - a.contractsDelivered;
        case "rate":
          return (a.hourlyRate ?? Infinity) - (b.hourlyRate ?? Infinity);
        default: {
          const exhaustive: never = sort;
          return exhaustive;
        }
      }
    });
  }, [developers, minRating, minDelivered, tiers, maxRate, country, reviewedOnly, sort]);

  function toggleTier(tier: DeveloperTier) {
    setTiers((prev) =>
      prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier]
    );
  }

  function clearFilters() {
    setMinRating(0);
    setMinDelivered(0);
    setTiers([]);
    setMaxRate("");
    setCountry("");
    setReviewedOnly(false);
  }

  const filtersActive =
    minRating > 0 ||
    minDelivered > 0 ||
    tiers.length > 0 ||
    maxRate.trim() !== "" ||
    country !== "" ||
    reviewedOnly;

  return (
    <>
      <header className="topbar">
        <h1>Developers</h1>
        <div className="topbar-actions">
          <span className="badge">
            {results.length} of {developers.length}
          </span>
        </div>
      </header>

      <div className="content">
        <div className="board">
          <aside className="filters">
            <div className="filter-group">
              <h4>Minimum rating</h4>
              {RATING_STEPS.map((step) => (
                <label className="check" key={step.value}>
                  <input
                    type="radio"
                    name="min-rating"
                    checked={minRating === step.value}
                    onChange={() => setMinRating(step.value)}
                  />
                  {step.label}
                </label>
              ))}
            </div>

            <div className="filter-group">
              <h4>Track record</h4>
              {DELIVERED_STEPS.map((step) => (
                <label className="check" key={step.value}>
                  <input
                    type="radio"
                    name="min-delivered"
                    checked={minDelivered === step.value}
                    onChange={() => setMinDelivered(step.value)}
                  />
                  {step.label}
                </label>
              ))}
            </div>

            <div className="filter-group">
              <h4>Tier</h4>
              {TIERS.map((tier) => (
                <label className="check" key={tier}>
                  <input
                    type="checkbox"
                    checked={tiers.includes(tier)}
                    onChange={() => toggleTier(tier)}
                  />
                  {tier}
                </label>
              ))}
            </div>

            <div className="filter-group">
              <h4>Budget</h4>
              <label className="visually-hidden" htmlFor="max-rate">
                Maximum hourly rate in USD
              </label>
              <input
                id="max-rate"
                value={maxRate}
                onChange={(event) => setMaxRate(event.target.value)}
                placeholder="Max $ / hour"
                inputMode="numeric"
              />
            </div>

            <div className="filter-group">
              <h4>Country</h4>
              <label className="visually-hidden" htmlFor="country">
                Country
              </label>
              <select
                id="country"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
              >
                <option value="">Anywhere</option>
                {countries.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <h4>Evidence</h4>
              <label className="check">
                <input
                  type="checkbox"
                  checked={reviewedOnly}
                  onChange={(event) => setReviewedOnly(event.target.checked)}
                />
                Reviewed by a buyer
              </label>
            </div>

            {filtersActive && (
              <button type="button" className="link-button" onClick={clearFilters}>
                Clear all filters
              </button>
            )}
          </aside>

          <div className="stack-sm">
            <div className="sort-row">
              <label htmlFor="sort">Sort by</label>
              <select
                id="sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
              >
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div className="callout callout-warn" role="alert">
                <span>!</span>
                <span>{error}</span>
              </div>
            )}

            {loading && (
              <div className="card empty">
                <strong>Loading developers…</strong>
              </div>
            )}

            {!loading && results.length === 0 && (
              <div className="card empty">
                <strong>No developers match these filters</strong>
                <p>
                  Every developer here is identity-verified. Loosen a filter to
                  see more.
                </p>
                {filtersActive && (
                  <button type="button" className="link-button" onClick={clearFilters}>
                    Clear all filters
                  </button>
                )}
              </div>
            )}

            {results.map((dev) => (
              <Link
                key={dev.id}
                to={`/app/developers/${dev.id}`}
                className="dev-row"
              >
                <div className="dev-row-main">
                  <div>
                    <h3>{dev.name}</h3>
                    <p className="dev-headline">{dev.headline}</p>
                    <div className="project-meta">
                      <span className="badge badge-accent">{dev.tier}</span>
                      <span>{dev.country}</span>
                      <span>{dev.contractsDelivered} delivered</span>
                      {dev.hourlyRate !== null && <span>${dev.hourlyRate}/hr</span>}
                    </div>
                  </div>
                  <div className="dev-score">
                    <strong>{formatRating(dev.rating)}</strong>
                    <span>
                      {dev.reviewCount === 0
                        ? "No reviews yet"
                        : `${dev.reviewCount} review${dev.reviewCount === 1 ? "" : "s"}`}
                    </span>
                  </div>
                </div>

                {dev.reviewCount > 0 && (
                  <div className="dev-criteria">
                    {dev.lockedScopeRate !== null && (
                      <span>
                        Locked scope delivered{" "}
                        <strong>{dev.lockedScopeRate}%</strong>
                      </span>
                    )}
                    <span>
                      Scope <strong>{formatRating(dev.criteria.scope)}</strong>
                    </span>
                    <span>
                      Quality <strong>{formatRating(dev.criteria.quality)}</strong>
                    </span>
                    <span>
                      Communication{" "}
                      <strong>{formatRating(dev.criteria.communication)}</strong>
                    </span>
                    <span>
                      Timeliness{" "}
                      <strong>{formatRating(dev.criteria.timeliness)}</strong>
                    </span>
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
