import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

function rankColor(rank: number, total: number): string {
  const pct = ((total - rank + 1) / total) * 100;
  if (pct >= 75) return 'text-green-400';
  if (pct >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

function cellBg(rank: number, total: number): string {
  const pct = ((total - rank + 1) / total) * 100;
  if (pct >= 75) return 'bg-green-900/20';
  if (pct >= 40) return 'bg-yellow-900/10';
  return 'bg-red-900/10';
}

export default function Standings() {
  const { data: standings, isLoading } = useQuery({
    queryKey: ['standings'],
    queryFn: api.getStandings,
  });

  const teamStandings = Array.isArray(standings) ? standings : standings?.teamStandings ?? [];
  const sorted = [...teamStandings].sort((a: any, b: any) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0));
  const numTeams = sorted.length;

  // Collect all category names
  const categories: string[] = (sorted[0]?.categoryStandings ?? sorted[0]?.standings ?? []).map((s: any) => s.category);

  if (isLoading) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-white mb-6">Standings</h2>
        <div className="text-gray-500">Loading standings...</div>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-white mb-6">Standings</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center text-gray-500">
          No standings data yet. Import projections and rosters to calculate standings.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Standings</h2>

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b border-gray-800">
              <th className="text-left py-3 px-3 sticky left-0 bg-gray-900">Rank</th>
              <th className="text-left py-3 px-3 sticky left-12 bg-gray-900">Team</th>
              <th className="text-right py-3 px-3">Pts</th>
              {categories.map((cat) => (
                <th key={cat} className="text-right py-3 px-3 min-w-[70px]">{cat}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((team: any, idx: number) => {
              const standingsMap: Record<string, any> = {};
              (team.categoryStandings ?? team.standings ?? []).forEach((s: any) => { standingsMap[s.category] = s; });

              return (
                <tr key={team.id ?? team.teamId} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-2 px-3 text-gray-400 sticky left-0 bg-gray-900">{idx + 1}</td>
                  <td className="py-2 px-3 font-medium text-gray-200 sticky left-12 bg-gray-900">
                    {team.name ?? team.teamName}
                  </td>
                  <td className="text-right py-2 px-3 font-medium text-white">
                    {(team.totalPoints ?? 0).toFixed(1)}
                  </td>
                  {categories.map((cat) => {
                    const cs = standingsMap[cat];
                    if (!cs) return <td key={cat} className="text-right py-2 px-3 text-gray-600">—</td>;
                    return (
                      <td key={cat} className={`text-right py-2 px-3 ${cellBg(cs.rank, numTeams)}`}>
                        <div className={`font-medium ${rankColor(cs.rank, numTeams)}`}>
                          {typeof cs.value === 'number' ? (
                            cs.value % 1 === 0 ? cs.value : cs.value.toFixed(3)
                          ) : '—'}
                        </div>
                        <div className="text-xs text-gray-500">#{cs.rank}</div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
