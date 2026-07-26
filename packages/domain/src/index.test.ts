import { describe, expect, it } from 'vitest';
import { calculateDecision, contributionMargin, estimatedOperatingProfit, currencyRound, dataCompleteness, netSales, percentageChange } from './index.js';

describe('domain package', () => {
  it('exposes its stable package identity', () => {
    expect(calculateDecision([{ netAmount: '100.00', discountAmount: '5.00', refundAmount: '2.00', deliveryCommission: '10.00' }])).toMatchObject({ netSales: '83.00', leakage: '17.00', priority: 'CRITICAL' });
  });
  it('uses decimal-safe arithmetic and structured results', () => { const input = { items: [{ quantity: '2', grossAmount: '0.10', foodCost: '0.03', packagingCost: '0.01', currency: 'CNY' }], discounts: ['0.01'], refunds: ['0'], deliveryCommissions: ['0'], scope: { currency: 'CNY' } }; expect(netSales(input).value).toBe('0.19'); expect(contributionMargin(input).value).toBe('0.11'); expect(contributionMargin(input).dataQualityStatus).toBe('COMPLETE'); });
  it('withholds operating profit when required costs are missing', () => { const input = { items: [{ quantity: '1', grossAmount: '100', currency: 'CNY' }], scope: { currency: 'CNY' } }; expect(estimatedOperatingProfit(input).value).toBeNull(); expect(estimatedOperatingProfit(input).missingFields).toEqual(expect.arrayContaining(['laborCosts', 'operatingCosts'])); });
  it('reports missing item costs without assuming zero', () => { const input = { items: [{ quantity: '1', grossAmount: '100', currency: 'CNY' }], scope: { currency: 'CNY' } }; expect(contributionMargin(input).dataQualityStatus).toBe('PARTIAL'); expect(dataCompleteness(input).value).toBe('0.00%'); });
  it('handles zero periods and rounding', () => { const input = { items: [], scope: { currency: 'CNY' } }; expect(netSales(input).value).toBe('0.00'); expect(currencyRound('1.005')).toBe('1.01'); expect(percentageChange('10', '0')).toBeNull(); });
});
