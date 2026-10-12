import { useCallback, useEffect, useMemo, useState } from "react";
import AreaTrend from "../../components/charts/AreaTrend";
import ChartCard from "../../components/charts/ChartCard";
import Donut from "../../components/charts/Donut";
import HBar from "../../components/charts/HBar";
import * as api from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import type { NamedValue, TrendPoint } from "../../lib/chartMath";
import { useStore } from "../../store";

const RANGES = [
  { days: 1, label: "24 hours" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
];

const BREAKDOWNS: {
  dimension: api.AnalyticsDimension;
  title: string;
  hint: string;
}[] = [
  { dimension: "channel", title: "Channels", hint: "How people arrived" },
  { dimension: "referrer_host", title: "Referring sites", hint: "The exact site they came from" },
  { dimension: "country", title: "Countries", hint: "Where visitors are" },
  { dimension: "city", title: "Cities", hint: "Down to the city" },
  { dimension: "path", title: "Pages", hint: "What they looked at" },
  { dimension: "device", title: "Devices", hint: "Phone, tablet or desktop" },
  { dimension: "browser", title: "Browsers", hint: "What they browse with" },
  { dimension: "os", title: "Operating systems", hint: "What they run" },
  { dimension: "utm_source", title: "Campaign sources", hint: "From your utm_source tags" },
  { dimension: "utm_campaign", title: "Campaigns", hint: "From your utm_campaign tags" },
  { dimension: "language", title: "Languages", hint: "Browser language" },
];

const DEVICE_TONES: Record<string, NamedValue["tone"]> = {
  desktop: "ink",
  mobile: "accent",
  tablet: "lock",
  phone: "accent",
};

type Data = {
  overview: api.AnalyticsOverview;
  daily: TrendPoint[];
  breakdowns: Record<string, NamedValue[]>;
};

function toBars(rows: api.BreakdownRow[], tone?: NamedValue["tone"]): NamedValue[] {
  return rows.map((row) => ({
    id: row.label,
    label: row.label,
    value: row.views,
    tone: tone ?? DEVICE_TONES[row.label.toLowerCase()] ?? "accent",
  }));
}

export default function AdminAnalytics() {
  const { connected } = useStore();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (range: number) => {
    if (!connected) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [overview, daily, ...lists] = await Promise.all([
        api.fetchAnalyticsOverview(range),
        api.fetchAnalyticsDaily(range),
        ...BREAKDOWNS.map((item) =>
          api.fetchAnalyticsBreakdown(item.dimension, range)
        ),
      ]);

      const breakdowns: Record<string, NamedValue[]> = {};
      BREAKDOWNS.forEach((item, index) => {
        breakdowns[item.dimension] = toBars(lists[index] ?? []);
      });

      setData({
        overview,
        daily: daily.map((row) => ({
          id: row.day,
          label: new Date(row.day).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
          }),
          value: row.views,
          secondary: row.visitors,
        })),
        breakdowns,
      });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [connected]);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const overview = data?.overview;
  const returning = overview
    ? Math.max(0, overview.uniqueVisitors - overview.newVisitors)
    : 0;

  const visitorMix = useMemo((): NamedValue[] => {
    if (!overview) return [];
    return [
      {
        id: "new",
        label: "New visitors",
        value: overview.newVisitors,
        tone: "accent" as const,
      },
      {
        id: "returning",
        label: "Returning",
        value: returning,
        tone: "lock" as const,
      },
    ].filter((row) => row.value > 0);
  }, [overview, returning]);

  return (
    <>
      <header className="topbar">
        <h1>Traffic</h1>
        <div className="topbar-actions">
          <label className="visually-hidden" htmlFor="range">
            Time range
          </label>
          <select
            id="range"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            {RANGES.map((range) => (
              <option key={range.days} value={range.days}>
                Last {range.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="content">
        {!connected && (
          <div className="card empty">
            Traffic analytics are available only for the live admin workspace.
          </div>
        )}
        {error && (
          <div className="callout callout-warn" role="alert" style={{ marginBottom: "1rem" }}>
            <span>!</span>
            <span>{error}</span>
          </div>
        )}

        {loading && !data && <div className="card empty">Loading traffic…</div>}

        {overview && (
          <>
            <div className="stat-row">
              <div className="stat">
                <span>Unique visitors</span>
                <strong>{overview.uniqueVisitors.toLocaleString()}</strong>
              </div>
              <div className="stat">
                <span>Page views</span>
                <strong>{overview.pageViews.toLocaleString()}</strong>
              </div>
              <div className="stat">
                <span>Visits</span>
                <strong>{overview.sessions.toLocaleString()}</strong>
              </div>
              <div className="stat">
                <span>Countries</span>
                <strong>{overview.countries.toLocaleString()}</strong>
              </div>
            </div>

            <div className="stat-row">
              <div className="stat">
                <span>New visitors</span>
                <strong>{overview.newVisitors.toLocaleString()}</strong>
              </div>
              <div className="stat">
                <span>Returning</span>
                <strong>{returning.toLocaleString()}</strong>
              </div>
              <div className="stat">
                <span>Pages per visit</span>
                <strong>
                  {overview.sessions
                    ? (overview.pageViews / overview.sessions).toFixed(1)
                    : "—"}
                </strong>
              </div>
              <div className="stat">
                <span>Views while signed in</span>
                <strong>{overview.signedInViews.toLocaleString()}</strong>
              </div>
            </div>

            {overview.pageViews === 0 ? (
              <div className="card empty">
                <strong>No traffic recorded yet</strong>
                <p>
                  Visits are counted on the live site only — local development
                  is ignored on purpose. Open okavo.org in a browser and this
                  fills in within a few seconds.
                </p>
              </div>
            ) : (
              <>
                <div className="chart-grid">
                  <ChartCard
                    title="Page views per day"
                    hint="Orange = views · green = unique visitors"
                  >
                    <AreaTrend
                      points={data.daily}
                      primaryLabel="view"
                      secondaryLabel="visitor"
                    />
                  </ChartCard>
                  <ChartCard
                    title="New vs returning"
                    hint="Unique visitors in this range"
                    empty={visitorMix.length === 0}
                  >
                    <Donut
                      slices={visitorMix}
                      centerLabel="visitors"
                      centerValue={overview.uniqueVisitors.toLocaleString()}
                    />
                  </ChartCard>
                </div>

                <div className="chart-grid">
                  {BREAKDOWNS.map((item) => {
                    const rows = data.breakdowns[item.dimension] ?? [];
                    return (
                      <ChartCard
                        key={item.dimension}
                        title={item.title}
                        hint={item.hint}
                        empty={rows.length === 0}
                        emptyTitle="Nothing recorded yet"
                      >
                        <HBar rows={rows} />
                      </ChartCard>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
