import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-white mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function CategoryBar({ name, rank, total, isInverse }: { name: string; rank: number; total: number; isInverse: boolean }) {
  const pct = ((total - rank + 1) / total) * 100;
  const color =
    pct >= 75 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-400 w-12">{name}</span>
      <div className="flex-1 bg-gray-800 rounded-full h-2">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm text-gray-400 w-8 text-right">#{rank}</span>
    </div>
  );
}

export default function Dashboard() {
  const { data: standings, isLoading: standingsLoading } = useQuery({
    queryKey: ['standings'],
    queryFn: api.getStandings,
  });
  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: api.getTeams });

  const teamStandings = Array.isArray(standings) ? standings : standings?.teamStandings ?? [];
  const numTeams = teamStandings.length || 14;

  // Find "my" team (first team or highest ranked)
  const myTeam = teamStandings[0];
  const myStandings = myTeam?.categoryStandings ?? myTeam?.standings ?? [];

  const strongest = [...myStandings].sort((a: any, b: any) => a.rank - b.rank).slice(0, 3);
  const weakest = [...myStandings].sort((a: any, b: any) => b.rank - a.rank).slice(0, 3);

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Dashboard</h2>

      {/* Status cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Teams" value={String(teams.length || '—')} sub="Loaded in system" />
        <StatCard
          label="Your Rank"
          value={myTeam ? `#${myTeam.rank}` : '—'}
          sub={myTeam ? `${myTeam.totalPoints?.toFixed(1)} pts` : 'Import data to begin'}
        />
        <StatCard
          label="Strongest"
          value={strongest[0]?.category ?? '—'}
          sub={strongest[0] ? `Rank #${strongest[0].rank}` : ''}
        />
        <StatCard
          label="Weakest"
          value={weakest[0]?.category ?? '—'}
          sub={weakest[0] ? `Rank #${weakest[0].rank}` : ''}
        />
      </div>

      {/* Category overview */}
      {myStandings.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Category Rankings</h3>
          <div className="space-y-2">
            {myStandings.map((cs: any) => (
              <CategoryBar key={cs.category} name={cs.category} rank={cs.rank} total={numTeams} isInverse={false} />
            ))}
          </div>
        </div>
      )}

      {/* Getting started */}
      {teams.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center">
          <h3 className="text-lg font-medium text-gray-300 mb-2">Getting Started</h3>
          <p className="text-gray-500 text-sm mb-4">
            Import your league data to begin analyzing trades.
          </p>
          <div className="space-y-2 text-sm text-gray-400">
            <div>1. Go to <span className="text-blue-400">Data Import</span> and upload projection CSVs (Steamer/ZiPS)</div>
            <div>2. Import your Fantrax roster export</div>
            <div>3. Configure league settings if needed</div>
            <div>4. Start analyzing trades!</div>
          </div>
        </div>
      )}

      {/* Data freshness */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Data Status</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${teams.length > 0 ? 'bg-green-500' : 'bg-gray-600'}`} />
            <span className="text-gray-400">Rosters</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${standingsLoading ? 'bg-yellow-500' : teamStandings.length > 0 ? 'bg-green-500' : 'bg-gray-600'}`} />
            <span className="text-gray-400">Projections</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gray-600" />
            <span className="text-gray-400">Statcast</span>
          </div>
        </div>
      </div>
    </div>
  );
}
