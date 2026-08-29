const COMMON_ALIASES = {
  branch_code: ["branch_code", "branch code", "branch", "branch id", "restaurant branch"],
  name: ["name", "branch name", "item name", "menu item", "product", "product name"],
  city: ["city", "branch city"],
  address: ["address", "branch address"],
  phone: ["phone", "phone number", "telephone"],
  pos_system: ["pos_system", "pos system", "pos"],
  operating_day_start: ["operating_day_start", "operating day start", "opening time", "open time"],
  operating_day_end: ["operating_day_end", "operating day end", "closing time", "close time"],
  item_code: ["item_code", "item code", "menu item code", "menu item name", "product code", "sku"],
  category: ["category", "item category", "menu category", "product category"],
  selling_price: ["selling_price", "selling price", "sale price", "price", "menu price"],
  active: ["active", "is active", "enabled"],
  direct_food_cost: ["direct_food_cost", "direct food cost", "food cost", "ingredient cost", "unit food cost"],
  packaging_cost: ["packaging_cost", "packaging cost", "package cost"],
  effective_from: ["effective_from", "effective from", "effective date", "start date"],
  external_order_id: ["external_order_id", "external order id", "order id", "order number"],
  external_line_id: ["external_line_id", "external line id", "line id", "line number"],
  created_at: [
    "created_at",
    "created at",
    "date",
    "sale date",
    "sale time",
    "sold at",
    "transaction date",
    "transaction time"
  ],
  channel: ["channel", "sales channel", "order channel", "source channel"],
  quantity: ["quantity", "quantity sold", "qty", "units", "units sold"],
  gross_sales: ["gross_sales", "gross sales", "sales amount", "gross amount", "line total"],
  discount: ["discount", "discount amount"],
  refund_amount: ["refund_amount", "refund amount", "refund"],
  delivery_commission: ["delivery_commission", "delivery commission", "commission"]
};

export function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function aliasesFor(field) {
  const configured = COMMON_ALIASES[field] ?? [field];
  return new Set([...configured, field].map((value) => normalizeHeader(value)));
}

export function suggestColumnMappings(headers, template) {
  const templateFields = template.columns.map((column) => column.name);

  return headers.map((sourceColumn) => {
    const normalizedSource = normalizeHeader(sourceColumn);
    const matches = templateFields.filter((field) => aliasesFor(field).has(normalizedSource));

    return {
      sourceColumn,
      targetField: matches.length === 1 ? matches[0] : null,
      confidence: matches.length === 1 ? "exact_alias" : "unmapped"
    };
  });
}

export function applyColumnMappings(rows, mappings) {
  const usableMappings = mappings.filter((mapping) => Boolean(mapping.sourceColumn) && Boolean(mapping.targetField));

  return rows.map((row) => {
    const mappedRow = {};
    for (const mapping of usableMappings) {
      mappedRow[mapping.targetField] = row[mapping.sourceColumn];
    }
    return mappedRow;
  });
}

export function findMissingRequiredMappings(template, mappings) {
  const mappedFields = new Set(
    mappings.filter((mapping) => Boolean(mapping.targetField)).map((mapping) => mapping.targetField)
  );
  return template.requiredColumns.filter((field) => !mappedFields.has(field));
}

export function validateManualMappings(template, headers, mappings) {
  if (!Array.isArray(mappings)) {
    return [
      {
        sourceColumn: null,
        targetField: null,
        code: "invalid_mapping_payload",
        message: "mappings must be an array."
      }
    ];
  }

  const sourceColumns = new Set(headers);
  const allowedTargets = new Set(template.columns.map((column) => column.name));
  const usedSources = new Set();
  const usedTargets = new Set();
  const errors = [];

  for (const mapping of mappings) {
    const sourceColumn = mapping?.sourceColumn;
    const targetField = mapping?.targetField ?? null;

    if (!sourceColumn || !sourceColumns.has(sourceColumn)) {
      errors.push({
        sourceColumn,
        targetField,
        code: "unknown_source_column",
        message: `Unknown uploaded column: ${sourceColumn}`
      });
      continue;
    }

    if (usedSources.has(sourceColumn)) {
      errors.push({
        sourceColumn,
        targetField,
        code: "duplicate_source_column",
        message: `${sourceColumn} is included more than once.`
      });
      continue;
    }
    usedSources.add(sourceColumn);

    if (targetField !== null && !allowedTargets.has(targetField)) {
      errors.push({
        sourceColumn,
        targetField,
        code: "unknown_target_field",
        message: `Unknown Restrova field: ${targetField}`
      });
      continue;
    }

    if (targetField && usedTargets.has(targetField)) {
      errors.push({
        sourceColumn,
        targetField,
        code: "duplicate_target_field",
        message: `${targetField} is mapped more than once.`
      });
      continue;
    }

    if (targetField) usedTargets.add(targetField);
  }

  const missingSources = headers.filter((header) => !usedSources.has(header));
  for (const sourceColumn of missingSources) {
    errors.push({
      sourceColumn,
      targetField: null,
      code: "missing_source_mapping",
      message: `${sourceColumn} must be included in the mapping, even if its target is null.`
    });
  }

  return errors;
}

export function mappingSummary(template, mappings) {
  const missingRequiredMappings = findMissingRequiredMappings(template, mappings);
  const mappedCount = mappings.filter((mapping) => mapping.targetField).length;
  const unmappedColumns = mappings.filter((mapping) => !mapping.targetField).map((mapping) => mapping.sourceColumn);

  return {
    mappedCount,
    unmappedCount: unmappedColumns.length,
    unmappedColumns,
    missingRequiredMappings,
    ready: missingRequiredMappings.length === 0
  };
}

export function sourceColumnForTarget(mappings, targetField) {
  return mappings.find((mapping) => mapping.targetField === targetField)?.sourceColumn ?? null;
}
