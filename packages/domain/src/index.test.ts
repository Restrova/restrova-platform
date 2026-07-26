import { describe, expect, it } from 'vitest';
import { calculateDecision } from './index.js';

describe('domain package', () => {
  it('exposes its stable package identity', () => {
    expect(calculateDecision([{ netAmount: '100.00', discountAmount: '5.00', refundAmount: '2.00', deliveryCommission: '10.00' }])).toMatchObject({ netSales: '83.00', leakage: '17.00', priority: 'CRITICAL' });
  });
});
