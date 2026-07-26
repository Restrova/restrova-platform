import { createHash, randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import type { PrismaClient } from '@rda/database';

const MAX_BYTES = 10 * 1024 * 1024;
const allowed = new Set(['text/csv', 'application/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']);
export type ImportPreview = { checksum: string; sheets: string[]; sheet: string; headers: string[]; rows: Record<string, unknown>[]; warnings: string[] };

export function parseImport(buffer: Buffer, name: string, mediaType: string, sheet?: string): ImportPreview {
  if (buffer.length === 0 || buffer.length > MAX_BYTES) throw new Error('FILE_SIZE_INVALID');
  const ext = name.toLowerCase().split('.').pop();
  if (!ext || !['csv', 'xlsx', 'xls'].includes(ext) || !allowed.has(mediaType)) throw new Error('FILE_TYPE_INVALID');
  const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: false, cellHTML: false, raw: false });
  const sheets = workbook.SheetNames; if (!sheets.length) throw new Error('FILE_EMPTY');
  const selected = sheet && sheets.includes(sheet) ? sheet : sheets[0]!;
  const worksheet = workbook.Sheets[selected]!;
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: null, raw: false, range: 0 });
  const headers = rows.length ? Object.keys(rows[0]!) : (XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 })[0] ?? []);
  if (!headers.length) throw new Error('FILE_EMPTY');
  const warnings: string[] = [];
  for (const row of rows) for (const value of Object.values(row)) if (typeof value === 'string' && /^[=+\-@]/.test(value)) throw new Error('DANGEROUS_FORMULA');
  return { checksum: createHash('sha256').update(buffer).digest('hex'), sheets, sheet: selected, headers, rows: rows.slice(0, 50), warnings };
}

export async function createImportJob(db: PrismaClient, context: { organizationId: string; restaurantId: string; userId: string }, input: { type: 'SALES' | 'MENU' | 'INGREDIENT_COSTS' | 'OPERATING_COSTS' | 'LABOR_COSTS'; sourceSystem: string; file: Buffer; name: string; mediaType: string }) {
  const preview = parseImport(input.file, input.name, input.mediaType);
  const duplicate = await db.importFile.findFirst({ where: { organizationId: context.organizationId, restaurantId: context.restaurantId, sha256: preview.checksum } });
  if (duplicate) throw new Error('DUPLICATE_FILE');
  const job = await db.importJob.create({ data: { id: randomUUID(), organizationId: context.organizationId, restaurantId: context.restaurantId, type: input.type, sourceSystem: input.sourceSystem, requestedById: context.userId, status: 'VALIDATING', rowCount: preview.rows.length } });
  await db.importFile.create({ data: { id: randomUUID(), organizationId: context.organizationId, restaurantId: context.restaurantId, importJobId: job.id, storageKey: `${context.organizationId}/${job.id}/${preview.checksum}`, originalName: input.name, mediaType: input.mediaType, sizeBytes: input.file.length, sha256: preview.checksum } });
  return { job, preview };
}
