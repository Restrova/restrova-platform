import { z } from "zod";
import { db } from "../db.js";
import { validate } from "../validation/schemas.js";
import { authorizedBranches } from "./alertCenterService.js";
import { forbidden } from "../errors/appError.js";
import { recordDataRevision } from "./dataRevisionService.js";
export function seasonalEvents(user, branchId) {
  if (branchId) authorizedBranches(user, { scope: "branch", branchId });
  return db
    .prepare(
      "SELECT id,branch_id AS branchId,kind,name,from_date AS fromDate,to_date AS toDate,source FROM seasonal_events WHERE organization_id=? AND restaurant_id=? AND (branch_id IS NULL OR branch_id=?) ORDER BY from_date,id LIMIT 1000"
    )
    .all(user.organization_id, user.restaurant_id, branchId || null);
}
export function createSeasonalEvent(user, body) {
  if (user.role !== "owner") throw forbidden();
  const data = validate(
    z
      .object({
        branchId: z.number().int().positive().nullable().default(null),
        kind: z.enum(["ramadan", "eid", "weekend", "holiday", "local_event", "restaurant"]),
        name: z.string().trim().min(1).max(120),
        fromDate: z.iso.date(),
        toDate: z.iso.date(),
        source: z.string().trim().min(1).max(300)
      })
      .strict()
      .refine((v) => v.fromDate <= v.toDate),
    body
  );
  if (data.branchId)
    authorizedBranches(user, { scope: "branch", branchId: data.branchId, restaurantId: user.restaurant_id });
  const result = db
    .prepare(
      "INSERT INTO seasonal_events(organization_id,restaurant_id,branch_id,kind,name,from_date,to_date,source,created_by) VALUES (?,?,?,?,?,?,?,?,?)"
    )
    .run(
      user.organization_id,
      user.restaurant_id,
      data.branchId,
      data.kind,
      data.name,
      data.fromDate,
      data.toDate,
      data.source,
      user.owner_id
    );
  recordDataRevision(user);
  return { id: Number(result.lastInsertRowid), ...data };
}
export function matchingEvents(events, date) {
  return events.filter((event) => event.fromDate <= date && date <= event.toDate);
}
export function seasonalBaseline(days, date, events) {
  const kinds = [...new Set(matchingEvents(events, date).map((event) => event.kind))].sort();
  const candidates = days.filter(
    (day) =>
      JSON.stringify([...new Set(matchingEvents(events, day.date).map((event) => event.kind))].sort()) ===
      JSON.stringify(kinds)
  );
  return {
    days: candidates,
    events: matchingEvents(events, date),
    policy: "same_weekday_and_exact_set_of_operator_recorded_season_kinds"
  };
}
