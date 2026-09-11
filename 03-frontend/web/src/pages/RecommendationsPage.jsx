import { DecisionEvidence, ScenarioResults, DecisionResult } from "./DecisionEvidence.jsx";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useRestaurant } from "../contexts/RestaurantContext.jsx";
import { useLocale } from "../contexts/LocaleContext.jsx";
import { api } from "../lib/api.js";
import { Button } from "../components/ui/Button.jsx";
import { Card, CardContent } from "../components/ui/Card.jsx";
import { decisionCopy, actionCopy } from "./decisionCopy.js";
export function RecommendationsPage() {
  const auth = useAuth(),
    context = useRestaurant(),
    { locale } = useLocale(),
    language = locale === "zh-CN" ? "zh" : locale,
    c = decisionCopy[language] || decisionCopy.en,
    actions = actionCopy[language] || actionCopy.en,
    client = useQueryClient();
  const [fromDate, setFrom] = useState(""),
    [toDate, setTo] = useState(""),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState(""),
    [days, setDays] = useState(7),
    [scenario, setScenario] = useState(null),
    [result, setResult] = useState(null);
  const branchId = Number(context.selectedBranchId),
    filters = { branchId, ...(fromDate ? { fromDate } : {}), ...(toDate ? { toDate } : {}) },
    key = [auth.user?.id, auth.organization?.id, context.selectedRestaurantId, branchId];
  const query = useQuery({
    queryKey: ["decisions", ...key, filters],
    queryFn: ({ signal }) => api(`/decisions?${new URLSearchParams(filters)}`, { signal }),
    enabled: Boolean(branchId),
    retry: false
  });
  const tracking = useQuery({
    queryKey: ["decision-actions", ...key],
    queryFn: ({ signal }) => api(`/decisions/actions?branchId=${branchId}`, { signal }),
    enabled: Boolean(branchId),
    retry: false
  });
  async function mutate(path, body, method = "POST") {
    setBusy(true);
    setError(false);
    try {
      const data = await api(path, { method, body: JSON.stringify(body) });
      await client.invalidateQueries({ queryKey: ["decision-actions"] });
      return data;
    } catch {
      setError(true);
      return null;
    } finally {
      setBusy(false);
    }
  }
  const write = auth.user?.role !== "viewer",
    owner = auth.user?.role === "owner";
  return (
    <section className="intelligence-page" dir={language === "ar" ? "rtl" : "ltr"}>
      <header>
        <h1>{c.title}</h1>
        <p>{c.intro}</p>
        <nav className="decision-links">
          <Link to="/app/imports">{c.imports}</Link>
          <Link to="/app/forecasts">{c.forecast}</Link>
        </nav>
      </header>
      <div className="intelligence-toolbar">
        <label>
          {c.from}
          <input type="date" value={fromDate} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          {c.to}
          <input type="date" value={toDate} onChange={(e) => setTo(e.target.value)} />
        </label>
        <Button
          onClick={() => {
            query.refetch();
            tracking.refetch();
          }}
        >
          {c.refresh}
        </Button>
      </div>
      {!branchId ? <p>{c.branch}</p> : query.isPending ? <p role="status">{c.loading}</p> : null}
      {(error || query.isError || tracking.isError) && <p role="alert">{c.error}</p>}
      {query.data && (
        <>
          <p>
            {c.revision}: <bdi>{query.data.dataRevision.revision}</bdi> ·{" "}
            <bdi>
              {query.data.scope.fromDate} — {query.data.scope.toDate}
            </bdi>
          </p>
          {!query.data.recommendations.length && <p>{c.empty}</p>}
          <div className="decision-grid">
            {query.data.recommendations.map((rec) => (
              <Card key={rec.key}>
                <CardContent>
                  <span className="decision-category">
                    {c[rec.category === "branch" ? "branchType" : rec.category]}
                  </span>
                  <h2>{rec.item?.name || actions[rec.recommendedAction]}</h2>
                  <p>{actions[rec.recommendedAction] || rec.recommendedAction}</p>
                  <DecisionEvidence rec={rec} currency={query.data.currencyCode} />
                  <p>{c.expected}</p>
                  <details>
                    <summary>{c.evidence}</summary>
                    <pre className="decision-evidence">
                      {JSON.stringify(
                        {
                          problem: rec.problem,
                          evidence: rec.evidence,
                          lineage: rec.lineage,
                          confidence: rec.confidence
                        },
                        null,
                        2
                      )}
                    </pre>
                  </details>
                  <div className="decision-links">
                    {owner && (
                      <Button
                        disabled={busy}
                        onClick={() => mutate("/decisions/actions", { branchId, ...rec.period, key: rec.key })}
                      >
                        {c.record}
                      </Button>
                    )}
                    {write && rec.item && ["pricing", "promotion", "cost"].includes(rec.category) && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setScenario({ itemCode: rec.item.itemCode, kind: rec.category });
                          setResult(null);
                        }}
                      >
                        {c.scenario}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
      {scenario && (
        <Card>
          <CardContent>
            <h2>
              {c.scenario}: <bdi>{scenario.itemCode}</bdi>
            </h2>
            <form
              className="decision-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const response = await mutate("/decisions/scenario", {
                  branchId,
                  ...scenario,
                  ...(scenario.kind === "cost"
                    ? {
                        scenarios: [
                          {
                            name: "Owner assumption",
                            proposedFoodCostMinor: Number(form.get("food")),
                            proposedPackagingMinor: Number(form.get("packaging"))
                          }
                        ]
                      }
                    : {
                        proposedPriceMinor: Number(form.get("price")),
                        demandChangesBps: String(form.get("demand")).split(",").map(Number)
                      }),
                  minimumMarginBps: Number(form.get("floor")),
                  ...(query.data ? { from: query.data.scope.from, to: query.data.scope.to } : {})
                });
                setResult(response);
              }}
            >
              {scenario.kind === "cost" ? (
                <>
                  <label>
                    {c.foodCost}
                    <input name="food" type="number" min="0" max="1000000000" required />
                  </label>
                  <label>
                    {c.packagingCost}
                    <input name="packaging" type="number" min="0" max="1000000000" required />
                  </label>
                </>
              ) : (
                <label>
                  {c.price}
                  <input name="price" type="number" min="1" max="1000000000" step="1" required />
                </label>
              )}
              <label>
                {c.floor}
                <input name="floor" type="number" min="0" max="10000" step="1" required />
              </label>
              {scenario.kind !== "cost" && (
                <label>
                  {c.demand}
                  <input name="demand" placeholder="-1000,0,1000" required />
                </label>
              )}
              <Button type="submit" disabled={busy}>
                {c.run}
              </Button>
            </form>
            {result && (
              <>
                <p role="status">{result.eligible ? c.eligible : c.blocked}</p>
                <p>{c.noGuarantee}</p>
                <ScenarioResults result={result} currency={query.data?.currencyCode} />
              </>
            )}
          </CardContent>
        </Card>
      )}
      <h2>{c.tracking}</h2>
      {write && (
        <div className="intelligence-toolbar">
          <label>
            {c.note}
            <input value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          </label>
          <label>
            {c.days}
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option>7</option>
              <option>14</option>
            </select>
          </label>
        </div>
      )}
      {tracking.data?.actions.map((row) => (
        <Card key={row.id}>
          <CardContent>
            <h3>{row.snapshot.item?.name || actions[row.snapshot.recommendedAction]}</h3>
            <p>{c[row.status]}</p>
            <p>{actions[row.snapshot.recommendedAction]}</p>
            <div className="decision-links">
              {(row.status === "proposed" && owner
                ? [
                    ["accepted", "accept"],
                    ["rejected", "reject"]
                  ]
                : row.status === "accepted" && write
                  ? [["action_taken", "act"]]
                  : row.status === "action_taken" && write
                    ? [["measured", "measure"]]
                    : []
              ).map(([status, label]) => (
                <Button
                  key={status}
                  disabled={busy || !note.trim()}
                  onClick={() =>
                    mutate(`/decisions/actions/${row.id}`, { status, version: row.version, note, days }, "PATCH")
                  }
                >
                  {c[label]}
                </Button>
              ))}
            </div>
            <details>
              <summary>{c.evidence}</summary>
              <pre className="decision-evidence">{JSON.stringify(row.history, null, 2)}</pre>
            </details>
            {row.result && (
              <>
                <p>{c.observational}</p>
                <DecisionResult result={row.result} currency={query.data?.currencyCode} />
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
