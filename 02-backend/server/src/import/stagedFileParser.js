import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { validationError } from "../errors/appError.js";

const MAX_ROWS = 10_000;

function cleanHeader(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase();
}

function rowsToObjects(matrix) {
  if (!matrix.length) throw validationError("The uploaded file is empty.");
  const headers = matrix[0].map(cleanHeader);
  if (!headers.some(Boolean)) throw validationError("The uploaded file has no header row.");
  if (headers.some((header) => !header)) throw validationError("Column names cannot be empty.");
  if (new Set(headers).size !== headers.length) throw validationError("Column names must be unique.");

  const rows = matrix
    .slice(1)
    .filter((cells) => cells.some((value) => String(value ?? "").trim() !== ""))
    .map((cells, index) => {
      if (cells.length > headers.length) throw validationError(`Row ${index + 2} has more values than the header row.`);
      return Object.fromEntries(headers.map((header, column) => [header, String(cells[column] ?? "").trim()]));
    });

  if (!rows.length) throw validationError("The uploaded file must contain at least one data row.");
  if (rows.length > MAX_ROWS) throw validationError(`A single import cannot exceed ${MAX_ROWS.toLocaleString()} rows.`);
  return { headers, rows };
}

export function parseCsvBuffer(buffer) {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const matrix = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      row.push(value);
      value = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      matrix.push(row);
      row = [];
      value = "";
      continue;
    }
    value += char;
  }

  if (quoted) throw validationError("The CSV contains an unclosed quoted field.");
  if (value || row.length) {
    row.push(value);
    matrix.push(row);
  }
  return rowsToObjects(matrix);
}

function findEndOfCentralDirectory(buffer) {
  const signature = 0x06054b50;
  const min = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= min; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) return offset;
  }
  throw validationError("The XLSX file is not a valid ZIP container.");
}

function readZipEntries(buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  if (entryCount > 2_000) throw validationError("The XLSX contains too many ZIP entries.");
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  let offset = directoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw validationError("The XLSX ZIP directory is invalid.");
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    entries.set(name, { method, compressedSize, uncompressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  const readEntry = (name) => {
    const entry = entries.get(name);
    if (!entry) return null;
    if (entry.uncompressedSize > 20_000_000) throw validationError("The XLSX worksheet is too large.");
    const local = entry.localHeaderOffset;
    if (buffer.readUInt32LE(local) !== 0x04034b50) throw validationError("The XLSX ZIP entry is invalid.");
    const nameLength = buffer.readUInt16LE(local + 26);
    const extraLength = buffer.readUInt16LE(local + 28);
    const start = local + 30 + nameLength + extraLength;
    const compressed = buffer.subarray(start, start + entry.compressedSize);
    let output;
    if (entry.method === 0) output = compressed;
    else if (entry.method === 8) output = inflateRawSync(compressed, { maxOutputLength: 20_000_000 });
    else throw validationError("The XLSX uses an unsupported ZIP compression method.");
    if (entry.uncompressedSize && output.length !== entry.uncompressedSize)
      throw validationError("The XLSX ZIP entry has an invalid size.");
    return output;
  };

  return { names: [...entries.keys()], readEntry };
}

function decodeXml(value) {
  return String(value ?? "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function xmlText(fragment) {
  const values = [];
  const regex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let match;
  while ((match = regex.exec(fragment))) values.push(decodeXml(match[1]));
  return values.join("");
}

function sharedStringsFromXml(xml) {
  if (!xml) return [];
  const strings = [];
  const regex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match;
  while ((match = regex.exec(xml))) strings.push(xmlText(match[1]));
  return strings;
}

function columnIndexFromReference(reference) {
  const letters = String(reference || "")
    .match(/^[A-Z]+/i)?.[0]
    ?.toUpperCase();
  if (!letters) return null;
  let result = 0;
  for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
  return result - 1;
}

function worksheetMatrix(xml, sharedStrings) {
  const matrix = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(xml))) {
    const values = [];
    const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch;
    let sequentialIndex = 0;
    while ((cellMatch = cellRegex.exec(rowMatch[1]))) {
      const attrs = cellMatch[1] || "";
      const content = cellMatch[2] || "";
      const reference = attrs.match(/\br="([^"]+)"/)?.[1];
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const columnIndex = columnIndexFromReference(reference) ?? sequentialIndex;
      sequentialIndex = columnIndex + 1;
      const rawValue = content.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "";
      let value;
      if (type === "s") value = sharedStrings[Number(rawValue)] ?? "";
      else if (type === "inlineStr") value = xmlText(content);
      else if (type === "b") value = rawValue === "1" ? "true" : "false";
      else value = decodeXml(rawValue);
      values[columnIndex] = value;
    }
    matrix.push(values.map((value) => value ?? ""));
  }
  return matrix;
}

export function parseXlsxBuffer(buffer) {
  try {
    const zip = readZipEntries(buffer);
    const worksheetName = zip.names
      .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))[0];
    if (!worksheetName) throw validationError("The XLSX file does not contain a worksheet.");
    const worksheet = zip.readEntry(worksheetName)?.toString("utf8");
    const sharedStrings = sharedStringsFromXml(zip.readEntry("xl/sharedStrings.xml")?.toString("utf8"));
    return rowsToObjects(worksheetMatrix(worksheet, sharedStrings));
  } catch (error) {
    if (error?.code === "VALIDATION_ERROR") throw error;
    throw validationError("The XLSX file is invalid.");
  }
}

export function parseUploadedTable({ buffer, filename, contentType }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw validationError("The uploaded file is empty.");
  const extension = path.extname(filename || "").toLowerCase();
  const type = String(contentType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const isXlsx = extension === ".xlsx" || type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const isCsv = extension === ".csv" || ["text/csv", "application/csv", "text/plain"].includes(type);
  if (isXlsx) return { fileType: "xlsx", ...parseXlsxBuffer(buffer) };
  if (isCsv) return { fileType: "csv", ...parseCsvBuffer(buffer) };
  throw validationError("Only CSV and XLSX files are supported.");
}
