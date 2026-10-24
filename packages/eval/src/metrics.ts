// Metric primitives. Every reported number carries its numerator and
// denominator so a reader can see the sample size behind it.

export type Metric = {
  /** numerator / denominator, rounded to 4 places; null when the denominator is 0. */
  value: number | null;
  numerator: number;
  denominator: number;
};

export function ratio(numerator: number, denominator: number): Metric {
  return {
    value: denominator === 0 ? null : Math.round((numerator / denominator) * 10000) / 10000,
    numerator,
    denominator,
  };
}

/** Macro-average of per-item values in [0,1]; the "numerator" is the sum of per-item values. */
export function macroAverage(values: number[]): Metric {
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    value: values.length === 0 ? null : Math.round((sum / values.length) * 10000) / 10000,
    numerator: Math.round(sum * 10000) / 10000,
    denominator: values.length,
  };
}

/** Fraction of gold items found in the top-k of a ranked list (per question). */
export function recallAtK(ranked: string[], gold: string[], k: number): number {
  if (gold.length === 0) return 0;
  const top = new Set(ranked.slice(0, k));
  return gold.filter((g) => top.has(g)).length / gold.length;
}

/** 1 if at least one gold item is in the top-k, else 0. */
export function hitAtK(ranked: string[], gold: string[], k: number): number {
  const top = new Set(ranked.slice(0, k));
  return gold.some((g) => top.has(g)) ? 1 : 0;
}

/** Reciprocal rank of the first gold item (0 if none retrieved). */
export function reciprocalRank(ranked: string[], gold: string[]): number {
  const goldSet = new Set(gold);
  const idx = ranked.findIndex((r) => goldSet.has(r));
  return idx < 0 ? 0 : 1 / (idx + 1);
}
