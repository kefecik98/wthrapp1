// Human-readable subscription terms for the paywall.
//
// Google Play's subscriptions policy (and Apple 3.1.2, for later) requires the
// price, the billing period and any free trial to be stated clearly before the
// user taps buy. RevenueCat hands us the period as ISO 8601 ("P1M", "P1Y") and
// the trial as an intro price; this turns both into plain English.

import type { PurchasesStoreProduct } from 'react-native-purchases';

const UNIT_NAMES: Record<string, string> = {
  D: 'day',
  W: 'week',
  M: 'month',
  Y: 'year',
};

/**
 * "P1M" → "month", "P3M" → "3 months", "P1Y" → "year". Returns null for
 * anything that isn't a single-unit ISO 8601 period, so the caller can fall
 * back to showing the price alone rather than a wrong period.
 */
export function describePeriod(iso: string | null | undefined): string | null {
  const match = /^P(\d+)([DWMY])$/.exec(iso ?? '');
  if (!match) return null;
  const count = Number(match[1]);
  const unit = UNIT_NAMES[match[2]];
  return count === 1 ? unit : `${count} ${unit}s`;
}

/** RevenueCat's intro-price unit ("DAY", "MONTH") → "day", "month". */
function unitName(periodUnit: string, count: number): string {
  const unit = periodUnit.toLowerCase();
  return count === 1 ? unit : `${unit}s`;
}

export interface PlanTerms {
  /** e.g. "$4.99 / month". */
  price: string;
  /** e.g. "7-day free trial, then $4.99 / month". Null when there's no offer. */
  offer: string | null;
}

/** Price + billing period + any trial, ready to render under a plan. */
export function planTerms(
  product: Pick<
    PurchasesStoreProduct,
    'priceString' | 'subscriptionPeriod' | 'introPrice'
  >,
): PlanTerms {
  const period = describePeriod(product.subscriptionPeriod);
  const price = period
    ? `${product.priceString} / ${period}`
    : product.priceString;

  const intro = product.introPrice;
  if (!intro) return { price, offer: null };

  const length = intro.periodNumberOfUnits * Math.max(intro.cycles, 1);
  if (intro.price === 0) {
    // "7-day free trial" reads better than "free for 7 days" on a buy button.
    return {
      price,
      offer: `${length}-${intro.periodUnit.toLowerCase()} free trial, then ${price}`,
    };
  }
  return {
    price,
    offer: `${intro.priceString} for the first ${length} ${unitName(intro.periodUnit, length)}, then ${price}`,
  };
}
