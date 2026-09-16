import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { Link } from "react-router-dom";
import { Card, CardContent } from "../components/ui/Card.jsx";
export function CopilotAnswer({ answer, copy: c }) {
  return (
    <Card>
      <CardContent>
        {answer.stale && <p role="status">{c.stale}</p>}
        <p>
          {c.period}:{" "}
          <bdi>
            {answer.period.fromDate} — {answer.period.toDate}
          </bdi>{" "}
          · {c.revision}: {answer.dataRevision.revision}
        </p>
        {!answer.claims.length ? (
          <p>{answer.content}</p>
        ) : (
          <>
            {answer.executiveSummary?.map((item, i) => (
              <p key={i}>
                {item.text}{" "}
                {item.sourceIds.map((id) => (
                  <a key={id} href={`#${answer.generatedAt}-${id}`}>
                    {c.sources} {id}{" "}
                  </a>
                ))}
              </p>
            ))}
            <div className="copilot-claims">
              {answer.claims.map((claim, i) => (
                <article key={`${claim.key}-${i}`}>
                  <h3>{claim.label}</h3>
                  <p>{claim.status === "supported" ? claim.text.slice(claim.label.length + 2) : c.noData}</p>
                  {claim.name && <p>{claim.name}</p>}
                  {claim.forecastDates?.length > 0 && (
                    <p>
                      {claim.forecastDates[0]} — {claim.forecastDates.at(-1)} · {c.forecastNote}
                    </p>
                  )}
                  {claim.excludedBranches > 0 && (
                    <p>
                      {c.excluded}: {claim.excludedBranches}
                    </p>
                  )}
                  <small>{claim.status === "supported" ? c.supported : c.insufficient}</small>
                  <div>
                    {claim.sourceIds.map((id) => (
                      <a key={id} href={`#${answer.generatedAt}-${id}`}>
                        {c.sources} {id}
                      </a>
                    ))}
                  </div>
                  {claim.items?.map((item, j) => (
                    <p key={item.key || j}>
                      {item.title || item.name}
                      {item.action && item.title ? ` — ${item.action}` : ""}
                    </p>
                  ))}
                </article>
              ))}
            </div>
            {answer.notes?.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </>
        )}
        <div>
          {answer.sources.map((source) => (
            <Evidence key={source.id} source={source} answer={answer} copy={c} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Evidence({ source, answer, copy: c }) {
  const [open, setOpen] = useState(false);
  const evidence = useQuery({
    queryKey: ["copilot-evidence", source.evidenceUrl, source.digest],
    queryFn: ({ signal }) => api(source.evidenceUrl, { signal }),
    enabled: open && !source.data && Boolean(source.evidenceUrl),
    retry: false
  });
  return (
    <details id={`${answer.generatedAt}-${source.id}`} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        {c.sources} {source.id}
      </summary>
      <p>
        <bdi>
          {source.period.fromDate} — {source.period.toDate}
        </bdi>
      </p>
      <Link to={source.url}>{c.source}</Link>
      {evidence.isError && <p role="alert">{c.error}</p>}
      {!source.data && evidence.isFetching && <p role="status">{c.loading}</p>}
      {(source.data || evidence.data) && (
        <pre className="decision-evidence">{JSON.stringify(source.data || evidence.data.source.data, null, 2)}</pre>
      )}
    </details>
  );
}
