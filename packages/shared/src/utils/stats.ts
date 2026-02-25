/**
 * Rate stat calculation utilities.
 * Always compute rate stats from components — never average rates directly.
 */

export function calcAvg(hits: number, ab: number): number | null {
  return ab > 0 ? hits / ab : null;
}

export function calcObp(hits: number, bb: number, hbp: number, ab: number, sf: number): number | null {
  const denom = ab + bb + hbp + sf;
  return denom > 0 ? (hits + bb + hbp) / denom : null;
}

export function calcSlg(
  singles: number,
  doubles: number,
  triples: number,
  hr: number,
  ab: number,
): number | null {
  if (ab === 0) return null;
  const tb = singles + doubles * 2 + triples * 3 + hr * 4;
  return tb / ab;
}

export function calcOps(
  hits: number,
  bb: number,
  hbp: number,
  ab: number,
  sf: number,
  singles: number,
  doubles: number,
  triples: number,
  hr: number,
): number | null {
  const obp = calcObp(hits, bb, hbp, ab, sf);
  const slg = calcSlg(singles, doubles, triples, hr, ab);
  return obp !== null && slg !== null ? obp + slg : null;
}

export function calcEra(er: number, ip: number): number | null {
  return ip > 0 ? (er * 9) / ip : null;
}

export function calcWhip(hitsAllowed: number, bbAllowed: number, ip: number): number | null {
  return ip > 0 ? (hitsAllowed + bbAllowed) / ip : null;
}

/**
 * Combine rate stats from two sets of counting stats.
 * Used for trade impact calculations — merge components, then recompute rate.
 */
export function mergeAndComputeAvg(
  h1: number, ab1: number,
  h2: number, ab2: number,
): number | null {
  return calcAvg(h1 + h2, ab1 + ab2);
}

export function mergeAndComputeEra(
  er1: number, ip1: number,
  er2: number, ip2: number,
): number | null {
  return calcEra(er1 + er2, ip1 + ip2);
}

export function mergeAndComputeWhip(
  ha1: number, bb1: number, ip1: number,
  ha2: number, bb2: number, ip2: number,
): number | null {
  return calcWhip(ha1 + ha2, bb1 + bb2, ip1 + ip2);
}

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
