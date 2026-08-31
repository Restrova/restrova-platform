import { db } from "../db.js";

const insertImportRow = db.prepare(
  "INSERT INTO import_job_rows(job_id,row_number,status,raw_json,normalized_json,errors_json) VALUES (?,?,?,?,?,?)"
);

function insertRows(jobId, rows) {
  for (const row of rows) {
    insertImportRow.run(
      jobId,
      row.rowNumber,
      row.status,
      JSON.stringify(row.raw),
      row.normalized ? JSON.stringify(row.normalized) : null,
      JSON.stringify(row.errors || [])
    );
  }
}

export function createImportJob(data) {
  const result = db
    .prepare(
      `INSERT INTO import_jobs(
        organization_id,restaurant_id,created_by,template_key,template_version,
        original_filename,content_type,file_type,byte_size,file_sha256,confirmation_token_hash,
        total_rows,accepted_rows,rejected_rows,duplicate_rows,source_headers_json,mapping_json,
        validation_status,warning_count,confirmation_token_expires_at,last_request_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      data.organizationId,
      data.restaurantId,
      data.createdBy,
      data.templateKey,
      data.templateVersion,
      data.originalFilename,
      data.contentType,
      data.fileType,
      data.byteSize,
      data.fileSha256,
      data.confirmationTokenHash,
      data.totalRows,
      data.acceptedRows,
      data.rejectedRows,
      data.duplicateRows,
      JSON.stringify(data.sourceHeaders || []),
      JSON.stringify(data.mappings || []),
      data.validationStatus || "ready",
      data.warningCount || 0,
      data.confirmationTokenExpiresAt,
      data.requestId
    );
  return Number(result.lastInsertRowid);
}

export function insertImportJobRows(jobId, rows) {
  db.transaction(() => insertRows(jobId, rows))();
}

export function replaceImportJobValidation(jobId, data, rows) {
  return db.transaction(() => {
    const changes = db
      .prepare(
        `UPDATE import_jobs
         SET mapping_json=?,validation_status=?,warning_count=?,
             total_rows=?,accepted_rows=?,rejected_rows=?,duplicate_rows=?,
             confirmation_token_hash=?,confirmation_token_expires_at=?,confirmation_consumed_at=NULL,
             last_request_id=?,mapping_updated_at=CURRENT_TIMESTAMP
         WHERE id=? AND status='preview_ready'`
      )
      .run(
        JSON.stringify(data.mappings || []),
        data.validationStatus,
        data.warningCount || 0,
        data.totalRows,
        data.acceptedRows,
        data.rejectedRows,
        data.duplicateRows,
        data.confirmationTokenHash,
        data.confirmationTokenExpiresAt,
        data.requestId,
        jobId
      ).changes;

    if (!changes) return 0;
    db.prepare("DELETE FROM import_job_rows WHERE job_id=?").run(jobId);
    insertRows(jobId, rows);
    return changes;
  })();
}

export function findImportJobInScope(user, jobId) {
  return db
    .prepare(
      `SELECT * FROM import_jobs
       WHERE id=? AND organization_id=? AND restaurant_id=?`
    )
    .get(jobId, user.organization_id, user.restaurant_id);
}

export function listImportJobsInScope(user, filters = {}) {
  const clauses = ["job.organization_id=?", "job.restaurant_id=?"];
  const values = [user.organization_id, user.restaurant_id];

  if (filters.status) {
    if (filters.status === "failed") {
      clauses.push(
        "EXISTS (SELECT 1 FROM import_audit_events event WHERE event.import_job_id=job.id AND event.event_type='import_failed')"
      );
    } else if (["needs_mapping", "validation_failed", "ready"].includes(filters.status)) {
      clauses.push("job.status='preview_ready'", "job.validation_status=?");
      values.push(filters.status);
    } else {
      clauses.push("job.status=?");
      values.push(filters.status === "completed" ? "confirmed" : filters.status);
    }
  }
  if (filters.templateKey) {
    clauses.push("job.template_key=?");
    values.push(filters.templateKey);
  }
  if (filters.branchId) {
    clauses.push(
      "EXISTS (SELECT 1 FROM import_job_rows row WHERE row.job_id=job.id AND json_extract(row.normalized_json,'$.branch_id')=?)"
    );
    values.push(filters.branchId);
  }
  if (filters.from) {
    clauses.push("job.created_at>=?");
    values.push(filters.from);
  }
  if (filters.to) {
    clauses.push("job.created_at<=?");
    values.push(filters.to);
  }

  return db
    .prepare(`SELECT job.* FROM import_jobs job WHERE ${clauses.join(" AND ")} ORDER BY job.id DESC LIMIT 100`)
    .all(...values);
}

export function getImportMetricsInScope(user) {
  return db
    .prepare(
      `SELECT
         count(*) imports_started,
         sum(CASE WHEN status='confirmed' THEN 1 ELSE 0 END) imports_completed,
         sum(CASE WHEN EXISTS (
           SELECT 1 FROM import_audit_events event
           WHERE event.import_job_id=import_jobs.id AND event.event_type='import_failed'
         ) THEN 1 ELSE 0 END) imports_failed,
         sum(CASE WHEN validation_status='validation_failed' THEN 1 ELSE 0 END) validation_failures,
         sum(duplicate_rows) duplicate_rows,
         sum(imported_rows) rows_imported,
         avg(CASE WHEN confirmed_at IS NOT NULL
           THEN (julianday(confirmed_at)-julianday(created_at))*86400000 END) average_import_duration_ms
       FROM import_jobs WHERE organization_id=? AND restaurant_id=?`
    )
    .get(user.organization_id, user.restaurant_id);
}

export function listImportJobRows(jobId) {
  return db
    .prepare(
      `SELECT row_number,status,raw_json,normalized_json,errors_json
       FROM import_job_rows WHERE job_id=? ORDER BY row_number`
    )
    .all(jobId);
}

export function cancelImportJob(jobId, requestId) {
  return db
    .prepare(
      `UPDATE import_jobs
       SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP,
           confirmation_consumed_at=CURRENT_TIMESTAMP,confirmation_token_hash='',last_request_id=?
       WHERE id=? AND status='preview_ready'`
    )
    .run(requestId, jobId).changes;
}

export function markImportJobConfirmed(jobId, importedRows, requestId) {
  return db
    .prepare(
      `UPDATE import_jobs
       SET status='confirmed',imported_rows=?,confirmed_at=CURRENT_TIMESTAMP,
           confirmation_consumed_at=CURRENT_TIMESTAMP,confirmation_token_hash='',last_request_id=?
       WHERE id=? AND status='preview_ready' AND validation_status='ready'`
    )
    .run(importedRows, requestId, jobId).changes;
}

export function recordImportAuditEvent(data) {
  return Number(
    db
      .prepare(
        `INSERT INTO import_audit_events(
          import_job_id,organization_id,restaurant_id,branch_id,user_id,template_key,
          event_type,request_id,details_json
        ) VALUES (?,?,?,?,?,?,?,?,?)`
      )
      .run(
        data.importJobId,
        data.organizationId,
        data.restaurantId,
        data.branchId || null,
        data.userId,
        data.templateKey,
        data.eventType,
        data.requestId,
        JSON.stringify(data.details || {})
      ).lastInsertRowid
  );
}

export function listImportAuditEvents(jobId) {
  return db
    .prepare(
      `SELECT id,event_type,request_id,branch_id,details_json,created_at
       FROM import_audit_events WHERE import_job_id=? ORDER BY id`
    )
    .all(jobId);
}

export function transaction(fn) {
  return db.transaction(fn)();
}

export function findBranchByCode(user, code) {
  return db
    .prepare(
      `SELECT * FROM branches
       WHERE organization_id=? AND restaurant_id=? AND lower(code)=lower(?)`
    )
    .get(user.organization_id, user.restaurant_id, code);
}

export function findBranchById(user, branchId) {
  return db
    .prepare(
      `SELECT * FROM branches
       WHERE id=? AND organization_id=? AND restaurant_id=?`
    )
    .get(branchId, user.organization_id, user.restaurant_id);
}

export function findCatalogItemByCode(user, itemCode) {
  return db
    .prepare(
      `SELECT * FROM catalog_items
       WHERE organization_id=? AND restaurant_id=? AND lower(item_code)=lower(?)`
    )
    .get(user.organization_id, user.restaurant_id, itemCode);
}

export function salesLineExists(user, branchId, orderId, lineId) {
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM sales_lines
         WHERE organization_id=? AND restaurant_id=? AND branch_id=?
           AND external_order_id=? AND external_line_id=?`
      )
      .get(user.organization_id, user.restaurant_id, branchId, orderId, lineId)
  );
}

