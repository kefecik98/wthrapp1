import { describePeriod, planTerms } from './subscriptionTerms';

describe('describePeriod', () => {
  it.each([
    ['P1M', 'month'],
    ['P1Y', 'year'],
    ['P1W', 'week'],
    ['P3M', '3 months'],
    ['P7D', '7 days'],
  ])('%s → %s', (iso, expected) => {
    expect(describePeriod(iso)).toBe(expected);
  });

  it('returns null for missing or compound periods', () => {
    expect(describePeriod(null)).toBeNull();
    expect(describePeriod(undefined)).toBeNull();
    expect(describePeriod('P1Y2M')).toBeNull();
    expect(describePeriod('garbage')).toBeNull();
  });
});

describe('planTerms', () => {
  it('states price per period', () => {
    expect(
      planTerms({ priceString: '$4.99', subscriptionPeriod: 'P1M', introPrice: null }),
    ).toEqual({ price: '$4.99 / month', offer: null });
  });

  it('falls back to the bare price when the period is unknown', () => {
    expect(
      planTerms({ priceString: '$4.99', subscriptionPeriod: null, introPrice: null }).price,
    ).toBe('$4.99');
  });

  it('describes a free trial and what it renews at', () => {
    const terms = planTerms({
      priceString: '$39.99',
      subscriptionPeriod: 'P1Y',
      introPrice: {
        price: 0,
        priceString: '$0.00',
        cycles: 1,
        period: 'P7D',
        periodUnit: 'DAY',
        periodNumberOfUnits: 7,
      },
    });
    expect(terms.offer).toBe('7-day free trial, then $39.99 / year');
  });

  it('describes a paid introductory price', () => {
    const terms = planTerms({
      priceString: '$4.99',
      subscriptionPeriod: 'P1M',
      introPrice: {
        price: 0.99,
        priceString: '$0.99',
        cycles: 3,
        period: 'P1M',
        periodUnit: 'MONTH',
        periodNumberOfUnits: 1,
      },
    });
    expect(terms.offer).toBe('$0.99 for the first 3 months, then $4.99 / month');
  });
});
