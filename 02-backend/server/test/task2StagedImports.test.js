import test from "node:test";
import assert from "node:assert/strict";
process.env.NODE_ENV = "test";
const { db } = await import("../src/db.js");
const { app } = await import("../src/index.js");

async function jsonRequest(server, path, { token, method = "GET", body } = {}) {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, payload: await response.json().catch(() => ({})) };
}

async function fileRequest(server, path, { token, contentType, body }) {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method: "POST",
    headers: { "Content-Type": contentType, Authorization: `Bearer ${token}` },
    body
  });
  return { status: response.status, payload: await response.json().catch(() => ({})) };
}

function registerOwner(server, stamp) {
  return jsonRequest(server, "/api/auth/register", {
    method: "POST",
    body: {
      name: "Import Owner",
      email: `import-${stamp}@example.test`,
      password: "demo12345",
      organizationName: `Import Org ${stamp}`,
      restaurantName: `Import Restaurant ${stamp}`,
      branchName: "Guangzhou Main",
      branchCode: "GZ-01",
      city: "Guangzhou"
    }
  });
}

async function previewCsv(server, token, templateKey, filename, csv) {
  return fileRequest(
    server,
    `/api/data/import-jobs/preview?templateKey=${encodeURIComponent(templateKey)}&filename=${encodeURIComponent(filename)}`,
    { token, contentType: "text/csv; charset=utf-8", body: Buffer.from(csv, "utf8") }
  );
}

async function previewAutoCsv(server, token, filename, csv) {
  return fileRequest(server, `/api/data/import-jobs/preview?filename=${encodeURIComponent(filename)}`, {
    token,
    contentType: "text/csv; charset=utf-8",
    body: Buffer.from(csv, "utf8")
  });
}

async function confirmJob(server, token, preview) {
  return jsonRequest(server, `/api/data/import-jobs/${preview.id}/confirm`, {
    token,
    method: "POST",
    body: { confirmationToken: preview.confirmationToken }
  });
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function columnName(index) {
  let value = index + 1;
  let result = "";
  while (value) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function worksheetXml(matrix) {
  const rows = matrix
    .map((row, rowIndex) => {
      const cells = row
        .map(
          (value, columnIndex) =>
            `<c r="${columnName(columnIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`
        )
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
}

function storedZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const nameBuffer = Buffer.from(name, "utf8");
    const data = Buffer.from(content, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    const localRecord = Buffer.concat([local, nameBuffer, data]);
    locals.push(localRecord);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, nameBuffer]));
    offset += localRecord.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDirectory, eocd]);
}

test("Task 2.2 stages branches without live writes and confirms the exact preview", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const registration = await registerOwner(server, stamp);
  const token = registration.payload.token;
  const restaurantId = registration.payload.restaurant.id;
  const code = `SZ-${String(Date.now()).slice(-5)}`;
  const csv = `branch_code,name,city,address,phone,pos_system,operating_day_start,operating_day_end\n${code},深圳分店,Shenzhen,Nanshan,,POS,09:00,01:30`;

  const preview = await previewCsv(server, token, "branches", "branches.csv", csv);
  assert.equal(preview.status, 201);
  assert.equal(preview.payload.status, "preview_ready");
  assert.equal(preview.payload.statistics.accepted, 1);
  assert.equal(preview.payload.previewRows.length, 1);
  assert.equal(
    db.prepare("SELECT count(*) count FROM branches WHERE restaurant_id=? AND code=?").get(restaurantId, code).count,
    0
  );

  const wrongToken = await jsonRequest(server, `/api/data/import-jobs/${preview.payload.id}/confirm`, {
    token,
    method: "POST",
    body: { confirmationToken: "wrong-token" }
  });
  assert.equal(wrongToken.status, 403);

  const confirmed = await confirmJob(server, token, preview.payload);
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.payload.status, "confirmed");
  assert.equal(confirmed.payload.statistics.imported, 1);
  assert.equal(
    db.prepare("SELECT name FROM branches WHERE restaurant_id=? AND code=?").get(restaurantId, code).name,
    "深圳分店"
  );
});

