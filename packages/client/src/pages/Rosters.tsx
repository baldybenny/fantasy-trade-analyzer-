import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import type { Player, PlayerStats } from '@fta/shared';
import { computeAvg, computeOps, computeEra, computeWhip } from '@fta/shared';

const HITTER_CATS = ['R', 'HR', 'RBI', 'SB', 'AVG', 'OPS'] as const;
const PITCHER_CATS = ['W', 'QS', 'SV', 'K', 'ERA', 'WHIP'] as const;
function getProjectedStat(stats: PlayerStats | undefined, cat: string): string {
  if (!stats) return '';
  switch (cat) {
    case 'R':    return Math.round(stats.runs).toString();
    case 'HR':   return Math.round(stats.hr).toString();
    case 'RBI':  return Math.round(stats.rbi).toString();
    case 'SB':   return Math.round(stats.sb).toString();
    case 'AVG':  { const v = computeAvg(stats); return v != null ? v.toFixed(3) : ''; }
    case 'OPS':  { const v = computeOps(stats); return v != null ? v.toFixed(3) : ''; }
    case 'W':    return Math.round(stats.wins).toString();
    case 'QS':   return Math.round(stats.qs).toString();
    case 'SV':   return Math.round(stats.saves).toString();
    case 'K':    return Math.round(stats.strikeouts).toString();
    case 'ERA':  { const v = computeEra(stats); return v != null ? v.toFixed(2) : ''; }
    case 'WHIP': { const v = computeWhip(stats); return v != null ? v.toFixed(2) : ''; }
    default:     return '';
  }
}

function PlayerRow({ player, categories }: { player: Player; categories: readonly string[] }) {
  const positions = player.positions?.join('/') ?? '';
  const value = player.auctionValue?.toFixed(1) ?? '—';
  const inflated = player.inflatedValue?.toFixed(1) ?? '—';
  const salary = player.contract?.salary;
  const surplus = player.inflatedValue != null && salary != null
    ? (player.inflatedValue - salary).toFixed(1)
    : player.auctionValue != null && salary != null
      ? (player.auctionValue - salary).toFixed(1)
      : '—';
  const vorp = player.vorp != null ? player.vorp.toFixed(1) : '—';

  return (
    <tr className="border-b border-gray-800/50 hover:bg-gray-800/30">
      <td className="py-2 px-3 text-gray-200 font-medium">{player.name}</td>
      <td className="py-2 px-3 text-gray-400 text-xs">{positions}</td>
      <td className="py-2 px-3 text-gray-400">{player.team}</td>
      <td className="text-right py-2 px-3 text-gray-300">${value}</td>
      <td className="text-right py-2 px-3 text-yellow-400">${inflated}</td>
      <td className={`text-right py-2 px-3 ${
        Number(vorp) > 0 ? 'text-blue-400' : 'text-gray-500'
      }`}>
        {vorp}
      </td>
      <td className="text-right py-2 px-3 text-gray-400">
        {salary != null ? `$${salary}` : '—'}
      </td>
      <td className={`text-right py-2 px-3 ${
        Number(surplus) > 0 ? 'text-green-400' :
        Number(surplus) < 0 ? 'text-red-400' :
        'text-gray-500'
      }`}>
        {surplus !== '—' ? `$${surplus}` : '—'}
      </td>
      {categories.map((cat) => {
        const sgp = player.categoryValues?.[cat];
        const proj = getProjectedStat(player.rosProjection, cat);
        const sgpStr = sgp != null ? sgp.toFixed(1) : '—';
        return (
          <td key={cat} className="text-right py-2 px-3 text-gray-400 text-xs whitespace-nowrap">
            {sgp != null ? <><span className="text-gray-200">{sgpStr}</span>{proj ? ` (${proj})` : ''}</> : '—'}
          </td>
        );
      })}
      <td className="py-2 px-3 text-gray-500 text-xs">{player.rosterStatus}</td>
    </tr>
  );
}

