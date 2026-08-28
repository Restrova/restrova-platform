import { z } from "zod";
import { validationError } from "../errors/appError.js";

export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM time.");

export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) throw validationError("Invalid request");
  return result.data;
}

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  organizationName: z.string().trim().min(1).max(160),
  restaurantName: z.string().trim().min(1).max(160),
  branchName: z.string().trim().min(1).max(160),
  branchCode: z.string().trim().min(1).max(40).default("GZ-01"),
  city: z.string().trim().min(1).max(120).default("Guangzhou"),
  currency: z.string().trim().length(3).default("CNY"),
  timezone: z.string().trim().min(1).max(80).default("Asia/Shanghai"),
  language: z.string().trim().min(2).max(10).default("ar"),
  operatingDayStart: timeSchema.default("10:00"),
  operatingDayEnd: timeSchema.default("02:00")
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  organizationId: z.number().int().positive().optional(),
  restaurantId: z.number().int().positive().optional()
});

export const switchRestaurantSchema = z.object({
  restaurantId: z.number().int().positive()
});

export const organizationSchema = z.object({
  name: z.string().trim().min(1).max(160),
  currency: z.string().trim().length(3).default("CNY"),
  timezone: z.string().trim().min(1).max(80).default("Asia/Shanghai"),
  language: z.string().trim().min(2).max(10).default("ar")
});

export const restaurantSchema = z.object({
  name: z.string().trim().min(1).max(160),
  businessType: z.string().trim().min(1).max(80).default("yemeni"),
  city: z.string().trim().max(120).optional()
});

export const branchCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  code: z.string().trim().min(1).max(40),
  city: z.string().trim().min(1).max(120),
  address: z.string().trim().max(240).optional(),
  phone: z.string().trim().max(80).optional(),
  posSystem: z.string().trim().max(120).optional(),
  operatingDayStart: timeSchema.default("10:00"),
  operatingDayEnd: timeSchema.default("02:00")
});

export const branchUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  code: z.string().trim().min(1).max(40).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  address: z.string().trim().max(240).nullable().optional(),
  phone: z.string().trim().max(80).nullable().optional(),
  posSystem: z.string().trim().max(120).nullable().optional(),
  operatingDayStart: timeSchema.optional(),
  operatingDayEnd: timeSchema.optional()
});

export const inviteUserSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().max(120).optional(),
  role: z.enum(["branch_manager", "viewer"]),
  branchId: z.number().int().positive().optional()
});

export const updateUserRoleSchema = z.object({
  role: z.enum(["owner", "branch_manager", "viewer"]),
  branchId: z.number().int().positive().nullable().optional()
});

export const importTemplateKeySchema = z.enum(["branches", "menu", "costs", "sales"]);

export const importPreviewSchema = z.object({
  type: z.enum(["orders", "refunds", "menu_items", "inventory", "staff_shifts"]),
  csv: z.string().min(1).max(2_500_000)
});

export const importConfirmSchema = importPreviewSchema.extend({
  branchId: z.number().int().positive().optional(),
  confirm: z.literal(true)
});

export const financialCategorySchema = z.enum([
  "sales",
  "discounts",
  "refunds",
  "food_costs",
  "packaging",
  "delivery_commissions",
  "labor",
  "rent",
  "utilities",
  "marketing",
  "miscellaneous_operating_expenses"
]);

const financialTimestampSchema = z.iso.datetime({ offset: true });

export const financialEntryCreateSchema = z
  .object({
    category: financialCategorySchema,
    amountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    branchId: z.number().int().positive().nullable().optional(),
    occurredAt: financialTimestampSchema,
    periodStart: financialTimestampSchema.optional(),
    periodEnd: financialTimestampSchema.optional(),
    sourceType: z.enum(["manual", "import", "system"]).default("manual"),
    sourceReference: z.string().trim().min(1).max(200),
    description: z.string().trim().max(500).optional(),
    evidence: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({})
  })
  .refine((entry) => Boolean(entry.periodStart) === Boolean(entry.periodEnd), {
    message: "Financial periods require both start and end."
  });

export const financialEntryQuerySchema = z.object({
  category: financialCategorySchema.optional(),
  branchId: z.coerce.number().int().positive().optional(),
  from: financialTimestampSchema.optional(),
  to: financialTimestampSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100)
});

export const financialCalculationQuerySchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  from: financialTimestampSchema.optional(),
  to: financialTimestampSchema.optional()
});

export const financialPeriodQuerySchema = z.object({
  period: z.enum(["today", "yesterday", "week", "month", "quarter", "year", "custom"]).default("today"),
  comparison: z.enum(["none", "previous_period", "same_weekday", "previous_year"]).default("previous_period"),
  branchId: z.coerce.number().int().positive().optional(),
  anchor: financialTimestampSchema.optional(),
  from: financialTimestampSchema.optional(),
  to: financialTimestampSchema.optional()
});

export const financialReportQuerySchema = financialPeriodQuerySchema.extend({
  scope: z.enum(["organization", "restaurant", "branch"]).optional(),
  restaurantId: z.coerce.number().int().positive().optional()
});

export const menuCostQuerySchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  itemCode: z.string().trim().min(1).max(100).optional(),
  status: z.enum(["active", "inactive", "all"]).default("active"),
  asOf: financialTimestampSchema.optional(),
  commissionFrom: financialTimestampSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).max(100_000).default(0)
});

export const menuMarginQuerySchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  itemCode: z.string().trim().min(1).max(100).optional(),
  status: z.enum(["active", "inactive", "all"]).default("active"),
  from: financialTimestampSchema.optional(),
  to: financialTimestampSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).max(100_000).default(0)
});

export const knowledgeImportSchema = z.object({
  title: z.string().trim().min(1).max(200),
  source: z.string().trim().max(500).optional(),
  content: z.string().trim().min(1).max(2_500_000)
});

export const chatSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  sessionId: z.number().int().positive().optional(),
  branchId: z.number().int().positive().optional()
});

export const feedbackSchema = z.object({
  sessionId: z.number().int().positive(),
  messageId: z.number().int().positive(),
  rating: z.enum(["approved", "needs_correction"]),
  correctedAnswer: z.string().trim().max(12000).optional(),
  correctTools: z.array(z.string().min(1).max(80)).max(12).default([])
});