export function costRecordExists(user, catalogItemId, scopeKey, effectiveFrom) {
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM item_costs
         WHERE organization_id=? AND restaurant_id=? AND catalog_item_id=?
           AND scope_key=? AND effective_from=?`
      )
      .get(user.organization_id, user.restaurant_id, catalogItemId, scopeKey, effectiveFrom)
  );
}

export function upsertBranch(user, row) {
  const existing = findBranchByCode(user, row.branch_code);
  if (existing) {
    db.prepare(
      `UPDATE branches
       SET name=?,city=?,address=?,phone=?,pos_system=?,operating_day_start=?,operating_day_end=?
       WHERE id=?`
    ).run(
      row.name,
      row.city,
      row.address || null,
      row.phone || null,
      row.pos_system || null,
      row.operating_day_start,
      row.operating_day_end,
      existing.id
    );
    return existing.id;
  }
  return Number(
    db
      .prepare(
        `INSERT INTO branches(
          organization_id,restaurant_id,name,code,city,address,phone,pos_system,operating_day_start,operating_day_end
        ) VALUES (?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        user.organization_id,
        user.restaurant_id,
        row.name,
        row.branch_code,
        row.city,
        row.address || null,
        row.phone || null,
        row.pos_system || null,
        row.operating_day_start,
        row.operating_day_end
      ).lastInsertRowid
  );
}

