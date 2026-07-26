export type OrderInput = { netAmount: string; discountAmount?: string; refundAmount?: string; deliveryCommission?: string };
export type DecisionMetrics = { grossSales: string; discounts: string; refunds: string; deliveryCommissions: string; netSales: string; leakage: string; leakageRate: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; issue: string | null; recommendation: string | null; evidence: string[] };

const cents = (value: string | undefined): bigint => {
  const normalized = value ?? '0';
  const [whole, fraction = ''] = normalized.trim().split('.');
  const sign = whole.startsWith('-') ? -1n : 1n;
  const absoluteWhole = whole.replace('-', '') || '0';
  return sign * (BigInt(absoluteWhole) * 100n + BigInt((fraction + '00').slice(0, 2)));
};
const money = (value: bigint) => `${value < 0n ? '-' : ''}${(value < 0n ? -value : value) / 100n}.${((value < 0n ? -value : value) % 100n).toString().padStart(2, '0')}`;

/** Deterministic, dependency-free financial decision engine. It never calls an AI provider. */
export function calculateDecision(orders: OrderInput[]): DecisionMetrics {
  const gross = orders.reduce((sum, order) => sum + cents(order.netAmount), 0n);
  const discounts = orders.reduce((sum, order) => sum + cents(order.discountAmount), 0n);
  const refunds = orders.reduce((sum, order) => sum + cents(order.refundAmount), 0n);
  const commissions = orders.reduce((sum, order) => sum + cents(order.deliveryCommission), 0n);
  const leakage = discounts + refunds + commissions;
  const net = gross - leakage;
  const leakageRate = gross === 0n ? 0 : Number((leakage * 10000n) / gross) / 100;
  const priority = leakageRate >= 15 ? 'CRITICAL' : leakageRate >= 8 ? 'HIGH' : leakageRate >= 3 ? 'MEDIUM' : 'LOW';
  const issue = leakageRate >= 3 ? 'Revenue leakage detected' : null;
  const recommendation = leakageRate >= 3 ? 'Review discounts, refunds, and delivery commission rules this week.' : null;
  return { grossSales: money(gross), discounts: money(discounts), refunds: money(refunds), deliveryCommissions: money(commissions), netSales: money(net), leakage: money(leakage), leakageRate: `${leakageRate.toFixed(2)}%`, priority, issue, recommendation, evidence: [`${orders.length} orders evaluated`, `Leakage total: ${money(leakage)}`, `Leakage rate: ${leakageRate.toFixed(2)}%`] };
}