test("Task 2.2 validates menu, costs, +08:00 dates, sales references, and duplicate sales", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const registration = await registerOwner(server, stamp);
  const token = registration.payload.token;
  const restaurantId = registration.payload.restaurant.id;
  const itemCode = `MANDI-${String(Date.now()).slice(-6)}`;

  const menuPreview = await previewCsv(
    server,
    token,
    "menu",
    "menu.csv",
    `item_code,name,category,selling_price,active\n${itemCode},مندي دجاج,المندي,48.50,true`
  );
  assert.equal(menuPreview.payload.statistics.accepted, 1);
  await confirmJob(server, token, menuPreview.payload);
  assert.equal(
    db.prepare("SELECT name FROM catalog_items WHERE restaurant_id=? AND item_code=?").get(restaurantId, itemCode).name,
    "مندي دجاج"
  );

  const invalidCost = await previewCsv(
    server,
    token,
    "costs",
    "bad-costs.csv",
    `item_code,branch_code,direct_food_cost,packaging_cost,effective_from\n${itemCode},GZ-01,24.00,1.50,not-a-date`
  );
  assert.equal(invalidCost.status, 201);
  assert.equal(invalidCost.payload.statistics.rejected, 1);
  assert.equal(invalidCost.payload.rowErrors[0].errors[0].code, "invalid_datetime");

  const costPreview = await previewCsv(
    server,
    token,
    "costs",
    "costs.csv",
    `item_code,branch_code,direct_food_cost,packaging_cost,effective_from\n${itemCode},GZ-01,24.00,1.50,2026-08-01T00:00:00+08:00`
  );
  assert.equal(costPreview.payload.statistics.accepted, 1);
  await confirmJob(server, token, costPreview.payload);
  const cost = db
    .prepare(
      `SELECT direct_food_cost_minor,packaging_cost_minor,effective_from
       FROM item_costs WHERE restaurant_id=? ORDER BY id DESC LIMIT 1`
    )
    .get(restaurantId);
  assert.equal(cost.direct_food_cost_minor, 2400);
  assert.equal(cost.packaging_cost_minor, 150);
  assert.equal(cost.effective_from, "2026-07-31T16:00:00.000Z");

  const missingBranch = await previewCsv(
    server,
    token,
    "sales",
    "missing-branch.csv",
    `external_order_id,external_line_id,branch_code,created_at,channel,item_code,quantity,gross_sales,discount,refund_amount,delivery_commission\nORD-1,1,NO-SUCH,2026-08-10T19:30:00+08:00,dine_in,${itemCode},1,48.50,0,0,0`
  );
  assert.equal(missingBranch.payload.statistics.rejected, 1);
  assert.equal(
    missingBranch.payload.rowErrors[0].errors.some((error) => error.code === "missing_branch"),
    true
  );

  const unknownItem = await previewCsv(
    server,
    token,
    "sales",
    "unknown-item.csv",
    `external_order_id,external_line_id,branch_code,created_at,channel,item_code,quantity,gross_sales,discount,refund_amount,delivery_commission\nORD-2,1,GZ-01,2026-08-10T19:30:00+08:00,dine_in,UNKNOWN,1,48.50,0,0,0`
  );
  assert.equal(unknownItem.payload.statistics.rejected, 1);
  assert.equal(
    unknownItem.payload.rowErrors[0].errors.some((error) => error.code === "unknown_item"),
    true
  );

  const salesCsv = `external_order_id,external_line_id,branch_code,created_at,channel,item_code,quantity,gross_sales,discount,refund_amount,delivery_commission\nORD-${stamp},1,GZ-01,2026-08-10T19:30:00+08:00,dine_in,${itemCode},2,97.00,0,0,0`;
  const salesPreview = await previewCsv(server, token, "sales", "sales.csv", salesCsv);
  assert.equal(salesPreview.payload.statistics.accepted, 1);
  const salesConfirmed = await confirmJob(server, token, salesPreview.payload);
  assert.equal(salesConfirmed.payload.statistics.imported, 1);

  const duplicatePreview = await previewCsv(server, token, "sales", "sales-again.csv", salesCsv);
  assert.equal(duplicatePreview.payload.statistics.accepted, 0);
  assert.equal(duplicatePreview.payload.statistics.duplicates, 1);
  const duplicateConfirmed = await confirmJob(server, token, duplicatePreview.payload);
  assert.equal(duplicateConfirmed.payload.statistics.imported, 0);
  assert.equal(
    db
      .prepare("SELECT count(*) count FROM sales_lines WHERE restaurant_id=? AND external_order_id=?")
      .get(restaurantId, `ORD-${stamp}`).count,
    1
  );
});

test("Task 2.2 rejects empty files, supports basic XLSX, and can cancel before confirmation", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const registration = await registerOwner(server, stamp);
  const token = registration.payload.token;
  const restaurantId = registration.payload.restaurant.id;

  const empty = await fileRequest(server, "/api/data/import-jobs/preview?templateKey=branches&filename=empty.csv", {
    token,
    contentType: "text/csv",
    body: Buffer.alloc(0)
  });
  assert.equal(empty.status, 400);

  const code = `XLSX-${String(Date.now()).slice(-5)}`;
  const xlsx = storedZip([
    [
      "xl/worksheets/sheet1.xml",
      worksheetXml([
        ["branch_code", "name", "city"],
        [code, "فرع إكسل", "Guangzhou"]
      ])
    ]
  ]);
  const xlsxPreview = await fileRequest(
    server,
    "/api/data/import-jobs/preview?templateKey=branches&filename=branches.xlsx",
    {
      token,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: xlsx
    }
  );
  assert.equal(xlsxPreview.status, 201);
  assert.equal(xlsxPreview.payload.file.type, "xlsx");
  assert.equal(xlsxPreview.payload.statistics.accepted, 1);

  const cancelled = await jsonRequest(server, `/api/data/import-jobs/${xlsxPreview.payload.id}/cancel`, {
    token,
    method: "POST"
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.payload.status, "cancelled");
  assert.equal(
    db.prepare("SELECT count(*) count FROM branches WHERE restaurant_id=? AND code=?").get(restaurantId, code).count,
    0
  );

  const confirmCancelled = await confirmJob(server, token, xlsxPreview.payload);
  assert.equal(confirmCancelled.status, 409);
});

