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
        validation_status,warning_count
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
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
      data.warningCount || 0
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
             confirmation_token_hash=?,mapping_updated_at=CURRENT_TIMESTAMP
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

export function listImportJobRows(jobId) {
  return db
    .prepare(
      `SELECT row_number,status,raw_json,normalized_json,errors_json
       FROM import_job_rows WHERE job_id=? ORDER BY row_number`
    )
    .all(jobId);
}

export function cancelImportJob(jobId) {
  return db
    .prepare(
      `UPDATE import_jobs SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP
       WHERE id=? AND status='preview_ready'`
    )
    .run(jobId).changes;
}

export function markImportJobConfirmed(jobId, importedRows) {
  return db
    .prepare(
      `UPDATE import_jobs
       SET status='confirmed',imported_rows=?,confirmed_at=CURRENT_TIMESTAMP
       WHERE id=? AND status='preview_ready' AND validation_status='ready'`
    )
    .run(importedRows, jobId).changes;
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
