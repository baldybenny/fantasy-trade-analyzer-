import { useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';

type ImportType = 'batting' | 'pitching' | 'savant' | 'roster';
type ProjectionSource = 'steamer' | 'zips' | 'atc';

interface ImportStatus {
  type: string;
  source: string;
  status: 'idle' | 'importing' | 'success' | 'error';
  message: string;
  count?: number;
}

function FileDropZone({
  onFileContent,
  label,
  accept,
}: {
  onFileContent: (content: string, filename: string) => void;
  label: string;
  accept?: string;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);

  const handleFile = useCallback((file: File) => {
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      onFileContent(content, file.name);
    };
    reader.readAsText(file);
  }, [onFileContent]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
        isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 hover:border-gray-600'
      }`}
      onClick={() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept || '.csv';
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) handleFile(file);
        };
        input.click();
      }}
    >
      <div className="text-gray-400 text-sm">{label}</div>
      {filename && <div className="text-blue-400 text-xs mt-1">{filename}</div>}
    </div>
  );
}

function ImportCard({
  title,
  description,
  importType,
  source,
  onImport,
  status,
}: {
  title: string;
  description: string;
  importType: ImportType;
  source: string;
  onImport: (csvContent: string, type: ImportType, source: string) => void;
  status: ImportStatus | null;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [csvContent, setCsvContent] = useState<string | null>(null);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-300 mb-1">{title}</h3>
      <p className="text-xs text-gray-500 mb-3">{description}</p>

      <FileDropZone
        label="Drop CSV file here or click to browse"
        onFileContent={(content, filename) => {
          setCsvContent(content);
          // Show first 3 rows as preview
          const lines = content.split('\n').slice(0, 4);
          setPreview(lines.join('\n'));
        }}
      />

      {preview && (
        <div className="mt-2 bg-gray-800 rounded p-2 overflow-x-auto">
          <pre className="text-xs text-gray-400 whitespace-pre">{preview}</pre>
        </div>
      )}

      {csvContent && (
        <button
          onClick={() => onImport(csvContent, importType, source)}
          disabled={status?.status === 'importing'}
          className="mt-3 w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white text-sm rounded transition-colors"
        >
          {status?.status === 'importing' ? 'Importing...' : 'Import'}
        </button>
      )}

      {status?.status === 'success' && (
        <div className="mt-2 text-xs text-green-400">
          Imported {status.count} records successfully
        </div>
      )}
      {status?.status === 'error' && (
        <div className="mt-2 text-xs text-red-400">{status.message}</div>
      )}
    </div>
  );
}

function FetchCard({
  title,
  description,
  fetchKey,
  onFetch,
  status,
  disabled,
}: {
  title: string;
  description: string;
  fetchKey: string;
  onFetch: () => void;
  status: ImportStatus | null;
  disabled?: boolean;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-300 mb-1">{title}</h3>
      <p className="text-xs text-gray-500 mb-3">{description}</p>

      <button
        onClick={onFetch}
        disabled={disabled || status?.status === 'importing'}
        className="w-full px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded transition-colors"
      >
        {status?.status === 'importing' ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Fetching...
          </span>
        ) : (
          'Fetch'
        )}
      </button>

      {status?.status === 'success' && (
        <div className="mt-2 text-xs text-green-400">
          Fetched {status.count} records successfully
        </div>
      )}
      {status?.status === 'error' && (
        <div className="mt-2 text-xs text-red-400">{status.message}</div>
      )}
    </div>
  );
}

function FantraxCard() {
  const queryClient = useQueryClient();
  const [leagueId, setLeagueId] = useState('');
  const [cookie, setCookie] = useState('');

  const { data: status, isLoading } = useQuery({
    queryKey: ['fantrax-status'],
    queryFn: api.fantraxStatus,
  });

  const configureMutation = useMutation({
    mutationFn: () => api.fantraxConfigure(leagueId, cookie),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fantrax-status'] });
      setLeagueId('');
      setCookie('');
    },
  });

  const syncMutation = useMutation({
    mutationFn: api.fantraxSync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fantrax-status'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['players'] });
    },
  });

  const isConnected = status?.configured && status?.connected;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-300">Fantrax Connection</h3>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            isLoading ? 'bg-yellow-500' :
            isConnected ? 'bg-green-500' :
            status?.configured ? 'bg-red-500' :
            'bg-gray-600'
          }`} />
          <span className="text-xs text-gray-500">
            {isLoading ? 'Checking...' :
             isConnected ? `${status.leagueName} (${status.teamCount} teams)` :
             status?.configured ? 'Connection failed' :
             'Not configured'}
          </span>
        </div>
      </div>

      {/* Configure form (show when not connected) */}
      {!isConnected && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500">League ID</label>
            <input
              value={leagueId}
              onChange={(e) => setLeagueId(e.target.value)}
              placeholder="e.g. abc123def456"
              className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">FX_RM Cookie</label>
            <input
              type="password"
              value={cookie}
              onChange={(e) => setCookie(e.target.value)}
              placeholder="Paste FX_RM cookie value"
              className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={() => configureMutation.mutate()}
            disabled={!leagueId || !cookie || configureMutation.isPending}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded transition-colors"
          >
            {configureMutation.isPending ? 'Connecting...' : 'Connect'}
          </button>
          {configureMutation.isError && (
            <div className="text-xs text-red-400">
              {(configureMutation.error as Error).message}
            </div>
          )}
        </div>
      )}

      {/* Sync button (show when connected) */}
      {isConnected && (
        <div className="space-y-3">
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="w-full px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded transition-colors"
          >
            {syncMutation.isPending ? 'Syncing...' : 'Sync All Rosters'}
          </button>

          {syncMutation.isSuccess && syncMutation.data && (
            <div className="text-xs text-green-400 space-y-1">
              <div>Synced {syncMutation.data.teams?.total ?? 0} teams ({syncMutation.data.teams?.created ?? 0} new, {syncMutation.data.teams?.updated ?? 0} updated)</div>
              <div>Synced {syncMutation.data.players?.total ?? 0} players ({syncMutation.data.players?.created ?? 0} new, {syncMutation.data.players?.updated ?? 0} updated)</div>
            </div>
          )}

          {syncMutation.isError && (
            <div className="text-xs text-red-400">
              {(syncMutation.error as Error).message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const FETCH_ALL_STEPS = [
  { key: 'fetch-steamer-bat', fn: () => api.fetchProjections('steamer', 'bat') },
  { key: 'fetch-steamer-pit', fn: () => api.fetchProjections('steamer', 'pit') },
  { key: 'fetch-zips-bat', fn: () => api.fetchProjections('zips', 'bat') },
  { key: 'fetch-zips-pit', fn: () => api.fetchProjections('zips', 'pit') },
  { key: 'fetch-atc-bat', fn: () => api.fetchProjections('atc', 'bat') },
  { key: 'fetch-atc-pit', fn: () => api.fetchProjections('atc', 'pit') },
  { key: 'fetch-savant', fn: () => api.fetchSavant() },
] as const;

export default function DataImport() {
  const queryClient = useQueryClient();
  const [statuses, setStatuses] = useState<Record<string, ImportStatus>>({});
  const [fetchAllRunning, setFetchAllRunning] = useState(false);
  const [fetchAllError, setFetchAllError] = useState<string | null>(null);
  const [recalcStatus, setRecalcStatus] = useState<'idle' | 'calculating' | 'success' | 'error'>('idle');

  const { data: fantraxStatus } = useQuery({
    queryKey: ['fantrax-status'],
    queryFn: api.fantraxStatus,
  });

  const fantraxSynced = fantraxStatus?.configured && fantraxStatus?.connected;

  const recalculateValues = useCallback(async () => {
    setRecalcStatus('calculating');
    try {
      await api.calculateValues();
      setRecalcStatus('success');
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['keeper-analysis'] });
    } catch {
      setRecalcStatus('error');
    }
  }, [queryClient]);

  const importMutation = useMutation({
    mutationFn: ({ csvContent, type, source }: { csvContent: string; type: string; source: string }) => {
      if (type === 'roster') {
        return api.importRosters({ type, source, csvContent });
      }
      return api.importData({ type, source, csvContent });
    },
    onSuccess: async (data, vars) => {
      const key = `${vars.type}-${vars.source}`;
      setStatuses((prev) => ({
        ...prev,
        [key]: { type: vars.type, source: vars.source, status: 'success', message: '', count: data.imported ?? data.count ?? data.rowCount },
      }));
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      await recalculateValues();
    },
    onError: (err, vars) => {
      const key = `${vars.type}-${vars.source}`;
      setStatuses((prev) => ({
        ...prev,
        [key]: { type: vars.type, source: vars.source, status: 'error', message: (err as Error).message },
      }));
    },
  });

  const handleImport = useCallback((csvContent: string, type: ImportType, source: string) => {
    const key = `${type}-${source}`;
    setStatuses((prev) => ({
      ...prev,
      [key]: { type, source, status: 'importing', message: '' },
    }));
    importMutation.mutate({ csvContent, type, source });
  }, []);

  const handleFetch = useCallback((fetchKey: string, fetchFn: () => Promise<any>, autoRecalc = true) => {
    setStatuses((prev) => ({
      ...prev,
      [fetchKey]: { type: fetchKey, source: '', status: 'importing', message: '' },
    }));
    return fetchFn()
      .then(async (data) => {
        setStatuses((prev) => ({
          ...prev,
          [fetchKey]: { type: fetchKey, source: '', status: 'success', message: '', count: data.imported },
        }));
        queryClient.invalidateQueries({ queryKey: ['players'] });
        if (autoRecalc) {
          await recalculateValues();
        }
      })
      .catch((err: Error) => {
        setStatuses((prev) => ({
          ...prev,
          [fetchKey]: { type: fetchKey, source: '', status: 'error', message: err.message },
        }));
        throw err;
      });
  }, [queryClient, recalculateValues]);

  const handleFetchAll = useCallback(async () => {
    setFetchAllRunning(true);
    setFetchAllError(null);
    const errors: string[] = [];
    let anySucceeded = false;

    for (const step of FETCH_ALL_STEPS) {
      try {
        await handleFetch(step.key, step.fn, false);
        anySucceeded = true;
      } catch (err) {
        errors.push(`${step.key}: ${(err as Error).message}`);
      }
    }

    if (errors.length > 0) {
      setFetchAllError(`${errors.length} fetch(es) failed: ${errors.join('; ')}`);
    }
    if (anySucceeded) {
      await recalculateValues();
    }
    setFetchAllRunning(false);
  }, [handleFetch, recalculateValues]);

  const checklistItems = [
    { key: 'fetch-steamer-bat', label: 'Steamer Batting' },
    { key: 'fetch-steamer-pit', label: 'Steamer Pitching' },
    { key: 'fetch-zips-bat', label: 'ZiPS Batting' },
    { key: 'fetch-zips-pit', label: 'ZiPS Pitching' },
    { key: 'fetch-atc-bat', label: 'ATC Batting' },
    { key: 'fetch-atc-pit', label: 'ATC Pitching' },
    { key: 'fetch-savant', label: 'Savant Data' },
    { key: 'fantrax-sync', label: 'Fantrax Rosters', useFantrax: true as const },
    // Also track CSV statuses
    { key: 'batting-steamer', label: 'Steamer Batting (CSV)' },
    { key: 'pitching-steamer', label: 'Steamer Pitching (CSV)' },
    { key: 'batting-zips', label: 'ZiPS Batting (CSV)' },
    { key: 'pitching-zips', label: 'ZiPS Pitching (CSV)' },
    { key: 'savant-savant', label: 'Savant (CSV)' },
  ];

  // Only show checklist items that are either fantrax or have been attempted
  const activeChecklist = checklistItems.filter(
    (item) => 'useFantrax' in item || statuses[item.key] != null,
  );

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Data Import</h2>

      {/* Fantrax Connection */}
      <div className="mb-6">
        <FantraxCard />
      </div>

      {/* Import checklist */}
      {activeChecklist.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Import Status</h3>
          <div className="grid grid-cols-3 gap-2 text-sm">
            {activeChecklist.map((item) => {
              const isFantrax = 'useFantrax' in item;
              const done = isFantrax ? fantraxSynced : statuses[item.key]?.status === 'success';
              const importing = !isFantrax && statuses[item.key]?.status === 'importing';
              const error = !isFantrax && statuses[item.key]?.status === 'error';

              return (
                <div key={item.key} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    done ? 'bg-green-500' :
                    importing ? 'bg-yellow-500' :
                    error ? 'bg-red-500' :
                    'bg-gray-600'
                  }`} />
                  <span className="text-gray-400">{item.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recalculation status */}
      {recalcStatus !== 'idle' && (
        <div className={`rounded-lg p-3 mb-6 text-sm flex items-center gap-2 ${
          recalcStatus === 'calculating' ? 'bg-blue-900/20 border border-blue-800 text-blue-400' :
          recalcStatus === 'success' ? 'bg-green-900/20 border border-green-800 text-green-400' :
          'bg-red-900/20 border border-red-800 text-red-400'
        }`}>
          {recalcStatus === 'calculating' && (
            <span className="w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
          )}
          {recalcStatus === 'calculating' ? 'Recalculating auction values...' :
           recalcStatus === 'success' ? 'Values recalculated successfully' :
           'Value recalculation failed'}
        </div>
      )}

      {/* Auto-Fetch Section */}
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-lg font-medium text-gray-300">Auto-Fetch Projections</h3>
        <button
          onClick={handleFetchAll}
          disabled={fetchAllRunning}
          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded transition-colors"
        >
          {fetchAllRunning ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Fetching All...
            </span>
          ) : (
            'Fetch All'
          )}
        </button>
      </div>
      {fetchAllError && (
        <div className="text-xs text-red-400 mb-3 bg-red-900/20 border border-red-800 rounded p-2">{fetchAllError}</div>
      )}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <FetchCard
          title="Steamer Batting"
          description="Fetch Steamer batting projections from FanGraphs"
          fetchKey="fetch-steamer-bat"
          onFetch={() => handleFetch('fetch-steamer-bat', () => api.fetchProjections('steamer', 'bat'))}
          status={statuses['fetch-steamer-bat'] ?? null}
          disabled={fetchAllRunning}
        />
        <FetchCard
          title="Steamer Pitching"
          description="Fetch Steamer pitching projections from FanGraphs"
          fetchKey="fetch-steamer-pit"
          onFetch={() => handleFetch('fetch-steamer-pit', () => api.fetchProjections('steamer', 'pit'))}
          status={statuses['fetch-steamer-pit'] ?? null}
          disabled={fetchAllRunning}
        />
        <FetchCard
          title="ZiPS Batting"
          description="Fetch ZiPS batting projections from FanGraphs"
          fetchKey="fetch-zips-bat"
          onFetch={() => handleFetch('fetch-zips-bat', () => api.fetchProjections('zips', 'bat'))}
          status={statuses['fetch-zips-bat'] ?? null}
          disabled={fetchAllRunning}
        />
        <FetchCard
          title="ZiPS Pitching"
          description="Fetch ZiPS pitching projections from FanGraphs"
          fetchKey="fetch-zips-pit"
          onFetch={() => handleFetch('fetch-zips-pit', () => api.fetchProjections('zips', 'pit'))}
          status={statuses['fetch-zips-pit'] ?? null}
          disabled={fetchAllRunning}
        />
        <FetchCard
          title="ATC Batting"
          description="Fetch ATC batting projections from FanGraphs"
          fetchKey="fetch-atc-bat"
          onFetch={() => handleFetch('fetch-atc-bat', () => api.fetchProjections('atc', 'bat'))}
          status={statuses['fetch-atc-bat'] ?? null}
          disabled={fetchAllRunning}
        />
        <FetchCard
          title="ATC Pitching"
          description="Fetch ATC pitching projections from FanGraphs"
          fetchKey="fetch-atc-pit"
          onFetch={() => handleFetch('fetch-atc-pit', () => api.fetchProjections('atc', 'pit'))}
          status={statuses['fetch-atc-pit'] ?? null}
          disabled={fetchAllRunning}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <FetchCard
          title="Baseball Savant"
          description="Fetch expected stats from Baseball Savant"
          fetchKey="fetch-savant"
          onFetch={() => handleFetch('fetch-savant', () => api.fetchSavant())}
          status={statuses['fetch-savant'] ?? null}
          disabled={fetchAllRunning}
        />
      </div>

      {/* CSV Fallback Section */}
      <h3 className="text-lg font-medium text-gray-300 mb-3">Manual CSV Import</h3>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <ImportCard
          title="Steamer Batting"
          description="FanGraphs Steamer batting projections CSV"
          importType="batting"
          source="steamer"
          onImport={handleImport}
          status={statuses['batting-steamer'] ?? null}
        />
        <ImportCard
          title="Steamer Pitching"
          description="FanGraphs Steamer pitching projections CSV"
          importType="pitching"
          source="steamer"
          onImport={handleImport}
          status={statuses['pitching-steamer'] ?? null}
        />
        <ImportCard
          title="ZiPS Batting"
          description="FanGraphs ZiPS batting projections CSV"
          importType="batting"
          source="zips"
          onImport={handleImport}
          status={statuses['batting-zips'] ?? null}
        />
        <ImportCard
          title="ZiPS Pitching"
          description="FanGraphs ZiPS pitching projections CSV"
          importType="pitching"
          source="zips"
          onImport={handleImport}
          status={statuses['pitching-zips'] ?? null}
        />
      </div>

      <h3 className="text-lg font-medium text-gray-300 mb-3">Other Data (CSV)</h3>
      <div className="grid grid-cols-2 gap-4">
        <ImportCard
          title="Baseball Savant"
          description="Statcast expected stats and batted ball data"
          importType="savant"
          source="savant"
          onImport={handleImport}
          status={statuses['savant-savant'] ?? null}
        />
      </div>
    </div>
  );
}
