import assert from "node:assert/strict";
import { request, account, db } from "./operationsFixtures.js";
import { dayOffset, localDate } from "../src/services/historicalSeriesService.js";

// A real, dependency-free XLSX ZIP with correct CRCs and a standard package manifest.
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function xlsx(matrix) {
  const escape = (v) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const sheet = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${matrix.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => `<c r="${String.fromCharCode(65 + c)}${r + 1}" t="inlineStr"><is><t>${escape(v)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
  const entries = [
    [
      "[Content_Types].xml",
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'
    ],
    [
      "_rels/.rels",
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    ],
    [
      "xl/workbook.xml",
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>'
    ],
    [
      "xl/_rels/workbook.xml.rels",
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
    ],
    ["xl/worksheets/sheet1.xml", sheet]
  ];
  const locals = [],
    centrals = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const bytes = Buffer.from(text),
      filename = Buffer.from(name),
      crc = crc32(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(bytes.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(bytes.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(Buffer.concat([local, filename, bytes]));
    centrals.push(Buffer.concat([central, filename]));
    offset += local.length + filename.length + bytes.length;
  }
  const directory = Buffer.concat(centrals),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

export function importFile(headers, rows, format) {
  const matrix = [headers, ...rows.map((row) => headers.map((key) => row[key] ?? ""))];
  const cell = (v) => `"${String(v).replaceAll('"', '""')}"`;
  return format === "xlsx"
    ? xlsx(matrix)
    : Buffer.from("\uFEFF" + matrix.map((r) => r.map(cell).join(",")).join("\r\n"));
}
export async function preview(server, owner, key, rows, format = "csv", explicit = false) {
  const meta = await request(server, `/data/templates/${key}`, { token: owner.token });
  assert.equal(meta.status, 200);
  const headers = meta.payload.columns.map((c) => c.name);
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/data/import-jobs/preview?filename=${key}.${format}${explicit ? `&templateKey=${key}` : ""}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${owner.token}`,
        "Content-Type":
          format === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "text/csv; charset=utf-8"
      },
      body: importFile(headers, rows, format)
    }
  );
  return { status: response.status, payload: await response.json() };
}
export async function confirm(server, owner, job) {
  return request(server, `/data/import-jobs/${job.id}/confirm`, {
    token: owner.token,
    method: "POST",
    body: { confirmationToken: job.confirmationToken || "blocked-preview" }
  });
}
export function operationalSnapshot(owner) {
  return Object.fromEntries(
    ["branches", "catalog_items", "item_costs", "sales_lines", "financial_ledger_entries"].map((table) => [
      table,
      db.prepare(`SELECT * FROM ${table} WHERE restaurant_id=? ORDER BY id`).all(owner.restaurant.id)
    ])
  );
}
export async function pipelineFixture(server) {
  const owner = await account(server);
  const date = dayOffset(localDate(new Date().toISOString(), "Asia/Riyadh"), -1);
  const rows = {
    branches: [
      {
        branch_code: "REG",
        name: 'فرع "الدار", 深圳',
        city: "Riyadh / 深圳",
        operating_day_start: "10:00",
        operating_day_end: "02:00"
      }
    ],
    menu: [{ item_code: "GOLD", name: 'مندي "دجاج", 米饭', category: "Main", selling_price: "100.05", active: "true" }],
    costs: [
      {
        item_code: "GOLD",
        branch_code: "REG",
        direct_food_cost: "12.35",
        packaging_cost: "1.15",
        effective_from: "2025-01-01T00:00:00+03:00"
      }
    ],
    sales: [
      {
        external_order_id: "GOLD-ORDER",
        external_line_id: "1",
        branch_code: "REG",
        created_at: `${date}T12:00:00+03:00`,
        channel: "delivery",
        item_code: "GOLD",
        quantity: "2",
        gross_sales: "100.05",
        discount: "10.05",
        refund_amount: "5.05",
        delivery_commission: "6.00"
      },
      {
        external_order_id: "GOLD-ORDER",
        external_line_id: "2",
        branch_code: "REG",
        created_at: `${date}T12:00:00+03:00`,
        channel: "delivery",
        item_code: "GOLD",
        quantity: "1",
        gross_sales: "101.05",
        discount: "0",
        refund_amount: "0",
        delivery_commission: "0"
      }
    ]
  };
  return { owner, rows, date };
}
export async function importPipeline(server, fixture, format = "csv") {
  for (const key of ["branches", "menu", "costs", "sales"]) {
    const p = await preview(server, fixture.owner, key, fixture.rows[key], format);
    assert.equal(p.status, 201, JSON.stringify(p.payload));
    assert.equal(p.payload.validationStatus, "ready", JSON.stringify(p.payload));
    assert.equal((await confirm(server, fixture.owner, p.payload)).status, 200);
  }
  fixture.branchId = db
    .prepare("SELECT id FROM branches WHERE restaurant_id=? AND code='REG'")
    .get(fixture.owner.restaurant.id).id;
  return fixture;
}
