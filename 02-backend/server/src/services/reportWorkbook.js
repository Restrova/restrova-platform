import { validationError } from "../errors/appError.js";
import { reportExportRows } from "./tabularReportService.js";

const xml = (value) =>
  String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
function column(index) {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}
function sheet(rows, rtl = false) {
  const cells = rows
    .map(
      (row, i) =>
        `<row r="${i + 1}"${i === 0 ? ' ht="30" customHeight="1"' : ""}>${row
          .map((value, j) => {
            const ref = `${column(j)}${i + 1}`;
            if (value === null || value === undefined) return `<c r="${ref}"/>`;
            if (typeof value === "number" && Number.isFinite(value))
              return `<c r="${ref}" s="${i === 0 ? 1 : 2}"><v>${value}</v></c>`;
            if (String(value).length > 32767) throw validationError("An export cell exceeds Excel's text limit.");
            return `<c r="${ref}" s="${i === 0 ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
          })
          .join("")}</row>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" rightToLeft="${rtl ? 1 : 0}"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="${rows[0].length}" width="25" customWidth="1"/></cols><sheetData>${cells}</sheetData><autoFilter ref="A1:${column(rows[0].length - 1)}${rows.length}"/></worksheet>`;
}
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(entries) {
  const locals = [],
    centrals = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const filename = Buffer.from(name),
      data = Buffer.from(text),
      crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(33, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, filename, data);
    centrals.push(central, filename);
    offset += local.length + filename.length + data.length;
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
export function reportWorkbook(report) {
  const digits = new Intl.NumberFormat("en", { style: "currency", currency: report.currencyCode }).resolvedOptions()
    .maximumFractionDigits;
  const display = [
    report.columns.map((c) => c.label),
    ...report.rows.map((row) =>
      report.columns.map((c) => {
        const value = row[c.key];
        return value == null
          ? null
          : c.type === "money_minor"
            ? value / 10 ** digits
            : c.type === "bps"
              ? value / 100
              : value;
      })
    )
  ];
  const info = [
    ["Restrova", "Report metadata"],
    ["Kind", report.kind],
    ["Currency", report.currencyCode],
    ["From", report.period.fromDate],
    ["To", report.period.toDate],
    ["Timezone", report.timezone],
    ["Scope", report.scope.kind],
    ["Restaurant ID", report.scope.restaurantId],
    ["Branch ID", report.scope.branchId],
    ["Import revision", report.dataRevision.revision],
    ["SHA-256", report.digest],
    ["Tax treatment", report.taxTreatment],
    ["Generated at", report.generatedAt],
    [
      "Coverage",
      "Blank metrics mean insufficient data. Raw data uses integer minor units. Tax is not modeled; this is not a tax return."
    ],
    ["Comparison", JSON.stringify(report.period.comparison)]
  ];
  const tables = [display, reportExportRows(report), info];
  const names = ["Report", "Raw data", "Metadata"];
  const prefix = "http://schemas.openxmlformats.org";
  return zip([
    [
      "[Content_Types].xml",
      `<Types xmlns="${prefix}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${tables.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`
    ],
    [
      "_rels/.rels",
      `<Relationships xmlns="${prefix}/package/2006/relationships"><Relationship Id="rId1" Type="${prefix}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
    ],
    [
      "xl/workbook.xml",
      `<workbook xmlns="${prefix}/spreadsheetml/2006/main" xmlns:r="${prefix}/officeDocument/2006/relationships"><sheets>${names.map((name, i) => `<sheet name="${name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<Relationships xmlns="${prefix}/package/2006/relationships">${tables.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${prefix}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId4" Type="${prefix}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
    ],
    [
      "xl/styles.xml",
      `<styleSheet xmlns="${prefix}/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.######"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF143D3A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
    ],
    ...tables.map((rows, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheet(rows, i === 0 && report.language === "ar")])
  ]);
}