export function upsertCatalogItem(user, row) {
  const existing = findCatalogItemByCode(user, row.item_code);
  let id;
  if (existing) {
    id = existing.id;
    db.prepare(
      `UPDATE catalog_items
       SET name=?,category=?,selling_price_minor=?,active=?,updated_at=CURRENT_TIMESTAMP
       WHERE id=?`
    ).run(row.name, row.category || null, row.selling_price_minor, row.active, id);
  } else {
    id = Number(
      db
        .prepare(
          `INSERT INTO catalog_items(
            organization_id,restaurant_id,item_code,name,category,selling_price_minor,active
          ) VALUES (?,?,?,?,?,?,?)`
        )
        .run(
          user.organization_id,
          user.restaurant_id,
          row.item_code,
          row.name,
          row.category || null,
          row.selling_price_minor,
          row.active
        ).lastInsertRowid
    );
  }

  const legacy = db
    .prepare("SELECT id FROM menu_items WHERE restaurant_id=? AND lower(name)=lower(?)")
    .get(user.restaurant_id, row.name);
  const price = row.selling_price_minor / 100;
  if (legacy) db.prepare("UPDATE menu_items SET price=?,active=? WHERE id=?").run(price, row.active, legacy.id);
  else
    db.prepare("INSERT INTO menu_items(restaurant_id,name,price,cost,active) VALUES (?,?,?,?,?)").run(
      user.restaurant_id,
      row.name,
      price,
      0,
      row.active
    );
  return id;
}