test("Smart import identifies branches, menu, costs, and sales from file columns", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const registration = await registerOwner(server, stamp);
  const token = registration.payload.token;

  const samples = [
    {
      templateKey: "branches",
      csv: `branch_code,name,city,address,phone,pos_system,operating_day_start,operating_day_end\nAUTO-01,Auto Branch,Guangzhou,,,,09:00,01:00`
    },
    {
      templateKey: "menu",
      csv: `item_code,name,category,selling_price,active\nAUTO-ITEM,Auto Item,Main,25.00,true`
    },
    {
      templateKey: "costs",
      csv: `item_code,branch_code,direct_food_cost,packaging_cost,effective_from\nAUTO-ITEM,GZ-01,10.00,1.00,2026-08-01`
    },
    {
      templateKey: "sales",
      csv: `external_order_id,external_line_id,branch_code,created_at,channel,item_code,quantity,gross_sales,discount,refund_amount,delivery_commission\nAUTO-ORDER,1,GZ-01,2026-08-10T12:00:00Z,dine_in,AUTO-ITEM,1,25.00,0,0,0`
    }
  ];

  for (const sample of samples) {
    const preview = await previewAutoCsv(server, token, `${sample.templateKey}.csv`, sample.csv);
    assert.equal(preview.status, 201);
    assert.equal(preview.payload.templateKey, sample.templateKey);
    assert.equal(preview.payload.detection.mode, "automatic");
    assert.equal(preview.payload.detection.templateKey, sample.templateKey);
    assert.equal(preview.payload.detection.confidence, "high");
    assert.ok(preview.payload.detection.matchedFields.length >= 2);
  }
});

test("Smart import asks for a manual type when columns are ambiguous", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const registration = await registerOwner(server, stamp);
  const token = registration.payload.token;
  const csv = "name,notes\nAmbiguous row,No identifying columns";

  const automatic = await previewAutoCsv(server, token, "ambiguous.csv", csv);
  assert.equal(automatic.status, 400);
  assert.match(automatic.payload.error, /could not be identified confidently/i);

  const manual = await previewCsv(server, token, "menu", "ambiguous.csv", csv);
  assert.equal(manual.status, 201);
  assert.equal(manual.payload.templateKey, "menu");
  assert.equal(manual.payload.validationStatus, "needs_mapping");
});

test("Smart import classifies and evaluates analytical restaurant sales datasets", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const registration = await registerOwner(server, stamp);
  const token = registration.payload.token;
  const csv = [
    "date,restaurant_id,restaurant_type,menu_item_name,meal_type,key_ingredients_tags,typical_ingredient_cost,observed_market_price,actual_selling_price,quantity_sold,has_promotion,special_event,weather_condition",
    "1/1/2024,11,Yemeni Street Food,Yemeni Saltah,Lunch,fenugreek,5.86,20.06,20.86,410,FALSE,FALSE,Hot and Sunny",
    "1/1/2024,7,Traditional Yemeni Restaurant,Lamb Mandi,Dinner,lamb,21.21,80.21,86.28,77,FALSE,FALSE,Hot and Sunny"
  ].join("\n");

  const preview = await previewAutoCsv(server, token, "yemeni_restaurant_sales_data.csv", csv);
  assert.equal(preview.status, 201);
  assert.equal(preview.payload.templateKey, "sales");
  assert.equal(preview.payload.detection.confidence, "medium");
  assert.ok(preview.payload.detection.signatureFields.includes("quantity sold"));
  assert.equal(preview.payload.datasetEvaluation.rowCount, 2);
  assert.equal(preview.payload.datasetEvaluation.columnCount, 13);
  assert.equal(preview.payload.datasetEvaluation.completenessBps, 10000);
  assert.equal(preview.payload.datasetEvaluation.mode, "analysis_only");
  assert.equal(preview.payload.datasetEvaluation.importReady, false);
  assert.ok(
    preview.payload.datasetEvaluation.numericColumns.some((metric) => metric.column === "actual_selling_price")
  );
});
