# Import-connected forecasts and recommendations (#58–#67)

This release connects the ten issues to confirmed source data and replaces the Recommendations placeholder with an Arabic, English and Chinese decision workflow. It does not change catalog prices, execute promotions or contact suppliers automatically.

| Issue | Delivered behavior                                                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #58   | Branch daily net/gross sales prediction bands from rolling-origin errors; explicit insufficient-history and seasonal uncertainty states.                               |
| #59   | Server-timestamped forecast snapshots, completed-date actual matching, MAE/MAPE by 1/7/30-day horizon and documented error-drift signals.                              |
| #60   | Owner-entered Ramadan, Eid, weekend, holiday, local-event and restaurant-season dates with required provenance; seasonal weekday matching.                             |
| #61   | Standard problem, evidence, observed business impact, recommended action, expected outcome, confidence and source lineage envelope.                                    |
| #62   | Same-scope effective cost increases, verified same-supplier attribution, refund/discount review opportunities and explicit supplier/recipe cost-reduction simulations. |
| #63   | Recorded price/cost evidence, explicit proposed-price and demand assumptions, contribution impact and margin floor.                                                    |
| #64   | Existing source-backed menu matrix feeds promote, reprice, reformulate/portion and removal-review proposals.                                                           |
| #65   | Comparable branch decline, refund, discount, cost and peer-performance interventions, with authorized scope and ledger evidence.                                       |
| #66   | Item-targeted offers from supported menu candidates; discount, positive contribution and user-specified margin-floor checks.                                           |
| #67   | Persisted proposal → owner accepted/rejected → action recorded → 7/14-day imported-sales observation, with version conflicts and an audit history.                     |

## Import contract

Staging, preview, rejected confirmations and cancellation do not increment the data revision. A successful transactional confirmation with imported rows increments the restaurant revision inside the write transaction. The legacy confirmed import endpoint also returns a revision. Supplier names are optional in costs template version 2; never infer a supplier from a price. Branch-effective costs override restaurant costs, and historical comparisons stay within the same scope.

The client publishes a small revision event after a successful confirmation, invalidates all analysis queries, refreshes authenticated branch metadata without unmounting the import completion page, and refreshes the legacy workspace. Other open tabs receive the revision, with organization filtering and origin-tab deduplication. Records and access tokens are never broadcast. The completion page links directly to recommendations, forecasts, alerts and workspace.

After the import transaction has committed, the API evaluates alerts for the restaurant. An evaluation failure returns `alertEvaluation.status=failed` and a retry route, while preserving the successful import response. This evaluates incidents only; it does not dispatch external notifications.

Confirmed item sales feed menu, pricing, promotions, historical forecasts and outcome tracking. Confirmed costs feed menu costs and supplier comparisons. The financial ledger supplies branch scorecard evidence. Existing dashboard and grounded assistant continue reading confirmed data from the same scoped store. Older aggregate-only files cannot establish item cost or daily transaction evidence: new analysis withholds unsupported outputs. Record a branch opening date in Branches before using lifecycle-dependent forecasts; a sales row alone does not establish its opening date.

## Forecast methods and limitations

Point forecasts retain the existing minimum four observed matching weekdays and exclude the current incomplete local day. Recorded event kinds must match exactly between historical and forecast dates; ordinary dates exclude tagged seasons. Weekday matching already distinguishes weekly patterns, while weekend date ranges can be recorded explicitly. Calendar dates are supplied by the owner with a source, rather than guessed religious or local dates.

Confidence uses chronological rolling-origin predictions. Each calibration observation is predicted from at least four earlier matching weekdays. At least ten absolute errors are required. The interval radius is the order statistic at `ceil((n+1)*0.8)`, capped to the available sample. Gross-sales lower bounds are clamped to zero; net revenue can be negative after refunds. Bands are nominal empirical 80% bands, not a guaranteed calibration claim under dependence or drift. Season-tagged future dates withhold their intervals because season-specific calibration is unavailable. Group, cost and profit intervals remain explicitly unavailable; summing marginal bands would misrepresent dependence.

