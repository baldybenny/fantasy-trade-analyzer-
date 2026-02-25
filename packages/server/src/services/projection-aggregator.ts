/**
 * Projection Aggregator
 *
 * Merges multiple projection sources (Steamer, ZiPS, ATC, etc.) into a single
 * composite projection per player using configurable source weights.
 *
 * CRITICAL RULE: Rate stats (AVG, ERA, WHIP, OPS) are NEVER averaged directly.
 * Instead, the component counting stats are weighted and combined, and then
 * the rate stat is recomputed from the merged components. For example:
 *
 *   weighted_AVG = weighted_H / weighted_AB
 *   weighted_ERA = (weighted_ER * 9) / weighted_IP
 */

import type {
  ProjectionRecord,
  ProjectionSource,
  PlayerStats,
} from '@fta/shared';
import { DEFAULT_PROJECTION_WEIGHTS } from '@fta/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single source's projection set along with its source identifier. */
export interface ProjectionSet {
  source: ProjectionSource;
  records: ProjectionRecord[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalise weights so they sum to 1.0 across only the sources that are
 * actually present in the input.
 */
function normaliseWeights(
  sources: ProjectionSource[],
  rawWeights: Record<ProjectionSource, number>,
): Record<ProjectionSource, number> {
  const total = sources.reduce((s, src) => s + (rawWeights[src] ?? 0), 0);
  if (total === 0) {
    // Fallback: equal weighting
    const equal = 1 / sources.length;
    const out: Record<string, number> = {};
    for (const src of sources) out[src] = equal;
    return out as Record<ProjectionSource, number>;
  }
  const out: Record<string, number> = {};
  for (const src of sources) {
    out[src] = (rawWeights[src] ?? 0) / total;
  }
  return out as Record<ProjectionSource, number>;
}

/**
 * Build a zero-initialised PlayerStats object.
 */
function emptyStats(): PlayerStats {
  return {
    games: 0,
    pa: 0,
    ab: 0,
    runs: 0,
    hits: 0,
    doubles: 0,
    triples: 0,
    hr: 0,
    rbi: 0,
    sb: 0,
    cs: 0,
    bb: 0,
    so: 0,
    ip: 0,
    wins: 0,
    losses: 0,
    saves: 0,
    holds: 0,
    qs: 0,
    er: 0,
    hitsAllowed: 0,
    bbAllowed: 0,
    strikeouts: 0,
  };
}

/**
 * Accumulate a ProjectionRecord's counting stats into a running PlayerStats
 * total, scaled by the given weight.
 */
function accumulateWeighted(
  target: PlayerStats,
  record: ProjectionRecord,
  weight: number,
): void {
  // Hitting counting stats
  target.pa += record.pa * weight;
  target.ab += record.ab * weight;
  target.hits += record.hits * weight;
  target.doubles += record.doubles * weight;
  target.triples += record.triples * weight;
  target.hr += record.hr * weight;
  target.runs += record.runs * weight;
  target.rbi += record.rbi * weight;
  target.sb += record.sb * weight;
  target.cs += record.cs * weight;
  target.bb += record.bb * weight;
  target.so += record.so * weight;

  // Pitching counting stats
  target.ip += record.ip * weight;
  target.wins += record.wins * weight;
  target.losses += record.losses * weight;
  target.saves += record.saves * weight;
  target.qs += record.qs * weight;
  target.er += record.er * weight;
  target.hitsAllowed += record.hitsAllowed * weight;
  target.bbAllowed += record.bbAllowed * weight;
  target.strikeouts += record.strikeouts * weight;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Aggregate multiple projection sources into a single set of PlayerStats per
 * player.
 *
 * For each player that appears in at least one source:
 *   1. Collect all source records for that player.
 *   2. Normalise the weights across only the sources that contain data for
 *      this player (so if a player is missing from ATC, the Steamer and ZiPS
 *      weights are re-proportioned).
 *   3. Compute the weighted sum of every counting stat.
 *   4. Return the resulting PlayerStats. Rate stats (AVG, OPS, ERA, WHIP) are
 *      NOT stored here; they are always recomputed on-the-fly from the
 *      component counting stats when needed.
 *
 * @param projectionSets - Array of { source, records } for each projection
 *                         system.
 * @param weights        - Optional custom weighting map. Defaults to
 *                         Steamer 0.40, ZiPS 0.35, ATC 0.25.
 * @returns An array of aggregated PlayerStats, one per unique playerId.
 */
export function aggregateProjections(
  projectionSets: ProjectionSet[],
  weights?: Record<ProjectionSource, number>,
): PlayerStats[] {
  const effectiveWeights = weights ?? DEFAULT_PROJECTION_WEIGHTS;

  // Index records by playerId -> source -> record
  const byPlayer = new Map<
    number,
    { name: string; isPitcher: boolean; sources: Map<ProjectionSource, ProjectionRecord> }
  >();

  for (const { source, records } of projectionSets) {
    for (const rec of records) {
      let entry = byPlayer.get(rec.playerId);
      if (!entry) {
        entry = {
          name: rec.playerName,
          isPitcher: rec.isPitcher,
          sources: new Map(),
        };
        byPlayer.set(rec.playerId, entry);
      }
      entry.sources.set(source, rec);
    }
  }

  // Build aggregated stats for each player
  const results: PlayerStats[] = [];

  for (const [_playerId, { sources }] of byPlayer) {
    const presentSources = Array.from(sources.keys());
    const normWeights = normaliseWeights(presentSources, effectiveWeights);
    const merged = emptyStats();

    for (const [source, record] of sources) {
      const w = normWeights[source] ?? 0;
      accumulateWeighted(merged, record, w);
    }

    results.push(merged);
  }

  return results;
}
