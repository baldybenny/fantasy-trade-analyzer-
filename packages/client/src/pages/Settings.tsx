import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import type { LeagueSettings, CategoryConfig } from '@fta/shared';
import { DEFAULT_LEAGUE_SETTINGS } from '@fta/shared';

function CategoryEditor({
  categories,
  onChange,
  label,
}: {
  categories: CategoryConfig[];
  onChange: (cats: CategoryConfig[]) => void;
  label: string;
}) {
  return (
    <div>
      <h4 className="text-sm font-medium text-gray-400 mb-2">{label}</h4>
      <div className="space-y-2">
        {categories.map((cat, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <input
              value={cat.name}
              onChange={(e) => {
                const updated = [...categories];
                updated[idx] = { ...cat, name: e.target.value };
                onChange(updated);
              }}
              className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200"
            />
            <label className="text-xs text-gray-500">Weight:</label>
            <input
              type="number"
              step="0.5"
              value={cat.weight}
              onChange={(e) => {
                const updated = [...categories];
                updated[idx] = { ...cat, weight: Number(e.target.value) };
                onChange(updated);
              }}
              className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200"
            />
            <label className="flex items-center gap-1 text-xs text-gray-500">
              <input
                type="checkbox"
                checked={cat.inverse}
                onChange={(e) => {
                  const updated = [...categories];
                  updated[idx] = { ...cat, inverse: e.target.checked };
                  onChange(updated);
                }}
                className="rounded bg-gray-700 border-gray-600"
              />
              Inverse
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Settings() {
  const queryClient = useQueryClient();
  const { data: savedSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
  });

  const [settings, setSettings] = useState<LeagueSettings>(DEFAULT_LEAGUE_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (savedSettings) {
      setSettings({ ...DEFAULT_LEAGUE_SETTINGS, ...savedSettings });
    }
  }, [savedSettings]);

  const saveMutation = useMutation({
    mutationFn: api.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const recalcMutation = useMutation({
    mutationFn: api.calculateValues,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">League Settings</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setSettings(DEFAULT_LEAGUE_SETTINGS)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors"
          >
            Reset to Defaults
          </button>
          <button
            onClick={() => saveMutation.mutate(settings)}
            disabled={saveMutation.isPending}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
          >
            {saveMutation.isPending ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Basic info */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">League Info</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500">League Name</label>
              <input
                value={settings.name}
                onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">League ID</label>
              <input
                value={settings.leagueId}
                onChange={(e) => setSettings({ ...settings, leagueId: e.target.value })}
                className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Format</label>
              <select
                value={settings.format}
                onChange={(e) => setSettings({ ...settings, format: e.target.value as any })}
                className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200"
              >
                <option value="roto">Roto</option>
                <option value="h2h">Head-to-Head</option>
                <option value="points">Points</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Platform</label>
              <select
                value={settings.platform}
                onChange={(e) => setSettings({ ...settings, platform: e.target.value as any })}
                className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200"
              >
                <option value="fantrax">Fantrax</option>
                <option value="espn">ESPN</option>
                <option value="yahoo">Yahoo</option>
              </select>
            </div>
          </div>
        </div>

        {/* Budget */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Budget</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500">Total Budget ($)</label>
              <input
                type="number"
                value={settings.totalBudget}
                onChange={(e) => setSettings({ ...settings, totalBudget: Number(e.target.value) })}
                className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Roster Spots</label>
              <input
                type="number"
                value={settings.rosterSpots}
                onChange={(e) => setSettings({ ...settings, rosterSpots: Number(e.target.value) })}
                className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200"
              />
            </div>
          </div>
        </div>

        {/* Categories */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Categories</h3>
          <div className="grid grid-cols-2 gap-6">
            <CategoryEditor
              label="Hitting Categories"
              categories={settings.hittingCategories}
              onChange={(cats) => setSettings({ ...settings, hittingCategories: cats })}
            />
            <CategoryEditor
              label="Pitching Categories"
              categories={settings.pitchingCategories}
              onChange={(cats) => setSettings({ ...settings, pitchingCategories: cats })}
            />
          </div>
        </div>

        {/* SGP Multipliers */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">SGP Multipliers</h3>
          <div className="grid grid-cols-4 gap-3">
            {Object.entries(settings.sgpMultipliers).map(([key, val]) => (
              <div key={key}>
                <label className="text-xs text-gray-500">{key}</label>
                <input
                  type="number"
                  step="0.001"
                  value={val}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      sgpMultipliers: { ...settings.sgpMultipliers, [key]: Number(e.target.value) },
                    })
                  }
                  className="w-full mt-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200"
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => recalcMutation.mutate()}
            disabled={recalcMutation.isPending}
            className="mt-3 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors"
          >
            {recalcMutation.isPending ? 'Recalculating...' : 'Recalculate All Values'}
          </button>
        </div>

        {/* Keeper settings */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Keeper Rules</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500">Initial Contract Years</label>
              <input
                type="number"
                value={settings.initialContractYears}
                onChange={(e) => setSettings({ ...settings, initialContractYears: Number(e.target.value) })}
                className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Extension Cost Per Year ($)</label>
              <input
                type="number"
                value={settings.extensionCostPerYear}
                onChange={(e) => setSettings({ ...settings, extensionCostPerYear: Number(e.target.value) })}
                className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
