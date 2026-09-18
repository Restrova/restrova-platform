import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useRestaurant } from "../contexts/RestaurantContext.jsx";
import { useLocale } from "../contexts/LocaleContext.jsx";
import { api } from "../lib/api.js";
import { Button } from "../components/ui/Button.jsx";
import { integrationCopy } from "./integrationCopy.js";
export function IntegrationPage() {
  const { user, organization } = useAuth(),
    { selectedRestaurantId } = useRestaurant(),
    { locale } = useLocale();
  const c = integrationCopy[locale === "zh-CN" ? "zh" : locale] || integrationCopy.en;
  if (user?.role !== "owner") return <p role="alert">{c.owner}</p>;
  return (
    <Workspace
      key={`${user.id}:${organization?.id}:${selectedRestaurantId}`}
      scopeKey={`${organization?.id}:${selectedRestaurantId}`}
      copy={c}
      locale={locale}
    />
  );
}
function Workspace({ scopeKey, copy: c, locale }) {
  const client = useQueryClient(),
    [name, setName] = useState(""),
    [templateKey, setTemplate] = useState("sales"),
    [selected, setSelected] = useState(null),
    [job, setJob] = useState(null),
    [mappings, setMappings] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const list = useQuery({
    queryKey: ["integrations", scopeKey],
    queryFn: ({ signal }) => api("/integrations", { signal }),
    retry: false
  });
  const history = useQuery({
    queryKey: ["integration-history", scopeKey, selected],
    queryFn: ({ signal }) => api(`/integrations/${selected}/history`, { signal }),
    enabled: !!selected,
    retry: false
  });
  async function perform(task) {
    setBusy(true);
    setError(false);
    try {
      await task();
      await client.invalidateQueries({ queryKey: ["integration-history"] });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  function assign(result) {
    setJob(result);
    setMappings(result.mapping.columns.map(({ sourceColumn, targetField }) => ({ sourceColumn, targetField })));
  }
  return (
    <section className="intelligence-page" dir={locale === "ar" ? "rtl" : "ltr"}>
      <h1>{c.title}</h1>
      <p>{c.intro}</p>
      <Link to="/app/imports">{c.imports}</Link>
      {(error || list.isError || history.isError) && <p role="alert">{c.error}</p>}
      <form
        className="intelligence-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          perform(async () => {
            const result = await api("/integrations", { method: "POST", body: JSON.stringify({ name, templateKey }) });
            setName("");
            setSelected(result.id);
            setJob(null);
            await client.invalidateQueries({ queryKey: ["integrations"] });
          });
        }}
      >
        <label>
          {c.name}
          <input value={name} maxLength={100} required onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {c.type}
          <select value={templateKey} onChange={(e) => setTemplate(e.target.value)}>
            {["sales", "menu", "costs", "branches"].map((key) => (
              <option key={key} value={key}>
                {c[key]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={busy}>
          {c.create}
        </Button>
      </form>
      <label>
        {c.source}
        <select
          value={selected || ""}
          disabled={busy}
          onChange={(e) => {
            setSelected(Number(e.target.value) || null);
            setJob(null);
          }}
        >
          <option value="">{c.select}</option>
          {list.data?.connectors.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <>
          <p>{c.fileMode}</p>
          <label>
            {c.upload}
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file)
                  perform(async () => {
                    if (file.size > 5 * 1024 * 1024) throw new Error("large");
                    setJob(null);
                    const result = await api(
                      `/integrations/${selected}/preview?filename=${encodeURIComponent(file.name)}`,
                      { method: "POST", headers: { "Content-Type": "text/csv" }, body: await file.text() }
                    );
                    assign(result);
                  });
              }}
            />
          </label>
        </>
      )}
      {busy && <p role="status">{c.loading}</p>}
      {job && (
        <section>
          <h2>{c.preview}</h2>
          <p>
            {c.accepted}: {job.statistics.accepted} · {c.rejected}: {job.statistics.rejected} · {c.duplicates}:{" "}
            {job.statistics.duplicates}
          </p>
          {job.status === "preview_ready" && (
            <>
              <div className="report-table">
                <table>
                  <thead>
                    <tr>
                      <th>{c.column}</th>
                      <th>{c.target}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map((mapping, i) => (
                      <tr key={mapping.sourceColumn}>
                        <td>{mapping.sourceColumn}</td>
                        <td>
                          <select
                            aria-label={mapping.sourceColumn}
                            value={mapping.targetField || ""}
                            disabled={busy}
                            onChange={(e) => {
                              setMappings((rows) =>
                                rows.map((row, j) => (i === j ? { ...row, targetField: e.target.value || null } : row))
                              );
                              setJob((old) => ({ ...old, confirmationToken: null }));
                            }}
                          >
                            <option value="">{c.skip}</option>
                            {job.mapping.targetFields.map((field) => (
                              <option key={field.name} value={field.name}>
                                {field.name}
                                {field.required ? " *" : ""}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button
                disabled={busy}
                onClick={() =>
                  perform(async () =>
                    assign(
                      await api(`/integrations/${selected}/jobs/${job.id}/mapping`, {
                        method: "POST",
                        body: JSON.stringify({ mappings })
                      })
                    )
                  )
                }
              >
                {c.map}
              </Button>
              <Button
                disabled={busy || !job.confirmationToken}
                onClick={() =>
                  perform(async () =>
                    assign(
                      await api(`/integrations/${selected}/jobs/${job.id}/confirm`, {
                        method: "POST",
                        body: JSON.stringify({ confirmationToken: job.confirmationToken })
                      })
                    )
                  )
                }
              >
                {c.confirm}
              </Button>
            </>
          )}
          {job.status === "confirmed" && <p role="status">{c.done}</p>}
          {job.rowErrors?.map((row) => (
            <p key={row.rowNumber}>
              {row.rowNumber}: {row.errors.map((issue) => `${issue.field} (${issue.code})`).join(", ")}
            </p>
          ))}
        </section>
      )}
      {selected && (
        <section>
          <h2>{c.history}</h2>
          {history.data?.jobs.map((row) => (
            <p key={row.id}>
              {row.file.name} · {c[row.status] || row.status} · {c.accepted}: {row.statistics.imported || 0}
            </p>
          ))}
        </section>
      )}
    </section>
  );
}
