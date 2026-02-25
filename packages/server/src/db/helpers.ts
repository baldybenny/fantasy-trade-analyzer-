import type { Player, PlayerStats, Position, RosterStatus } from '@fta/shared';

export function dbRowToPlayer(row: any): Player {
  return {
    id: row.id,
    mlbamId: row.mlbamId ?? undefined,
    name: row.name,
    team: row.team,
    positions: typeof row.positions === 'string' ? JSON.parse(row.positions) : (row.positions ?? []),
    bats: row.bats ?? undefined,
    throws: row.throws ?? undefined,
    birthDate: row.birthDate ?? undefined,
    fantasyTeamId: row.fantasyTeamId ?? undefined,
    rosterStatus: (row.rosterStatus ?? 'FA') as RosterStatus,
    contract: row.contractSalary != null ? {
      salary: row.contractSalary,
      yearsRemaining: row.contractYears ?? 1,
      isKeeper: !!row.isKeeper,
      extensionYear: 0,
      guaranteed: true,
      droppable: true,
    } : undefined,
    currentSeason: row.currentStats ? (typeof row.currentStats === 'string' ? JSON.parse(row.currentStats) : row.currentStats) : undefined,
    rosProjection: row.rosProjection ? (typeof row.rosProjection === 'string' ? JSON.parse(row.rosProjection) : row.rosProjection) : undefined,
    auctionValue: row.auctionValue ?? undefined,
    inflatedValue: row.inflatedValue ?? undefined,
    vorp: row.vorp ?? undefined,
    sgpValue: row.sgpValue ?? undefined,
  };
}
