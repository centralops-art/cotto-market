/**
 * All money in this codebase is an integer count of cents. Never use floats for currency.
 */

export type Cents = number;

export function assertIsCents(value: number, label = "value"): asserts value is Cents {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer number of cents, got ${value}`);
  }
}

export function addCents(...values: Cents[]): Cents {
  values.forEach((v, i) => assertIsCents(v, `addCents arg[${i}]`));
  return values.reduce((sum, v) => sum + v, 0);
}

export function subtractCents(a: Cents, b: Cents): Cents {
  assertIsCents(a, "a");
  assertIsCents(b, "b");
  return a - b;
}

/**
 * Multiplies cents by a percentage (0-100), rounding to the nearest cent.
 * Rounding is banker's-neutral (Math.round, half away from zero) since these
 * are the only rounding semantics used anywhere fees are split.
 */
export function percentOfCents(amountCents: Cents, pct: number): Cents {
  assertIsCents(amountCents, "amountCents");
  if (pct < 0 || pct > 100) {
    throw new Error(`pct must be between 0 and 100, got ${pct}`);
  }
  return Math.round(amountCents * (pct / 100));
}

export function formatCents(amountCents: Cents, currency = "USD"): string {
  assertIsCents(amountCents, "amountCents");
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountCents / 100);
}
