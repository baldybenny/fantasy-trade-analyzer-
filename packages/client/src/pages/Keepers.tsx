import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import type {
  InflationResult,
  PositionalScarcity,
  KeeperCandidate,
} from '@fta/shared';

function InflationCards({ inflation }: { inflation: InflationResult }) {
  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
        <div className="text-xs text-gray-500">Inflation Rate</div>
        <div className={`text-xl font-bold ${inflation.inflationPercentage > 0 ? 'text-red-400' : 'text-green-400'}`}>
          {inflation.inflationPercentage > 0 ? '+' : ''}{inflation.inflationPercentage}%
        </div>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
        <div className="text-xs text-gray-500">Remaining Budget</div>
        <div className="text-xl font-bold text-white">${inflation.remainingBudget}</div>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
        <div className="text-xs text-gray-500">Remaining Value</div>
        <div className="text-xl font-bold text-white">${inflation.remainingValue}</div>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
        <div className="text-xs text-gray-500">Keepers League-Wide</div>
        <div className="text-xl font-bold text-blue-400">{inflation.numKeepers}</div>
      </div>
    </div>
  );
}

function ScarcityPanel({ scarcity }: { scarcity: PositionalScarcity[] }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden mb-6">
      <div className="px-4 py-2 border-b border-gray-800">
        <h3 className="text-sm font-medium text-gray-400">Positional Scarcity</h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 border-b border-gray-800">
            <th className="text-left py-2 px-3">Position</th>
            <th className="text-right py-2 px-3">Players</th>
            <th className="text-right py-2 px-3">Avg Value</th>
            <th className="text-right py-2 px-3">Median</th>
            <th className="text-right py-2 px-3">Top Player</th>
            <th className="text-right py-2 px-3">Replacement</th>
            <th className="text-right py-2 px-3">Multiplier</th>
            <th className="text-center py-2 px-3">Tier</th>
          </tr>
        </thead>
        <tbody>
          {scarcity.map((s) => (
            <tr key={s.position} className="border-b border-gray-800/50 hover:bg-gray-800/30">
              <td className="py-2 px-3 text-gray-200 font-medium">{s.position}</td>
              <td className="text-right py-2 px-3 text-gray-400">{s.playerCount}</td>
              <td className="text-right py-2 px-3 text-gray-300">${s.avgValue}</td>
              <td className="text-right py-2 px-3 text-gray-400">${s.medianValue}</td>
              <td className="text-right py-2 px-3 text-gray-300">${s.topPlayerValue}</td>
              <td className="text-right py-2 px-3 text-gray-500">${s.replacementValue}</td>
              <td className="text-right py-2 px-3 text-gray-300">{s.scarcityMultiplier}x</td>
              <td className="text-center py-2 px-3">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                  s.tier === 'scarce' ? 'bg-red-500/20 text-red-400' :
                  s.tier === 'deep' ? 'bg-green-500/20 text-green-400' :
                  'bg-gray-700 text-gray-400'
                }`}>
                  {s.tier}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KeeperRow({ candidate }: { candidate: KeeperCandidate }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="py-2 px-3 text-gray-500 text-xs">
          {expanded ? '▼' : '▶'}
        </td>
        <td className="py-2 px-3 text-gray-200 font-medium">{candidate.playerName}</td>
        <td className="py-2 px-3 text-gray-400 text-xs">{candidate.position}</td>
        <td className="text-right py-2 px-3 text-gray-400">${candidate.salary}</td>
        <td className="text-right py-2 px-3 text-gray-300">${candidate.auctionValue.toFixed(1)}</td>
        <td className="text-right py-2 px-3 text-gray-300">${candidate.inflatedValue.toFixed(1)}</td>
        <td className={`text-right py-2 px-3 ${candidate.vorp > 0 ? 'text-blue-400' : 'text-gray-500'}`}>
          {candidate.vorp.toFixed(1)}
        </td>
        <td className={`text-right py-2 px-3 ${
          candidate.surplusValue > 0 ? 'text-green-400' : 'text-red-400'
        }`}>
          ${candidate.surplusValue.toFixed(1)}
        </td>
        <td className={`text-right py-2 px-3 ${
          candidate.inflatedSurplus > 0 ? 'text-green-400' : 'text-red-400'
        }`}>
          ${candidate.inflatedSurplus.toFixed(1)}
        </td>
        <td className="py-2 px-3 text-gray-400 text-xs text-center">
          {candidate.contractStatus
            ? `${candidate.contractStatus} (${candidate.yearsRemaining}yr)`
            : `${candidate.yearsRemaining}yr`}
        </td>
        <td className="text-center py-2 px-3">
          {candidate.keepRecommendation ? (
            <span className="text-green-400 font-bold">Y</span>
          ) : (
            <span className="text-red-400">N</span>
          )}
        </td>
      </tr>
      {expanded && candidate.multiYearProjection.length > 0 && (
        <tr className="border-b border-gray-800/50">
          <td colSpan={11} className="py-0">
            <div className="bg-gray-800/50 px-8 py-2">
              <div className="text-xs text-gray-500 mb-1">Multi-Year Projection</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500">
                    <th className="text-left py-1">Year</th>
                    <th className="text-right py-1">Proj. Salary</th>
                    <th className="text-right py-1">Proj. Value</th>
                    <th className="text-right py-1">Surplus</th>
                    <th className="text-center py-1">Keep?</th>
                  </tr>
                </thead>
                <tbody>
                  {candidate.multiYearProjection.map((yr) => (
                    <tr key={yr.year} className="text-gray-400">
                      <td className="py-1">Year {yr.year}</td>
                      <td className="text-right py-1">${yr.projectedSalary}</td>
                      <td className="text-right py-1">${yr.projectedValue}</td>
                      <td className={`text-right py-1 ${
                        yr.surplusValue > 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        ${yr.surplusValue}
                      </td>
                      <td className="text-center py-1">
                        {yr.keepRecommendation ? (
                          <span className="text-green-400">Y</span>
                        ) : (
                          <span className="text-red-400">N</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function Keepers() {
  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: api.getTeams });
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

  const { data: analysis, isLoading } = useQuery({
    queryKey: ['keeper-analysis', selectedTeamId],
    queryFn: () => api.getKeeperAnalysis(selectedTeamId ?? undefined),
  });

  const inflation: InflationResult | undefined = analysis?.inflation;
  const scarcity: PositionalScarcity[] = analysis?.scarcity ?? [];
  const candidates: KeeperCandidate[] = analysis?.candidates ?? [];

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Keeper Analysis</h2>

      {isLoading && !analysis && (
        <div className="text-gray-500">Loading keeper analysis...</div>
      )}

      {/* Inflation Summary */}
      {inflation && <InflationCards inflation={inflation} />}

      {/* Positional Scarcity */}
      {scarcity.length > 0 && <ScarcityPanel scarcity={scarcity} />}

      {/* Team Selector */}
      <div className="mb-4">
        <select
          value={selectedTeamId ?? ''}
          onChange={(e) => setSelectedTeamId(e.target.value ? Number(e.target.value) : null)}
          className="px-4 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 focus:outline-none focus:border-blue-500"
        >
          <option value="">All teams</option>
          {teams.map((t: any) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Keeper Rankings Table */}
      {candidates.length > 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-800">
            <h3 className="text-sm font-medium text-gray-400">
              Keeper Candidates ({candidates.length})
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="py-2 px-3 w-6"></th>
                <th className="text-left py-2 px-3">Name</th>
                <th className="text-left py-2 px-3">Pos</th>
                <th className="text-right py-2 px-3">Salary</th>
                <th className="text-right py-2 px-3">Value</th>
                <th className="text-right py-2 px-3">Inflated</th>
                <th className="text-right py-2 px-3">VORP</th>
                <th className="text-right py-2 px-3">Surplus</th>
                <th className="text-right py-2 px-3">Infl. Surplus</th>
                <th className="text-center py-2 px-3">Contract</th>
                <th className="text-center py-2 px-3">Keep?</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <KeeperRow key={c.playerId} candidate={c} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !isLoading && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center text-gray-500">
            {inflation
              ? 'No keeper candidates found. Make sure auction values have been calculated.'
              : 'Loading...'}
          </div>
        )
      )}
    </div>
  );
}