export function insertCost(user, row) {
  return db
    .prepare(
      `INSERT OR IGNORE INTO item_costs(
        organization_id,restaurant_id,branch_id,catalog_item_id,scope_key,
        direct_food_cost_minor,packaging_cost_minor,effective_from
      ) VALUES (?,?,?,?,?,?,?,?)`
    )
    .run(
      user.organization_id,
      user.restaurant_id,
      row.branch_id,
      row.catalog_item_id,
      row.scope_key,
      row.direct_food_cost_minor,
      row.packaging_cost_minor,
      row.effective_from
    ).changes;
}

export function insertSalesLine(user, row) {
  return db
    .prepare(
      `INSERT OR IGNORE INTO sales_lines(
        organization_id,restaurant_id,branch_id,catalog_item_id,external_order_id,external_line_id,
        created_at,channel,quantity,gross_sales_minor,discount_minor,refund_amount_minor,delivery_commission_minor
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      user.organization_id,
      user.restaurant_id,
      row.branch_id,
      row.catalog_item_id,
      row.external_order_id,
      row.external_line_id,
      row.created_at,
      row.channel,
      row.quantity,
      row.gross_sales_minor,
      row.discount_minor,
      row.refund_amount_minor,
      row.delivery_commission_minor
    ).changes;
}

function applicableCost(costs, row) {
  return costs.find(
    (cost) =>
      cost.catalog_item_id === row.catalog_item_id &&
      (cost.branch_id === row.branch_id || cost.branch_id == null) &&
      Date.parse(cost.effective_from) <= Date.parse(row.created_at)
  );
}

export function insertFinancialLedgerForSalesRows(user, rows) {
  if (!rows.length) return 0;

  const costs = db
    .prepare(
      `SELECT catalog_item_id,branch_id,direct_food_cost_minor,packaging_cost_minor,effective_from
       FROM item_costs
       WHERE organization_id=? AND restaurant_id=?
       ORDER BY catalog_item_id,
                CASE WHEN branch_id IS NULL THEN 1 ELSE 0 END,
                julianday(effective_from) DESC,id DESC`
    )
    .all(user.organization_id, user.restaurant_id);
  const orders = new Map();

  for (const row of rows) {
    const key = `${row.branch_id}:${row.external_order_id}`;
    const order = orders.get(key) || {
      branchId: row.branch_id,
      orderId: row.external_order_id,
      occurredAt: row.created_at,
      lineCount: 0,
      totals: {
        sales: 0,
        discounts: 0,
        refunds: 0,
        food_costs: 0,
        packaging: 0,
        delivery_commissions: 0
      }
    };
    const cost = applicableCost(costs, row);
    order.occurredAt = order.occurredAt < row.created_at ? order.occurredAt : row.created_at;
    order.lineCount += 1;
    order.totals.sales += row.gross_sales_minor;
    order.totals.discounts += row.discount_minor;
    order.totals.refunds += row.refund_amount_minor;
    order.totals.delivery_commissions += row.delivery_commission_minor;
    order.totals.food_costs += Math.round((cost?.direct_food_cost_minor || 0) * row.quantity);
    order.totals.packaging += Math.round((cost?.packaging_cost_minor || 0) * row.quantity);
    orders.set(key, order);
  }

  const insert = db.prepare(
    `INSERT OR IGNORE INTO financial_ledger_entries(
      organization_id,restaurant_id,branch_id,category,amount_minor,currency_code,
      occurred_at,source_type,source_reference,description,evidence_json,created_by,scope_key
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  let inserted = 0;
  for (const order of orders.values()) {
    for (const [category, amountMinor] of Object.entries(order.totals)) {
      if (!amountMinor) continue;
      inserted += insert.run(
        user.organization_id,
        user.restaurant_id,
        order.branchId,
        category,
        amountMinor,
        user.currency.toUpperCase(),
        order.occurredAt,
        "import",
        order.orderId,
        `Imported sales order ${order.orderId}`,
        JSON.stringify({ source: "sales_lines", externalOrderId: order.orderId, lineCount: order.lineCount }),
        user.owner_id,
        `branch:${order.branchId}`
      ).changes;
    }
  }
  return inserted;
}
