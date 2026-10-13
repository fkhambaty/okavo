import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AreaTrend from "../../components/charts/AreaTrend";
import ChartCard from "../../components/charts/ChartCard";
import Donut from "../../components/charts/Donut";
import HBar from "../../components/charts/HBar";
import Meter from "../../components/charts/Meter";
import { money } from "../../format";
import * as api from "../../lib/api";
import { adminComposition } from "../../lib/roleAnalytics";
import { isBackendConfigured as isSupabaseConfigured } from "../../lib/backend";
import { errorMessage } from "../../lib/errors";
import type { TrendPoint } from "../../lib/chartMath";

function formatRatio(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

export default function AdminHome() {
  const [insights, setInsights] = useState<api.PlatformInsights | null>(null);
  const [liquidity, setLiquidity] = useState<api.LiquidityMetrics | null>(null);
  const [traffic, setTraffic] = useState<TrendPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    api
      .fetchInsights()
      .then(setInsights)
      .catch((cause) => setError(errorMessage(cause)));
    api
      .fetchLiquidity()
      .then(setLiquidity)
      .catch((cause) => setError(errorMessage(cause)));

    api
      .fetchAnalyticsDaily(30)
      .then((rows) =>
        setTraffic(
          rows.map((row) => ({
            id: row.day,
            label: new Date(row.day).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
            }),
            value: row.views,
            secondary: row.visitors,
          }))
        )
      )
      .catch(() => {
        // Traffic is optional on Insights — full detail lives on /app/traffic.
      });
  }, []);

  const composition = useMemo(
    () => (insights ? adminComposition(insights) : []),
    [insights]
  );

  const lockRate = insights?.projects
    ? Math.round((insights.lockedProjects / insights.projects) * 100)
    : 0;
  const verifiedShare = insights?.developers
    ? Math.round((insights.verifiedDevelopers / insights.developers) * 100)
    : 0;
  const bidsPerLock = insights?.lockedProjects
    ? insights.bids / insights.lockedProjects
    : 0;

  return (
    <>
      <header className="topbar">
        <h1>Platform insights</h1>
        <div className="topbar-actions">
          <Link className="btn btn-secondary btn-sm" to="/app/operations">
            Operations
          </Link>
          <Link className="btn btn-secondary btn-sm" to="/app/traffic">
            Traffic
          </Link>
          <Link className="btn btn-secondary btn-sm" to="/app/audit">
            Audit logs
          </Link>
          <Link className="btn btn-secondary btn-sm" to="/app/exams">
            Build exams
          </Link>
          <Link className="btn btn-secondary btn-sm" to="/app/blocks">
            Blocks
          </Link>
          <Link className="btn btn-secondary btn-sm" to="/app/verifications">
            Review queue
          </Link>
        </div>
      </header>

      <div className="content">
        {error && (
          <div className="callout callout-warn" style={{ marginBottom: "1rem" }}>
            <span>!</span>
            <span>{error}</span>
          </div>
        )}

        {!isSupabaseConfigured && (
          <div className="card empty">
            <strong>No live counts in this build</strong>
            The Worker URL is not configured, so this page does not estimate buyers, bids, or fees.
          </div>
        )}

        {!insights && isSupabaseConfigured ? (
          <div className="card empty">Loading platform data…</div>
        ) : insights ? (
          <>
            <div className="stat-row">
              <div className="stat">
                <span>Buyers</span>
                <strong>{insights.buyers}</strong>
              </div>
              <div className="stat">
                <span>Developers</span>
                <strong>{insights.developers}</strong>
              </div>
              <div className="stat">
                <span>Verified developers</span>
                <strong>{insights.verifiedDevelopers}</strong>
              </div>
              <div className="stat">
                <span>Awaiting ID review</span>
                <strong>{insights.pendingReviews}</strong>
              </div>
            </div>

            <div className="stat-row">
              <div className="stat">
                <span>Requirements posted</span>
                <strong>{insights.projects}</strong>
              </div>
              <div className="stat">
                <span>Contracts locked</span>
                <strong>{insights.lockedProjects}</strong>
              </div>
              <div className="stat">
                <span>Bids placed</span>
                <strong>{insights.bids}</strong>
              </div>
              <div className="stat">
                <span>Recorded milestone amounts</span>
                <strong>{money((insights.attestedInProgressCents ?? 0) / 100)}</strong>
                <span>Okavo does not hold this money</span>
              </div>
            </div>

            <div className="chart-grid">
              <ChartCard
                title="Marketplace composition"
                hint="Live counts from the database — not estimates"
                empty={composition.length === 0}
              >
                <HBar rows={composition} />
              </ChartCard>

              <ChartCard
                title="People on the platform"
                hint="Buyers vs developers by verification"
                empty={composition.length === 0}
              >
                <Donut
                  slices={composition.filter((row) =>
                    ["buyers", "verified", "unverified"].includes(row.id)
                  )}
                  centerLabel="people"
                  centerValue={String(
                    insights.buyers + insights.developers
                  )}
                />
              </ChartCard>
            </div>

            <div className="chart-grid-3">
              <ChartCard title="Lock rate" hint="Locked ÷ all requirements">
                <Meter
                  value={lockRate}
                  label="locked"
                  tone="accent"
                  caption={`${insights.lockedProjects} of ${insights.projects} requirements signed`}
                />
              </ChartCard>
              <ChartCard
                title="Verified share"
                hint="Identity-approved developers"
              >
                <Meter
                  value={verifiedShare}
                  label="verified"
                  tone="lock"
                  caption={`${insights.verifiedDevelopers} of ${insights.developers} developers`}
                />
              </ChartCard>
              <ChartCard title="Platform fees" hint="Posting + membership, paid">
                <div className="money" style={{ textAlign: "left", padding: "0.5rem 0" }}>
                  <strong style={{ fontSize: "2rem" }}>
                    {money(insights.feesCollectedCents / 100)}
                  </strong>
                  <span>
                    {bidsPerLock
                      ? `${bidsPerLock.toFixed(1)} bids per locked contract`
                      : "No locked contracts yet"}
                  </span>
                </div>
              </ChartCard>
            </div>

            {liquidity && (
              <div className="card" style={{ marginBottom: "1rem" }}>
                <div className="card-head">
                  <div>
                    <h2>Marketplace liquidity</h2>
                    <p className="hint">{liquidity.founderSeeds.note}</p>
                  </div>
                </div>
                <div className="stat-row">
                  <div className="stat">
                    <span>Verified buyers</span>
                    <strong>{liquidity.verifiedBuyers}</strong>
                  </div>
                  <div className="stat">
                    <span>Published requirements</span>
                    <strong>{liquidity.publishedRequirements}</strong>
                  </div>
                  <div className="stat">
                    <span>Locked requirements</span>
                    <strong>{liquidity.lockedRequirements}</strong>
                  </div>
                  <div className="stat">
                    <span>Verified developers</span>
                    <strong>{liquidity.verifiedDevelopers}</strong>
                  </div>
                </div>
                <div className="stat-row">
                  <div className="stat">
                    <span>Time to first bid</span>
                    <strong>
                      {liquidity.timeToFirstBidSamples
                        ? `${formatRatio(liquidity.timeToFirstBidHours, 1)} h`
                        : "—"}
                    </strong>
                    <span>
                      {liquidity.timeToFirstBidSamples
                        ? `${liquidity.timeToFirstBidSamples} requirement(s) with a bid`
                        : "No bid has followed a published requirement"}
                    </span>
                  </div>
                  <div className="stat">
                    <span>Bids per requirement</span>
                    <strong>{formatRatio(liquidity.bidsPerRequirement, 2)}</strong>
                  </div>
                  <div className="stat">
                    <span>Hire conversion</span>
                    <strong>
                      {liquidity.hireConversion === null
                        ? "—"
                        : `${Math.round(liquidity.hireConversion * 100)}%`}
                    </strong>
                    <span>
                      {liquidity.hiredCount} hired of {liquidity.lockedRequirements} locked
                    </span>
                  </div>
                  <div className="stat">
                    <span>Dispute rate</span>
                    <strong>
                      {liquidity.disputeRate === null
                        ? "—"
                        : `${Math.round(liquidity.disputeRate * 100)}%`}
                    </strong>
                    <span>
                      {liquidity.contractsWithDeveloper
                        ? `${liquidity.disputedContracts} of ${liquidity.contractsWithDeveloper} hired contracts`
                        : "No hired contract yet"}
                    </span>
                  </div>
                </div>
                <div style={{ padding: "0 1.25rem 1.25rem" }}>
                  <p className="hint">{liquidity.reviewSla.identity}</p>
                  <p className="hint">{liquidity.reviewSla.exam}</p>
                  <p className="hint">
                    Identity files are deleted {liquidity.reviewSla.identityFileRetentionDays} days after the review decision.
                  </p>
                </div>
              </div>
            )}

            <ChartCard
              title="Site traffic — last 30 days"
              hint="Page views and unique visitors. Open Traffic for channels and geography."
              action={
                <Link className="btn btn-secondary btn-sm" to="/app/traffic">
                  Full traffic
                </Link>
              }
              empty={traffic.length === 0}
              emptyTitle="No traffic in this window"
              emptyBody="Visits are counted on the live site. Local development is ignored on purpose."
            >
              <AreaTrend
                points={traffic}
                primaryLabel="view"
                secondaryLabel="visitor"
              />
            </ChartCard>
          </>
        ) : null}
      </div>
    </>
  );
}
