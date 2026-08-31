function applicableCost(costs, row) {
  return costs.find(
    (cost) =>
      cost.organization_id === row.organization_id &&
      cost.restaurant_id === row.restaurant_id &&
      cost.catalog_item_id === row.catalog_item_id &&
      (cost.branch_id === row.branch_id || cost.branch_id == null) &&
      Date.parse(cost.effective_from) <= Date.parse(row.created_at)
  );
}

export function backfillImportedSalesLedger(db) {
  const rows = db
    .prepare(
      `SELECT sales.*,restaurants.currency,restaurants.owner_id
       FROM sales_lines sales
       JOIN restaurants ON restaurants.id=sales.restaurant_id
       WHERE NOT EXISTS (
         SELECT 1 FROM financial_ledger_entries ledger
         WHERE ledger.organization_id=sales.organization_id
           AND ledger.restaurant_id=sales.restaurant_id
           AND ledger.branch_id=sales.branch_id
           AND ledger.category='sales'
           AND ledger.source_type='import'
           AND ledger.source_reference=sales.external_order_id
       )
       ORDER BY sales.organization_id,sales.restaurant_id,sales.branch_id,sales.external_order_id,sales.id`
    )
    .all();
  if (!rows.length) return 0;

  const costs = db
    .prepare(
      `SELECT organization_id,restaurant_id,catalog_item_id,branch_id,
              direct_food_cost_minor,packaging_cost_minor,effective_from
       FROM item_costs
       ORDER BY organization_id,restaurant_id,catalog_item_id,
                CASE WHEN branch_id IS NULL THEN 1 ELSE 0 END,
                julianday(effective_from) DESC,id DESC`
    )
    .all();
  const orders = new Map();
  for (const row of rows) {
    const key = `${row.organization_id}:${row.restaurant_id}:${row.branch_id}:${row.external_order_id}`;
    const order = orders.get(key) || {
      ...row,
      occurredAt: row.created_at,
      lineCount: 0,
      totals: {
        sales: 0,
        discounts: 0,
        refunds: 0,
        food_costs: 0,
        packaging: 0,
        delivery_commissions: 0
      }
    };
    const cost = applicableCost(costs, row);
    order.occurredAt = order.occurredAt < row.created_at ? order.occurredAt : row.created_at;
    order.lineCount += 1;
    order.totals.sales += row.gross_sales_minor;
    order.totals.discounts += row.discount_minor;
    order.totals.refunds += row.refund_amount_minor;
    order.totals.delivery_commissions += row.delivery_commission_minor;
    order.totals.food_costs += Math.round((cost?.direct_food_cost_minor || 0) * row.quantity);
    order.totals.packaging += Math.round((cost?.packaging_cost_minor || 0) * row.quantity);
    orders.set(key, order);
  }

  const insert = db.prepare(
    `INSERT OR IGNORE INTO financial_ledger_entries(
      organization_id,restaurant_id,branch_id,category,amount_minor,currency_code,
      occurred_at,source_type,source_reference,description,evidence_json,created_by,scope_key
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  return db.transaction(() => {
    let inserted = 0;
    for (const order of orders.values()) {
      for (const [category, amountMinor] of Object.entries(order.totals)) {
        if (!amountMinor) continue;
        inserted += insert.run(
          order.organization_id,
          order.restaurant_id,
          order.branch_id,
          category,
          amountMinor,
          String(order.currency).toUpperCase(),
          order.occurredAt,
          "import",
          order.external_order_id,
          `Backfilled imported sales order ${order.external_order_id}`,
          JSON.stringify({
            source: "sales_lines",
            externalOrderId: order.external_order_id,
            lineCount: order.lineCount,
            backfilled: true
          }),
          order.owner_id,
          `branch:${order.branch_id}`
        ).changes;
      }
    }
    return inserted;
  })();
}