function makeCategoryHeaders(categories: readonly string[]) {
  return categories.map((cat) => (
    <th key={cat} className="text-right py-2 px-3">{cat}</th>
  ));
}

export default function Rosters() {
  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: api.getTeams });
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

  const { data: teamDetail, isLoading } = useQuery({
    queryKey: ['teams', selectedTeamId],
    queryFn: () => api.getTeam(selectedTeamId!),
    enabled: selectedTeamId !== null,
  });

  const roster: Player[] = teamDetail?.roster ?? [];
  const hitters = roster.filter((p) =>
    p.positions?.some((pos: string) => pos !== 'SP' && pos !== 'RP'),
  );
  const pitchers = roster.filter((p) =>
    p.positions?.some((pos: string) => pos === 'SP' || pos === 'RP'),
  );

  const baseHeaders = (
    <>
      <th className="text-left py-2 px-3">Name</th>
      <th className="text-left py-2 px-3">Pos</th>
      <th className="text-left py-2 px-3">Team</th>
      <th className="text-right py-2 px-3">Value</th>
      <th className="text-right py-2 px-3">Inflated</th>
      <th className="text-right py-2 px-3">VORP</th>
      <th className="text-right py-2 px-3">Salary</th>
      <th className="text-right py-2 px-3">Surplus</th>
    </>
  );

  const hitterHeaders = (
    <tr className="text-gray-500 border-b border-gray-800">
      {baseHeaders}
      {makeCategoryHeaders(HITTER_CATS)}
      <th className="py-2 px-3">Status</th>
    </tr>
  );

  const pitcherHeaders = (
    <tr className="text-gray-500 border-b border-gray-800">
      {baseHeaders}
      {makeCategoryHeaders(PITCHER_CATS)}
      <th className="py-2 px-3">Status</th>
    </tr>
  );

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Rosters</h2>

      <div className="mb-4">
        <select
          value={selectedTeamId ?? ''}
          onChange={(e) => setSelectedTeamId(e.target.value ? Number(e.target.value) : null)}
          className="px-4 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 focus:outline-none focus:border-blue-500"
        >
          <option value="">Select a team...</option>
          {teams.map((t: any) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {selectedTeamId === null && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center text-gray-500">
          Select a team to view their roster
        </div>
      )}

      {isLoading && <div className="text-gray-500">Loading roster...</div>}

      {teamDetail && (
        <div className="space-y-6">
          {/* Team summary */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-500">Roster Size</div>
              <div className="text-xl font-bold text-white">{roster.length}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-500">Budget</div>
              <div className="text-xl font-bold text-white">${teamDetail.totalBudget ?? 260}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-500">Spent</div>
              <div className="text-xl font-bold text-white">${teamDetail.spent ?? 0}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-500">Remaining</div>
              <div className="text-xl font-bold text-green-400">
                ${(teamDetail.totalBudget ?? 260) - (teamDetail.spent ?? 0)}
              </div>
            </div>
          </div>

          {/* Hitters table */}
          {hitters.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-x-auto">
              <div className="px-4 py-2 border-b border-gray-800">
                <h3 className="text-sm font-medium text-gray-400">Hitters ({hitters.length})</h3>
              </div>
              <table className="w-full text-sm">
                <thead>{hitterHeaders}</thead>
                <tbody>
                  {hitters.map((p) => <PlayerRow key={p.id} player={p} categories={HITTER_CATS} />)}
                </tbody>
              </table>
            </div>
          )}

          {/* Pitchers table */}
          {pitchers.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-x-auto">
              <div className="px-4 py-2 border-b border-gray-800">
                <h3 className="text-sm font-medium text-gray-400">Pitchers ({pitchers.length})</h3>
              </div>
              <table className="w-full text-sm">
                <thead>{pitcherHeaders}</thead>
                <tbody>
                  {pitchers.map((p) => <PlayerRow key={p.id} player={p} categories={PITCHER_CATS} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
