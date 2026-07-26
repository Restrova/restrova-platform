import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { database } from '@rda/database';
import { requireAuth, requireRole, csrfProtection, audit } from '../middleware/auth.js';
import type { Logger } from 'pino';

const channel = z.object({ name: z.string().min(1).max(80), type: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY', 'OTHER']), branchId: z.uuid().optional() });
const branch = z.object({ name: z.string().min(1).max(120), code: z.string().min(1).max(30), address: z.string().max(300).optional(), timezone: z.string().min(1), isActive: z.boolean().default(true), openingDate: z.string().date().optional() });
const profile = z.object({ name: z.string().min(1).max(120), legalName: z.string().max(160).optional(), country: z.string().max(80).optional(), city: z.string().max(80).optional(), currency: z.string().length(3).transform((v) => v.toUpperCase()), timezone: z.string().min(1), defaultLanguage: z.enum(['en', 'ar']), businessType: z.string().max(80).optional(), fiscalWeekStart: z.number().int().min(0).max(6), taxHandling: z.enum(['inclusive', 'exclusive', 'none']) });

export const onboardingRouter = (logger: Logger) => { const router = Router();
  router.use(requireAuth, requireRole('OWNER'));
  router.get('/status', async (req, res, next) => { try { const t = req.tenant!; const [restaurant, branches, channels, members] = await Promise.all([database.restaurant.findUnique({ where: { id: t.restaurantId } }), database.branch.findMany({ where: { organizationId: t.organizationId, restaurantId: t.restaurantId } }), database.salesChannel.findMany({ where: { organizationId: t.organizationId, restaurantId: t.restaurantId } }), database.membership.count({ where: { organizationId: t.organizationId, restaurantId: t.restaurantId } })]); res.json({ data: { profile: Boolean(restaurant?.country && restaurant.city && restaurant.businessType), branches: branches.length > 0, channels: channels.length > 0, members: members > 1, language: restaurant?.defaultLanguage ?? 'en', complete: Boolean(restaurant?.country && restaurant.city && restaurant.businessType && branches.length && channels.length) } }); } catch (e) { next(e); } });
  router.put('/profile', csrfProtection, audit(logger, 'ONBOARDING_PROFILE'), async (req, res, next) => { try { const body = profile.parse(req.body); const updated = await database.restaurant.update({ where: { id: req.tenant!.restaurantId }, data: body }); res.json({ data: updated }); } catch (e) { next(e); } });
  router.post('/branches', csrfProtection, audit(logger, 'ONBOARDING_BRANCH'), async (req, res, next) => { try { const body = branch.parse(req.body); const t = req.tenant!; const { openingDate, ...branchData } = body; const created = await database.branch.create({ data: { id: randomUUID(), organizationId: t.organizationId, restaurantId: t.restaurantId, ...branchData, openingDate: openingDate ? new Date(openingDate) : undefined } }); res.status(201).json({ data: created }); } catch (e) { next(e); } });
  router.post('/channels', csrfProtection, audit(logger, 'ONBOARDING_CHANNEL'), async (req, res, next) => { try { const body = channel.parse(req.body); const t = req.tenant!; if (body.branchId && !t.permittedBranchIds.includes(body.branchId)) return res.status(403).json({ error: { code: 'BRANCH_FORBIDDEN' } }); const created = await database.salesChannel.create({ data: { id: randomUUID(), organizationId: t.organizationId, restaurantId: t.restaurantId, name: body.name, type: body.type, branchId: body.branchId } }); res.status(201).json({ data: created }); } catch (e) { next(e); } });
  return router;
};
