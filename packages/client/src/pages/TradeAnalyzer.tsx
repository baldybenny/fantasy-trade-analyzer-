import { useState, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTradeStore } from '../stores/trade-store.js';
import { api } from '../lib/api.js';
import type { Player, TradeAnalysis, CategoryImpact } from '@fta/shared';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer, Legend,
} from 'recharts';

function PlayerPicker({
  teamId,
  onSelect,
  selectedIds,
}: {
  teamId: number | null;
  onSelect: (player: Player) => void;
  selectedIds: number[];
}) {
  const [search, setSearch] = useState('');
  const { data: team } = useQuery({
    queryKey: ['teams', teamId],
    queryFn: () => api.getTeam(teamId!),
    enabled: teamId !== null,
  });

  const roster: Player[] = team?.roster ?? [];
  const filtered = roster.filter(
    (p: Player) =>
      !selectedIds.includes(p.id) &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <input
        type="text"
        placeholder="Search roster..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />
      {search.length > 0 && (
        <div className="mt-1 max-h-48 overflow-y-auto bg-gray-800 border border-gray-700 rounded">
          {filtered.map((p: Player) => (
            <button
              key={p.id}
              onClick={() => {
                onSelect(p);
                setSearch('');
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 flex justify-between items-center"
            >
              <span className="text-gray-200">{p.name}</span>
              <span className="text-gray-500 text-xs">
                {p.positions?.join('/') ?? ''} — ${p.auctionValue?.toFixed(0) ?? '?'}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500">No players found</div>
          )}
        </div>
      )}
    </div>
  );
}

function PlayerChip({ player, onRemove }: { player: Player; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded px-3 py-2">
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-200">{player.name}</div>
        <div className="text-xs text-gray-500">
          {player.positions?.join('/') ?? ''} — ${player.auctionValue?.toFixed(0) ?? '?'}
          {player.contract && ` ($${player.contract.salary})`}
        </div>
      </div>
      <button onClick={onRemove} className="text-gray-500 hover:text-red-400 text-lg leading-none">
        ×
      </button>
    </div>
  );
}

function FairnessGauge({ score }: { score: number }) {
  const pct = Math.round(score);
  const color =
    pct >= 40 && pct <= 60 ? 'text-green-400' :
    pct >= 25 && pct <= 75 ? 'text-yellow-400' :
    'text-red-400';
  const label =
    pct >= 40 && pct <= 60 ? 'Fair Trade' :
    pct >= 25 && pct <= 75 ? 'Slightly Uneven' :
    'Lopsided';

  return (
    <div className="text-center">
      <div className={`text-4xl font-bold ${color}`}>{pct}</div>
      <div className="text-sm text-gray-400 mt-1">{label}</div>
      <div className="w-full bg-gray-800 rounded-full h-2 mt-3">
        <div
          className={`h-2 rounded-full ${
            pct >= 40 && pct <= 60 ? 'bg-green-500' :
            pct >= 25 && pct <= 75 ? 'bg-yellow-500' :
            'bg-red-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-600 mt-1">
        <span>Team B wins</span>
        <span>Fair</span>
        <span>Team A wins</span>
      </div>
    </div>
  );
}

function CategoryImpactChart({ impacts, label }: { impacts: CategoryImpact[]; label: string }) {
  const data = impacts.map((imp) => ({
    category: imp.category,
    change: imp.rankChange,
    fill: imp.rankChange > 0 ? '#22c55e' : imp.rankChange < 0 ? '#ef4444' : '#6b7280',
  }));

  return (
    <div>
      <h4 className="text-sm font-medium text-gray-400 mb-2">{label} — Rank Change</h4>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 12 }} />
          <YAxis dataKey="category" type="category" stroke="#9ca3af" tick={{ fontSize: 12 }} width={50} />
          <Tooltip
            contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6 }}
            labelStyle={{ color: '#e5e7eb' }}
          />
          <Bar dataKey="change" name="Rank Change">
            {data.map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SurplusComparison({ analysis }: { analysis: TradeAnalysis }) {
  const data = [
    { side: 'Team A Gives', value: analysis.sideA.valueOut, salary: analysis.sideA.salaryOut },
    { side: 'Team A Gets', value: analysis.sideA.valueIn, salary: analysis.sideA.salaryIn },
    { side: 'Team B Gives', value: analysis.sideB.valueOut, salary: analysis.sideB.salaryOut },
    { side: 'Team B Gets', value: analysis.sideB.valueIn, salary: analysis.sideB.salaryIn },
  ];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="side" stroke="#9ca3af" tick={{ fontSize: 11 }} />
        <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} />
        <Tooltip
          contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6 }}
        />
        <Legend />
        <Bar dataKey="value" name="Auction Value ($)" fill="#3b82f6" />
        <Bar dataKey="salary" name="Salary ($)" fill="#8b5cf6" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function AnalysisResults({ analysis }: { analysis: TradeAnalysis }) {
  return (
    <div className="space-y-6 mt-6">
      {/* Fairness + Value Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Fairness Score</h3>
          <FairnessGauge score={analysis.fairnessScore} />
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 col-span-2">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Value Comparison</h3>
          <SurplusComparison analysis={analysis} />
        </div>
      </div>

      {/* Category Impact Charts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <CategoryImpactChart
            impacts={analysis.sideA.categoryImpacts}
            label={analysis.sideA.teamName}
          />
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <CategoryImpactChart
            impacts={analysis.sideB.categoryImpacts}
            label={analysis.sideB.teamName}
          />
        </div>
      </div>

      {/* Category Impact Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Category Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="text-left py-2 px-2">Category</th>
                <th className="text-right py-2 px-2">{analysis.sideA.teamName} Before</th>
                <th className="text-right py-2 px-2">{analysis.sideA.teamName} After</th>
                <th className="text-right py-2 px-2">Change</th>
                <th className="text-right py-2 px-2">{analysis.sideB.teamName} Before</th>
                <th className="text-right py-2 px-2">{analysis.sideB.teamName} After</th>
                <th className="text-right py-2 px-2">Change</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(analysis.categorySummary).map(([cat, data]) => (
                <tr key={cat} className="border-b border-gray-800/50">
                  <td className="py-2 px-2 font-medium text-gray-300">{cat}</td>
                  <td className="text-right py-2 px-2 text-gray-400">
                    {data.teamA.before.toFixed(1)} (#{data.teamA.rankBefore})
                  </td>
                  <td className="text-right py-2 px-2 text-gray-300">
                    {data.teamA.after.toFixed(1)} (#{data.teamA.rankAfter})
                  </td>
                  <td className={`text-right py-2 px-2 ${data.teamA.rankChange > 0 ? 'text-green-400' : data.teamA.rankChange < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                    {data.teamA.rankChange > 0 ? '+' : ''}{data.teamA.rankChange}
                  </td>
                  <td className="text-right py-2 px-2 text-gray-400">
                    {data.teamB.before.toFixed(1)} (#{data.teamB.rankBefore})
                  </td>
                  <td className="text-right py-2 px-2 text-gray-300">
                    {data.teamB.after.toFixed(1)} (#{data.teamB.rankAfter})
                  </td>
                  <td className={`text-right py-2 px-2 ${data.teamB.rankChange > 0 ? 'text-green-400' : data.teamB.rankChange < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                    {data.teamB.rankChange > 0 ? '+' : ''}{data.teamB.rankChange}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Roster Fit */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-2">
            Roster Fit — {analysis.sideA.teamName}
          </h3>
          <div className="text-2xl font-bold text-gray-200">{analysis.rosterFitA.score}/100</div>
          {analysis.rosterFitA.notes.map((n, i) => (
            <div key={i} className="text-xs text-gray-500 mt-1">• {n}</div>
          ))}
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-2">
            Roster Fit — {analysis.sideB.teamName}
          </h3>
          <div className="text-2xl font-bold text-gray-200">{analysis.rosterFitB.score}/100</div>
          {analysis.rosterFitB.notes.map((n, i) => (
            <div key={i} className="text-xs text-gray-500 mt-1">• {n}</div>
          ))}
        </div>
      </div>

      {/* Warnings + Recommendation */}
      {analysis.warnings.length > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-yellow-400 mb-2">Warnings</h3>
          {analysis.warnings.map((w, i) => (
            <div key={i} className="text-sm text-yellow-300/80">• {w}</div>
          ))}
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-2">Recommendation</h3>
        <p className="text-gray-300">{analysis.recommendation}</p>
      </div>
    </div>
  );
}

export default function TradeAnalyzer() {
  const store = useTradeStore();
  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: api.getTeams });

  const analyzeMutation = useMutation({
    mutationFn: api.analyzeTrade,
    onSuccess: (data) => store.setAnalysis(data),
    onSettled: () => store.setIsAnalyzing(false),
  });

  const handleAnalyze = useCallback(() => {
    if (!store.sideA.teamId || !store.sideB.teamId) return;
    if (store.sideA.players.length === 0 || store.sideB.players.length === 0) return;

    store.setIsAnalyzing(true);
    analyzeMutation.mutate({
      teamAId: store.sideA.teamId,
      teamBId: store.sideB.teamId,
      teamAGives: store.sideA.players.map((p) => p.id),
      teamBGives: store.sideB.players.map((p) => p.id),
    });
  }, [store.sideA, store.sideB]);

  const canAnalyze =
    store.sideA.teamId !== null &&
    store.sideB.teamId !== null &&
    store.sideA.players.length > 0 &&
    store.sideB.players.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Trade Analyzer</h2>
        <button onClick={store.reset} className="text-sm text-gray-400 hover:text-gray-200">
          Reset
        </button>
      </div>

      {/* Trade Builder */}
      <div className="grid grid-cols-2 gap-6">
        {/* Side A */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <label className="block text-sm font-medium text-gray-400 mb-2">Team A</label>
          <select
            value={store.sideA.teamId ?? ''}
            onChange={(e) => store.setTeamA(Number(e.target.value))}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 focus:outline-none focus:border-blue-500"
          >
            <option value="">Select team...</option>
            {teams.map((t: any) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          <div className="mt-3">
            <label className="block text-xs text-gray-500 mb-1">Team A gives:</label>
            <PlayerPicker
              teamId={store.sideA.teamId}
              onSelect={store.addPlayerToA}
              selectedIds={store.sideA.players.map((p) => p.id)}
            />
            <div className="mt-2 space-y-1">
              {store.sideA.players.map((p) => (
                <PlayerChip key={p.id} player={p} onRemove={() => store.removePlayerFromA(p.id)} />
              ))}
            </div>
          </div>
        </div>

        {/* Side B */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <label className="block text-sm font-medium text-gray-400 mb-2">Team B</label>
          <select
            value={store.sideB.teamId ?? ''}
            onChange={(e) => store.setTeamB(Number(e.target.value))}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 focus:outline-none focus:border-blue-500"
          >
            <option value="">Select team...</option>
            {teams.map((t: any) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          <div className="mt-3">
            <label className="block text-xs text-gray-500 mb-1">Team B gives:</label>
            <PlayerPicker
              teamId={store.sideB.teamId}
              onSelect={store.addPlayerToB}
              selectedIds={store.sideB.players.map((p) => p.id)}
            />
            <div className="mt-2 space-y-1">
              {store.sideB.players.map((p) => (
                <PlayerChip key={p.id} player={p} onRemove={() => store.removePlayerFromB(p.id)} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Analyze Button */}
      <div className="mt-4 flex justify-center">
        <button
          onClick={handleAnalyze}
          disabled={!canAnalyze || store.isAnalyzing}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
        >
          {store.isAnalyzing ? 'Analyzing...' : 'Analyze Trade'}
        </button>
      </div>

      {/* Error */}
      {analyzeMutation.isError && (
        <div className="mt-4 p-3 bg-red-900/20 border border-red-800/50 rounded text-sm text-red-400">
          {(analyzeMutation.error as Error).message}
        </div>
      )}

      {/* Results */}
      {store.analysis && <AnalysisResults analysis={store.analysis} />}
    </div>
  );
}
