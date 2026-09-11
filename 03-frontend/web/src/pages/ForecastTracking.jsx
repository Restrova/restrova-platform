import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext.jsx";
import { api } from "../lib/api.js";
import { Button } from "../components/ui/Button.jsx";
import { Card, CardContent } from "../components/ui/Card.jsx";
import { decisionCopy } from "./decisionCopy.js";
export function ForecastTracking({ filters, locale, money, branchId, branches = [] }) {
  const c = decisionCopy[locale] || decisionCopy.en,
    auth = useAuth(),
    client = useQueryClient(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  const scope = {
      scope: filters.scope,
      ...(filters.restaurantId ? { restaurantId: filters.restaurantId } : {}),
      ...(filters.branchId ? { branchId: filters.branchId } : {})
    },
    key = [auth.user?.id, auth.organization?.id, scope];
  const scores = useQuery({
    queryKey: ["forecast-accuracy", ...key],
    queryFn: ({ signal }) => api(`/forecasts/accuracy?${new URLSearchParams(scope)}`, { signal }),
    retry: false,
    enabled: scope.scope !== "branch" || Boolean(scope.branchId)
  });
  const seasons = useQuery({
    queryKey: ["seasons", auth.user?.id, auth.organization?.id, branchId],
    queryFn: ({ signal }) => api(`/seasons${branchId ? `?branchId=${branchId}` : ""}`, { signal }),
    retry: false
  });
  async function save(path, body) {
    setBusy(true);
    setFailed(false);
    setMessage("");
    try {
      const result = await api(path, { method: "POST", body: JSON.stringify(body) });
      setMessage(`${c.saved}${result.saved !== undefined ? `: ${result.saved}` : ""}`);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["forecast-accuracy"] }),
        client.invalidateQueries({ queryKey: ["seasons"] }),
        client.invalidateQueries({ queryKey: ["forecast"] })
      ]);
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <nav className="decision-links">
        <Link to="/app/imports">{c.imports}</Link>
        <Link to="/app/recommendations">{c.title}</Link>
      </nav>
      <Card>
        <CardContent>
          <h2>{c.accuracy}</h2>
          {auth.user?.role !== "viewer" && (
            <Button disabled={busy} onClick={() => save("/forecasts/snapshots", filters)}>
              {c.saveForecast}
            </Button>
          )}
          {message && <p role="status">{message}</p>}
          {(failed || scores.isError || seasons.isError) && <p role="alert">{c.error}</p>}
          {scores.isPending && <p>{c.loading}</p>}
          <div className="operations-table-scroll">
            <table className="operations-table">
              <thead>
                <tr>
                  <th>{c.days}</th>
                  <th>{c.count}</th>
                  <th>{c.mae}</th>
                  <th>{c.mape}</th>
                  <th>{c.accuracy}</th>
                </tr>
              </thead>
              <tbody>
                {scores.data?.groups.map((group) => (
                  <tr key={group.horizon}>
                    <th>{group.horizon}</th>
                    <td>{group.count}</td>
                    <td>{money(group.maeMinor)}</td>
                    <td>{group.mapeBps === null ? c.unknown : `${group.mapeBps / 100}%`}</td>
                    <td>{c[group.drift]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>{c.observational}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2>{c.interval}</h2>
          <p>{c.uncertainty}</p>
          {branches.map((branch) => (
            <details key={branch.branchId}>
              <summary>{branch.branchName}</summary>
              <ul>
                {branch.daily.map((day) => (
                  <li key={day.date}>
                    <bdi>{day.date}</bdi>:{" "}
                    {day.intervals?.revenueMinor?.status === "estimated"
                      ? `${money(day.intervals.revenueMinor.lower)} — ${money(day.intervals.revenueMinor.upper)}`
                      : c.unknown}
                    {day.seasonalContext?.map((event) => (
                      <span key={event.id}> · {event.name}</span>
                    ))}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2>{c.seasons}</h2>
          <p>{c.seasonIntro}</p>
          <ul>
            {seasons.data?.events.map((event) => (
              <li key={event.id}>
                {event.name} · {c[event.kind]} ·{" "}
                <bdi>
                  {event.fromDate} — {event.toDate}
                </bdi>{" "}
                · {event.source}
              </li>
            ))}
          </ul>
          {auth.user?.role === "owner" && (
            <form
              className="decision-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const element = e.currentTarget,
                  form = new FormData(element);
                if (
                  await save("/seasons", {
                    branchId: branchId ? Number(branchId) : null,
                    kind: form.get("kind"),
                    name: form.get("name"),
                    fromDate: form.get("fromDate"),
                    toDate: form.get("toDate"),
                    source: form.get("source")
                  })
                )
                  element.reset();
              }}
            >
              <label>
                {c.name}
                <input name="name" maxLength={120} required />
              </label>
              <label>
                {c.seasons}
                <select name="kind">
                  {["ramadan", "eid", "weekend", "holiday", "local_event", "restaurant"].map((kind) => (
                    <option key={kind} value={kind}>
                      {c[kind]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {c.from}
                <input name="fromDate" type="date" required />
              </label>
              <label>
                {c.to}
                <input name="toDate" type="date" required />
              </label>
              <label>
                {c.source}
                <input name="source" maxLength={300} required />
              </label>
              <Button type="submit" disabled={busy}>
                {c.add}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </>
  );
}
