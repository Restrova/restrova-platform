import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { database } from '@rda/database';
import { requireAuth, requireRole, csrfProtection, audit } from '../middleware/auth.js';
import { createImportJob } from '../imports/import-service.js';
import type { Logger } from 'pino';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
export const importsRouter = (logger: Logger) => { const router = Router();
  router.post('/preview', requireAuth, requireRole('OWNER', 'MANAGER'), csrfProtection, upload.single('file'), audit(logger, 'IMPORT'), async (req, res, next) => { try { if (!req.file) return res.status(400).json({ error: { code: 'FILE_REQUIRED' } }); const body = z.object({ type: z.enum(['SALES', 'MENU', 'INGREDIENT_COSTS', 'OPERATING_COSTS', 'LABOR_COSTS']), sourceSystem: z.string().min(1).max(80) }).parse(req.body); const result = await createImportJob(database, { organizationId: req.tenant!.organizationId, restaurantId: req.tenant!.restaurantId, userId: req.tenant!.userId }, { ...body, file: req.file.buffer, name: req.file.originalname, mediaType: req.file.mimetype }); res.status(201).json({ data: { jobId: result.job.id, checksum: result.preview.checksum, sheets: result.preview.sheets, selectedSheet: result.preview.sheet, headers: result.preview.headers, previewRows: result.preview.rows, warnings: result.preview.warnings } }); } catch (e) { next(e); } });
  router.get('/:jobId/errors.csv', requireAuth, async (req, res, next) => { try { const errors = await database.importRowError.findMany({ where: { importJobId: req.params.jobId, organizationId: req.tenant!.organizationId, restaurantId: req.tenant!.restaurantId }, orderBy: { rowNumber: 'asc' } }); res.type('text/csv').send(['row,field,code,message', ...errors.map((e) => `${e.rowNumber},${e.field ?? ''},${e.code},"${e.message.replaceAll('"', '""')}"`)].join('\n')); } catch (e) { next(e); } });
  return router;
};
