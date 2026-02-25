/**
 * Roster Optimizer
 *
 * Evaluates positional fit when players are traded in/out of a roster.
 * Produces a 0-100 score reflecting how well the incoming players integrate
 * with the team's remaining roster and positional requirements.
 *
 * Scoring components:
 *   - Positional need (40 pts): incoming players fill positions that would
 *     otherwise be vacant.
 *   - Multi-eligibility bonus (20 pts): players eligible at multiple
 *     positions add roster flexibility.
 *   - Slot coverage (25 pts): after the trade, how many required position
 *     slots are covered vs. unfilled.
 *   - Bench depth (15 pts): adequate bench depth for injury insurance.
 */

import type { Player, LeagueSettings, RosterFitResult } from '@fta/shared';
import { Position, DEFAULT_POSITION_SLOTS } from '@fta/shared';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Get the position-slot requirements from league settings, falling back to
 * defaults.
 */
function getSlots(settings: LeagueSettings): Record<string, number> {
  return Object.keys(settings.positionSlots).length > 0
    ? settings.positionSlots
    : DEFAULT_POSITION_SLOTS;
}

/**
 * Determine the set of positions a player can fill (from their multi-
 * eligibility list, plus UTIL for any hitter).
 */
function eligibleSlots(player: Player): string[] {
  const slots: string[] = [...player.positions];
  // Every non-pitcher is also UTIL-eligible
  const isPitcher = player.positions.some((p) => p === Position.SP || p === Position.RP);
  if (!isPitcher && !slots.includes(Position.UTIL)) {
    slots.push(Position.UTIL);
  }
  return slots;
}

/**
 * Greedily assign players to position slots. Returns the set of positions
 * that remain unfilled and how many players are unassigned (bench).
 */
