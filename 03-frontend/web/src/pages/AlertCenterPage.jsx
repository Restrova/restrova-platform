import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/ui/Button.jsx";
import { Card, CardContent } from "../components/ui/Card.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useLocale } from "../contexts/LocaleContext.jsx";
import { useRestaurant } from "../contexts/RestaurantContext.jsx";
import { subscribeToAlerts } from "../lib/push.js";
import { api } from "../lib/api.js";
import { intelligenceCopy, ruleLabels, ruleTypes, thresholdKeys, reviewActions } from "./intelligenceCopy.js";

const request = (path, body, method = "POST") => api(path, { method, body: JSON.stringify(body) });
export function AlertCenterPage() {
  const auth = useAuth(),
    context = useRestaurant();
  return (
    <AlertCenterSurface
      key={[auth.user?.id, auth.organization?.id, context.selectedRestaurantId, context.selectedBranchId].join(":")}
    />
  );
}
function AlertCenterSurface() {
  const auth = useAuth(),
    context = useRestaurant(),
    { locale: uiLocale } = useLocale();
  const locale = uiLocale === "zh-CN" ? "zh" : uiLocale;
  const copy = intelligenceCopy[locale] || intelligenceCopy.en;
  const [status, setStatus] = useState("open"),
    [before, setBefore] = useState("");
  const scope = context.selectedBranchId
    ? { scope: "branch", branchId: context.selectedBranchId }
    : { scope: "restaurant", restaurantId: context.selectedRestaurantId };
  const identity = [auth.user?.id, auth.organization?.id, context.selectedRestaurantId, context.selectedBranchId];
  const client = useQueryClient();
  const list = useQuery({
    queryKey: ["alerts", ...identity, status, before],
    queryFn: ({ signal }) =>
      api(`/alerts?${new URLSearchParams({ ...scope, status, ...(before ? { before } : {}) })}`, { signal }),
    retry: false
  });
  const refresh = useMutation({
    mutationFn: () => request("/alerts/refresh", scope),
    onSuccess: () => {
      setBefore("");
      client.invalidateQueries({ queryKey: ["alerts"] });
    }
  });
  return (
    <section className="intelligence-page" dir={locale === "ar" ? "rtl" : "ltr"}>
      <header className="intelligence-heading">
        <div>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
        </div>
        {auth.user?.role !== "viewer" && (
          <Button loading={refresh.isPending} onClick={() => refresh.mutate()}>
            {copy.refresh}
          </Button>
        )}
      </header>
      <div className="intelligence-toolbar">
        <label>
          {copy.scope}
          <strong>
            {context.branches?.find((b) => String(b.id) === context.selectedBranchId)?.name || copy.restaurant}
          </strong>
        </label>
        <label>
          {copy.title}
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setBefore("");
            }}
          >
            {["open", "resolved", "all"].map((value) => (
              <option key={value} value={value}>
                {copy[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {refresh.isError && <p role="alert">{copy.error}</p>}
      {refresh.data && (
        <div role="status" className="intelligence-results">
          <strong>{copy.checked}</strong>
          {["triggered", "not_triggered", "insufficient_data"].map((value) => (
            <span key={value}>
              {value === "not_triggered"
                ? copy.noTrigger
                : value === "insufficient_data"
                  ? copy.insufficient
                  : copy.triggered}
              : {refresh.data.evaluations.filter((item) => item.status === value).length}
            </span>
          ))}
        </div>
      )}
      {list.isPending ? (
        <p role="status">{copy.loading}</p>
      ) : list.isError ? (
        <div role="alert">
          {copy.error} <Button onClick={() => list.refetch()}>{copy.retry}</Button>
        </div>
      ) : (
        <>
          {!list.data.items.length && (
            <Card>
              <CardContent>
                <p>{copy.empty}</p>
              </CardContent>
            </Card>
          )}
          {list.data.items.map((item) => (
            <AlertCard
              key={`${identity.join(":")}:${item.id}:${item.version}`}
              item={item}
              copy={copy}
              locale={locale}
              readOnly={auth.user?.role === "viewer"}
            />
          ))}
          {list.data.nextBefore && (
            <Button variant="secondary" onClick={() => setBefore(String(list.data.nextBefore))}>
              {copy.more}
            </Button>
          )}
        </>
      )}
      <Preferences
        key={`${identity.join(":")}:${locale}`}
        copy={copy}
        locale={locale}
        identity={identity}
        branches={context.branches || []}
      />
    </section>
  );
}
function AlertCard({ item, copy, locale, readOnly }) {
  const { formatCurrency } = useLocale(),
    client = useQueryClient();
  const [expanded, setExpanded] = useState(false),
    [comment, setComment] = useState(""),
    [assigned, setAssigned] = useState(item.assignedTo || "");
  const snap = item.snapshot,
    label = (ruleLabels[locale] || ruleLabels.en)[ruleTypes.indexOf(snap.type)] || snap.title;
  const history = useQuery({
    queryKey: ["alert-history", item.id, item.version],
    queryFn: ({ signal }) => api(`/alerts/${item.id}/history`, { signal }),
    enabled: expanded,
    retry: false
  });
  const change = useMutation({
    mutationFn: (body) => request(`/alerts/${item.id}`, { ...body, version: item.version }, "PATCH"),
    onSuccess: () => {
      setComment("");
      client.invalidateQueries({ queryKey: ["alerts"] });
      client.invalidateQueries({ queryKey: ["alert-history", item.id] });
    }
  });
  const money = (value) =>
    value == null
      ? copy.noData
      : formatCurrency(
          value /
            10 **
              new Intl.NumberFormat("en", { style: "currency", currency: snap.currencyCode || "SAR" }).resolvedOptions()
                .maximumFractionDigits,
          { currency: snap.currencyCode || "SAR" }
        );
  const evidence = snap.evidence || {},
    lines = evidence.current?.lineage || evidence.current?.salesLineage || [];
  return (
    <Card className={`intelligence-alert intelligence-alert--${snap.severity || "INFO"}`}>
      <CardContent>
        <div className="intelligence-alert-title">
          <h2>{label}</h2>
          <span className="intelligence-severity">{copy[snap.severity] || copy.INFO}</span>
        </div>
        <p>
          {snap.branchName} · {copy.recurrence}: {item.recurrenceCount}
        </p>
        <p>{(reviewActions[locale] || reviewActions.en)[ruleTypes.indexOf(snap.type)] || snap.suggestedAction}</p>
        <details>
          <summary>{copy.evidence}</summary>
          <dl className="intelligence-facts">
            <div>
              <dt>
                {copy.current} · {copy.revenue}
              </dt>
              <dd>{money(evidence.current?.revenueMinor)}</dd>
            </div>
            <div>
              <dt>
                {copy.previous} · {copy.revenue}
              </dt>
              <dd>{money(evidence.comparison?.revenueMinor ?? snap.baselineMedianMinor)}</dd>
            </div>
            <div>
              <dt>{copy.measured}</dt>
              <dd>
                {snap.measuredBps ?? snap.distanceBps ?? copy.noData} {copy.percentage}
              </dd>
            </div>
            <div>
              <dt>{copy.threshold}</dt>
              <dd>{snap.thresholdBps ?? copy.noData}</dd>
            </div>
          </dl>
          <p>{evidence.dates?.current?.join(", ") || evidence.current?.date}</p>
          <p>{evidence.dates?.comparison?.join(", ") || evidence.baseline?.map((day) => day.date).join(", ")}</p>
          {evidence.ledger && (
            <dl className="intelligence-facts">
              <div>
                <dt>{copy.food}</dt>
                <dd>{money(evidence.ledger.current?.foodCostsMinor)}</dd>
              </div>
              <div>
                <dt>{copy.netProfit}</dt>
                <dd>{money(evidence.ledger.current?.netProfitMinor)}</dd>
              </div>
            </dl>
          )}
          <SourceList lines={lines} title={`${copy.current} · ${copy.sources}`} copy={copy} />
          <SourceList
            lines={evidence.comparison?.lineage || evidence.baseline?.flatMap((day) => day.salesLineage) || []}
            title={`${copy.previous} · ${copy.sources}`}
            copy={copy}
          />
          <SourceList
            lines={Object.values(evidence.ledger?.lineage?.current || {}).flat()}
            title={`${copy.food} · ${copy.sources}`}
            copy={copy}
          />
        </details>
        <details onToggle={(e) => setExpanded(e.currentTarget.open)}>
          <summary>{copy.history}</summary>
          {history.isPending ? (
            <p>{copy.loading}</p>
          ) : history.isError ? (
            <p role="alert">{copy.error}</p>
          ) : (
            <ul>
              {history.data?.events.map((event) => (
                <li key={event.id}>
                  {copy[event.action] || event.action} · <bdi>{event.created_at}</bdi>
                  {event.detail.comment && <p>{event.detail.comment}</p>}
                </li>
              ))}
            </ul>
          )}
          {!readOnly && (
            <div className="intelligence-actions">
              <label>
                {copy.assign}
                <select value={assigned} onChange={(e) => setAssigned(e.target.value)}>
                  <option value="">{copy.unassigned}</option>
                  {history.data?.assignees.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                loading={change.isPending}
                onClick={() => change.mutate({ action: "assign", assignedTo: assigned ? Number(assigned) : null })}
              >
                {copy.assign}
              </Button>
              <label>
                {copy.comment}
                <textarea maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />
              </label>
              <Button
                loading={change.isPending}
                disabled={!comment.trim()}
                onClick={() => change.mutate({ action: "comment", comment })}
              >
                {copy.addComment}
              </Button>
            </div>
          )}
        </details>
        {!readOnly && (
          <Button
            variant="secondary"
            loading={change.isPending}
            onClick={() => change.mutate({ action: item.status === "open" ? "resolve" : "reopen" })}
          >
            {item.status === "open" ? copy.resolve : copy.reopen}
          </Button>
        )}
        {change.isError && <p role="alert">{copy.error}</p>}
      </CardContent>
    </Card>
  );
}
function Preferences({ copy, locale, identity, branches }) {
  const prefs = useQuery({
    queryKey: ["alert-preferences", ...identity],
    queryFn: ({ signal }) => api("/alerts/preferences", { signal }),
    retry: false
  });
  const delivery = useQuery({
    queryKey: ["alert-delivery", ...identity],
    queryFn: ({ signal }) => api("/alerts/notifications", { signal }),
    retry: false
  });
  return (
    <details className="intelligence-preferences">
      <summary>{copy.preferences}</summary>
      {prefs.isPending ? (
        <p>{copy.loading}</p>
      ) : prefs.isError ? (
        <p role="alert">{copy.error}</p>
      ) : (
        <PreferenceForm
          key={prefs.dataUpdatedAt}
          initial={prefs.data}
          copy={copy}
          locale={locale}
          branches={branches}
          delivery={delivery}
        />
      )}
    </details>
  );
}
function PreferenceForm({ initial, copy, locale, branches, delivery }) {
  const [value, setValue] = useState(initial),
    client = useQueryClient();
  const push = useMutation({
    mutationFn: () => subscribeToAlerts(delivery.data?.publicPushKey),
    onSuccess: (subscription) =>
      setValue({
        ...value,
        pushSubscription: subscription,
        pushToken: "",
        channels: [...new Set([...value.channels, "push"])]
      })
  });
  const save = useMutation({
    mutationFn: () => request("/alerts/preferences", { ...value, language: locale }, "PUT"),
    onSuccess: () => client.invalidateQueries({ queryKey: ["alert-preferences"] })
  });
  const queue = useMutation({
    mutationFn: () => request("/alerts/notifications/queue", {}),
    onSuccess: () => delivery.refetch()
  });
  const toggle = (key, item) =>
    setValue({
      ...value,
      [key]: value[key].includes(item) ? value[key].filter((entry) => entry !== item) : [...value[key], item]
    });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <fieldset disabled={save.isPending}>
        <legend>{copy.types}</legend>
        <div className="intelligence-checks">
          {ruleTypes.map((type, i) => (
            <label key={type}>
              <input type="checkbox" checked={value.types.includes(type)} onChange={() => toggle("types", type)} />
              {(ruleLabels[locale] || ruleLabels.en)[i]}
            </label>
          ))}
        </div>
        <div className="intelligence-form-grid">
          {thresholdKeys.map((key, i) => (
            <label key={key}>
              {(ruleLabels[locale] || ruleLabels.en)[i]} · {copy.percentage}
              <input
                type="number"
                min="0"
                max={i === 0 || i === 2 ? 100000 : 10000}
                step="1"
                required
                value={value.thresholds[key]}
                onChange={(e) =>
                  setValue({
                    ...value,
                    thresholds: { ...value.thresholds, [key]: e.target.value === "" ? "" : Number(e.target.value) }
                  })
                }
              />
            </label>
          ))}
        </div>
        <label>
          <input
            type="checkbox"
            checked={value.branchIds === null}
            onChange={(e) => setValue({ ...value, branchIds: e.target.checked ? null : [] })}
          />
          {copy.allBranches}
        </label>
        {value.branchIds !== null && (
          <div className="intelligence-checks">
            {branches.map((branch) => (
              <label key={branch.id}>
                <input
                  type="checkbox"
                  checked={value.branchIds.includes(Number(branch.id))}
                  onChange={() => toggle("branchIds", Number(branch.id))}
                />
                {branch.name}
              </label>
            ))}
          </div>
        )}
        <label>
          {copy.frequency}
          <select value={value.frequency} onChange={(e) => setValue({ ...value, frequency: e.target.value })}>
            {["off", "immediate", "daily", "weekly"].map((key) => (
              <option key={key} value={key}>
                {copy[key]}
              </option>
            ))}
          </select>
        </label>
        <div className="intelligence-checks">
          {["email", "push", "whatsapp", "slack", "teams"].map((channel) => (
            <label key={channel}>
              <input
                type="checkbox"
                checked={value.channels.includes(channel)}
                disabled={
                  (!delivery.data?.available[channel] ||
                    (channel === "push" && !value.pushSubscription && !value.pushToken)) &&
                  !value.channels.includes(channel)
                }
                onChange={() => toggle("channels", channel)}
              />
              {copy[channel]} {!delivery.data?.available[channel] && `(${copy.unavailable})`}
            </label>
          ))}
        </div>
        {delivery.data?.publicPushKey && (
          <Button variant="secondary" loading={push.isPending} onClick={() => push.mutate()}>
            {copy.device}
          </Button>
        )}
        {value.pushSubscription && <p role="status">{copy.pushReady}</p>}
        {push.isError && <p role="alert">{copy.error}</p>}
        {value.channels.includes("whatsapp") && (
          <>
            <label>
              {copy.phone}
              <input
                dir="ltr"
                type="tel"
                required
                value={value.whatsappPhone}
                onChange={(e) => setValue({ ...value, whatsappPhone: e.target.value })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={value.whatsappConsent}
                onChange={(e) => setValue({ ...value, whatsappConsent: e.target.checked })}
              />
              {copy.consent}
            </label>
          </>
        )}
        <Button type="submit" loading={save.isPending}>
          {copy.save}
        </Button>
      </fieldset>
      {save.isError && <p role="alert">{copy.error}</p>}
      {save.isSuccess && <p role="status">{copy.saved}</p>}
      <h3>{copy.delivery}</h3>
      {delivery.data?.counts.map((item) => (
        <p key={item.status}>
          {copy[item.status]}: {item.count}
        </p>
      ))}
      <Button variant="secondary" loading={queue.isPending} onClick={() => queue.mutate()}>
        {copy.queue}
      </Button>
      {queue.isError && <p role="alert">{copy.error}</p>}
    </form>
  );
}

function SourceList({ lines, title, copy }) {
  const [limit, setLimit] = useState(30);
  return (
    <div>
      <strong>
        {title} ({lines.length})
      </strong>
      <ul>
        {lines.slice(0, limit).map((line, i) => (
          <li key={i}>
            <bdi>{line.orderId ? `${line.orderId} · ${line.lineId}` : line.sourceReference}</bdi>
          </li>
        ))}
      </ul>
      {lines.length > limit && (
        <Button variant="secondary" onClick={() => setLimit(limit + 30)}>
          {copy.more}
        </Button>
      )}
    </div>
  );
}