Saving a forecast rejects caller-supplied anchors and uses server time. Snapshots preserve point estimates, historical sales lineage, timezone, horizon and restaurant revision. Accuracy selects the latest pre-outcome snapshot per branch/horizon/date from the latest 100 authorized snapshots. Only completed local dates with recorded actual sales are scored, at a 50,000-line daily limit. Missing records do not become zero actuals. MAE is in integer minor units. MAPE is in basis points and excludes zero actuals, with an explicit zero count; negative net actuals use the absolute denominator. With at least ten points, recent-half MAE exceeding older-half MAE by more than 50% signals increased error. An older zero MAE followed by positive error also flags drift. This is a descriptive signal, not causal attribution or an external forecasting model.

## Decision governance

Decision queries require one authorized branch and 1–31 completed local dates. Restaurant-authorized roles can use eligible restaurant peers; branch managers see only their branch. Menu candidates use the existing matrix, with at most 500 items and pagination/coverage metadata. Cost histories are capped at 5,000 records and refuse overflow. Costs are compared within the same item and effective scope; a supplier increase is attributed only when both records explicitly name the same supplier. Refund/discount signals are review opportunities, not proof of waste or recoverable savings.

Price and promotion simulations require a proposed price, demand changes and contribution margin floor. Cost simulations require proposed food/packaging costs. Their outputs are conditional contribution changes, excluding operating expenses and causal demand elasticity; they do not promise revenue, profit or savings. Missing commission/cost evidence withholds a simulation. Promotion eligibility additionally requires a discounted price and positive contribution. Cost-reduction eligibility requires positive modeled contribution improvement and the requested margin floor.

An owner saves a freshly recomputed proposal, including its evidence and data revision. Content-addressed proposal keys prevent duplicate saves of the same evidence. Owner acceptance precedes execution recording. Branch managers may record implementation or measure their assigned branch's approved action; viewers are read-only. Every transition validates the version and allowed predecessor and appends an audit note. Recording an action is an owner's/manager's report; it does not itself change the restaurant's menu or operations.

Measurement starts the day after the server-recorded action date, uses 7 or 14 completed days, and compares the same number of days before the action date. Every date requires branch sales evidence; an item-specific measurement also requires item evidence in each window. The action day is excluded. Result money uses integer arithmetic and stores source line IDs plus the measured data revision. It reports observed revenue change, not profit, recoverable savings or a causal effect of the recommendation. Late or incomplete imports can affect the observed result. The latest 100 tracked actions are returned per branch.

## Migration and configuration

Migration `0009_import_decisions.sql` adds revisions, seasonal events, forecast snapshots, recommendation actions/history and nullable supplier attribution. It upgrades the costs template to version 2 and requires no deployment secret or new dependency. Existing migration startup applies it transactionally. Normal authenticated API logging and persisted histories provide request/action traceability. Derived alert evaluation status is returned to the importer for recovery.

Main APIs: `GET /data/revision`, `GET /decisions`, `POST /decisions/scenario`, `GET|POST /decisions/actions`, `PATCH /decisions/actions/:id`, `POST /forecasts/snapshots`, `GET /forecasts/accuracy`, `GET|POST /seasons`. All require authentication and preserve tenant, restaurant and branch authorization. API responses use no-store for decision evidence.

## Verification

`importDecisions.test.js` exercises real CSV preview/confirmation through decisions, supplier attribution, price/promotion/cost scenarios, forecast snapshots, season effects, accuracy including zero actuals/drift, lifecycle transitions, measurement and role/tenant isolation. Existing menu matrix and branch operation suites remain the source-formula regression gates. Frontend tests cover Arabic/English/Chinese, source display, approval visibility, query refresh, branch metadata refresh, cross-tab deduplication and successful-versus-failed import event publication. Run `pnpm validate` before merging; CI must pass on the published commit.