function assignPlayersToSlots(
  roster: Player[],
  positionSlots: Record<string, number>,
): { filledSlots: Record<string, number>; unfilledPositions: string[]; benchCount: number } {
  // Deep copy the slots requirement
  const remaining: Record<string, number> = {};
  for (const [pos, count] of Object.entries(positionSlots)) {
    remaining[pos] = count;
  }

  const filled: Record<string, number> = {};
  const assigned = new Set<number>(); // player ids that have been assigned

  // Sort players by number of eligible positions (ascending) to assign the
  // most constrained players first — a simple greedy heuristic.
  const sorted = [...roster].sort(
    (a, b) => eligibleSlots(a).length - eligibleSlots(b).length,
  );

  for (const player of sorted) {
    if (assigned.has(player.id)) continue;
    const eligible = eligibleSlots(player);

    // Try to assign to most-constrained open slot first
    // Sort eligible slots by remaining capacity ascending (fill scarce slots first)
    const sortedSlots = eligible
      .filter((pos) => (remaining[pos] ?? 0) > 0)
      .sort((a, b) => (remaining[a] ?? 0) - (remaining[b] ?? 0));

    if (sortedSlots.length > 0) {
      const slot = sortedSlots[0];
      remaining[slot]--;
      filled[slot] = (filled[slot] ?? 0) + 1;
      assigned.add(player.id);
    }
    // If no slot fits, the player ends up on the bench (unassigned)
  }

  // Bench players = total roster minus assigned
  const benchCount = roster.length - assigned.size;

  // Unfilled positions = any slot that still has remaining > 0
  const unfilledPositions: string[] = [];
  for (const [pos, count] of Object.entries(remaining)) {
    if (count > 0) {
      // Add the position name once per unfilled slot
      for (let i = 0; i < count; i++) {
        unfilledPositions.push(pos);
      }
    }
  }

  return { filledSlots: filled, unfilledPositions, benchCount };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate how well incoming trade players fit a team's roster.
 *
 * @param currentRoster - The team's roster BEFORE the trade.
 * @param playersIn     - Players the team is receiving in the trade.
 * @param playersOut    - Players the team is giving up in the trade.
 * @param settings      - League settings (position-slot requirements).
 * @returns A {@link RosterFitResult} with a 0-100 score and detailed notes.
 */
export function evaluateRosterFit(
  currentRoster: Player[],
  playersIn: Player[],
  playersOut: Player[],
  settings: LeagueSettings,
): RosterFitResult {
  const positionSlots = getSlots(settings);
  const notes: string[] = [];

  // Build post-trade roster
  const outIds = new Set(playersOut.map((p) => p.id));
  const postTradeRoster = currentRoster
    .filter((p) => !outIds.has(p.id))
    .concat(playersIn);

  // Compute slot assignments before and after the trade
  const beforeAssignment = assignPlayersToSlots(currentRoster, positionSlots);
  const afterAssignment = assignPlayersToSlots(postTradeRoster, positionSlots);

  // ------------------------------------------------------------------
  // 1. Positional need (0-40 points)
  //    How many previously unfilled slots are now filled?
  // ------------------------------------------------------------------
  const beforeUnfilledSet = new Set(beforeAssignment.unfilledPositions);
  const afterUnfilled = afterAssignment.unfilledPositions;

  // Positions that were unfilled before but are now filled
  const positionsFilled: string[] = [];
  const afterUnfilledCopy = [...afterUnfilled];
  for (const pos of beforeAssignment.unfilledPositions) {
    const idx = afterUnfilledCopy.indexOf(pos);
    if (idx === -1) {
      // This position was unfilled before and IS now filled
      positionsFilled.push(pos);
    } else {
      // Still unfilled; remove from copy so we don't double-count
      afterUnfilledCopy.splice(idx, 1);
    }
  }

  // Positions that were filled but are now lost
  const positionsLost: string[] = [];
  const beforeUnfilledCopy = [...beforeAssignment.unfilledPositions];
  for (const pos of afterUnfilled) {
    const idx = beforeUnfilledCopy.indexOf(pos);
    if (idx === -1) {
      positionsLost.push(pos);
    } else {
      beforeUnfilledCopy.splice(idx, 1);
    }
  }

  const totalSlotCount = Object.values(positionSlots).reduce((a, b) => a + b, 0);
  const positionalNeedScore =
    totalSlotCount > 0
      ? Math.min(40, (positionsFilled.length / Math.max(1, beforeAssignment.unfilledPositions.length)) * 40)
      : 20; // No slot info => neutral score

  if (positionsFilled.length > 0) {
    notes.push(`Fills positional need: ${positionsFilled.join(', ')}`);
  }
  if (positionsLost.length > 0) {
    notes.push(`Loses coverage at: ${positionsLost.join(', ')}`);
  }

  // ------------------------------------------------------------------
  // 2. Multi-eligibility bonus (0-20 points)
  //    Players eligible at 3+ positions are more flexible.
  // ------------------------------------------------------------------
  let multiEligibilityBonus = 0;
  for (const player of playersIn) {
    const numPositions = player.positions.length;
    if (numPositions >= 4) {
      multiEligibilityBonus += 8;
    } else if (numPositions >= 3) {
      multiEligibilityBonus += 5;
    } else if (numPositions >= 2) {
      multiEligibilityBonus += 3;
    }
  }
  multiEligibilityBonus = Math.min(20, multiEligibilityBonus);

  if (multiEligibilityBonus >= 10) {
    notes.push('Strong multi-position eligibility in incoming players');
  }

  // ------------------------------------------------------------------
  // 3. Slot coverage (0-25 points)
  //    Percentage of required slots that are covered after the trade.
  // ------------------------------------------------------------------
  const coveredSlots = totalSlotCount - afterUnfilled.length;
  const slotCoverageScore =
    totalSlotCount > 0
      ? (coveredSlots / totalSlotCount) * 25
      : 12.5;

  if (afterUnfilled.length > 0) {
    notes.push(`Unfilled slots after trade: ${afterUnfilled.join(', ')}`);
  } else {
    notes.push('All required position slots are filled after trade');
  }

  // ------------------------------------------------------------------
  // 4. Bench depth (0-15 points)
  //    Having 1-3 bench players is ideal. 0 is risky, >4 is wasteful.
  // ------------------------------------------------------------------
  const benchRequired = positionSlots['Bench'] ?? 2;
  let benchScore: number;
  if (afterAssignment.benchCount >= benchRequired) {
    benchScore = 15; // Full bench
  } else if (afterAssignment.benchCount > 0) {
    benchScore = (afterAssignment.benchCount / benchRequired) * 15;
  } else {
    benchScore = 0;
    notes.push('WARNING: No bench depth after trade');
  }

  // ------------------------------------------------------------------
  // Aggregate score (0-100)
  // ------------------------------------------------------------------
  const rawScore = positionalNeedScore + multiEligibilityBonus + slotCoverageScore + benchScore;
  const score = Math.round(Math.min(100, Math.max(0, rawScore)));

  return {
    score,
    positionsFilled,
    positionsLost,
    multiEligibilityBonus: Math.round(multiEligibilityBonus),
    unfilledSlots: afterUnfilled,
    notes,
  };
}
