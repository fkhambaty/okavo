import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { money } from "../../format";
import { useStore } from "../../store";

const SCALES = ["Local business", "SMB", "Startup", "Enterprise"];

export default function DevBoard() {
  const { projects, developerAccount } = useStore();
  const [lockedOnly, setLockedOnly] = useState(true);
  const [scales, setScales] = useState<string[]>([]);
  const [minBudget, setMinBudget] = useState(0);

  const list = useMemo(
    () =>
      projects.filter((project) => {
        if (lockedOnly) {
          if (project.stage !== "clarifying" && project.stage !== "locked") {
            return false;
          }
        }
        if (scales.length > 0 && !scales.includes(project.scale)) return false;
        if (project.budgetMax < minBudget) return false;
        return true;
      }),
    [projects, lockedOnly, scales, minBudget]
  );

  function toggleScale(scale: string) {
    setScales((prev) =>
      prev.includes(scale) ? prev.filter((s) => s !== scale) : [...prev, scale]
    );
  }

  return (
    <>
      <header className="topbar">
        <h1>Find projects</h1>
        <div className="topbar-actions">
          <span className="badge badge-lock">
            {list.filter((p) => p.stage === "locked").length} open to bid
          </span>
        </div>
      </header>

      <div className="content">
        {!developerAccount.membershipPaid && (
          <div className="paywall" style={{ marginBottom: "1.25rem" }}>
            <div>
              <strong>Browse free — bidding activation is not open yet</strong>
              <p>
                Review sample screens and the checklist with no fee. Identity and
                exam approval can continue, but payment activation is waiting for
                Okavo&apos;s separate marketplace merchant account.
              </p>
            </div>
            <div>
              <Link className="btn btn-sm" to="/app/verification">
                View verification
              </Link>
            </div>
          </div>
        )}

        <div className="board">
          <aside className="filters">
            <div className="filter-block">
              <h4>Contract state</h4>
              <label className="check">
                <input
                  type="checkbox"
                  checked={lockedOnly}
                  onChange={(event) => setLockedOnly(event.target.checked)}
                />
                Locked &amp; clarifying only
              </label>
            </div>

            <div className="filter-block">
              <h4>Buyer type</h4>
              {SCALES.map((scale) => (
                <label className="check" key={scale}>
                  <input
                    type="checkbox"
                    checked={scales.includes(scale)}
                    onChange={() => toggleScale(scale)}
                  />
                  {scale}
                </label>
              ))}
            </div>

            <div className="filter-block">
              <h4>Minimum budget</h4>
              <select
                value={minBudget}
                onChange={(event) => setMinBudget(Number(event.target.value))}
                style={{
                  width: "100%",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: "0.5rem",
                }}
              >
                <option value={0}>Any</option>
                <option value={5000}>{money(5000)}+</option>
                <option value={15000}>{money(15000)}+</option>
                <option value={40000}>{money(40000)}+</option>
              </select>
            </div>
          </aside>

          <div className="stack-sm">
            {list.map((project) => (
              <Link
                className="project-row"
                to={`/app/project/${project.id}`}
                key={project.id}
              >
                <div className="project-top">
                  <div>
                    <h3>{project.title}</h3>
                    <div className="project-meta">
                      <span>{project.org}</span>
                      <span>{project.scale}</span>
                      <span>{project.postedAgo}</span>
                      <span>{project.publicBidCount} bids</span>
                      {project.stage === "drafting" ? (
                        <span className="badge badge-draft">Scope not locked</span>
                      ) : project.stage === "clarifying" ? (
                        <span className="badge badge-draft">Q&amp;A open</span>
                      ) : (
                        <span className="badge badge-lock">
                          Locked ·{" "}
                          {project.scope.filter((s) => s.included).length} items
                        </span>
                      )}
                      {project.awardedTo && (
                        <span className="badge">Awarded</span>
                      )}
                    </div>
                  </div>
                  <div className="money">
                    <strong>
                      {money(project.budgetMin)} – {money(project.budgetMax)}
                    </strong>
                    <span>
                      {money(project.monthlyOps)} / month · {project.timelineWeeks}{" "}
                      weeks
                    </span>
                  </div>
                </div>
                <p className="project-outcome">{project.outcome}</p>
                <div className="chips">
                  {project.skills.map((skill) => (
                    <span className="chip" key={skill}>
                      {skill}
                    </span>
                  ))}
                </div>
              </Link>
            ))}

            {list.length === 0 && (
              <div className="card empty">
                <strong>No projects match these filters</strong>
                Widen your budget range or include unlocked requirements.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
