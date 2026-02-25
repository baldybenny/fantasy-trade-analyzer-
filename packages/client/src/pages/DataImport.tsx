import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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

export default function DataImport() {
  const queryClient = useQueryClient();
  const [statuses, setStatuses] = useState<Record<string, ImportStatus>>({});

  const importMutation = useMutation({
    mutationFn: ({ csvContent, type, source }: { csvContent: string; type: string; source: string }) => {
      if (type === 'roster') {
        return api.importRosters({ type, source, csvContent });
      }
      return api.importData({ type, source, csvContent });
    },
    onSuccess: (data, vars) => {
      const key = `${vars.type}-${vars.source}`;
      setStatuses((prev) => ({
        ...prev,
        [key]: { type: vars.type, source: vars.source, status: 'success', message: '', count: data.count ?? data.rowCount },
      }));
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
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

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Data Import</h2>

      {/* Import checklist */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-medium text-gray-400 mb-2">Import Checklist</h3>
        <div className="grid grid-cols-3 gap-2 text-sm">
          {[
            { key: 'batting-steamer', label: 'Steamer Batting' },
            { key: 'pitching-steamer', label: 'Steamer Pitching' },
            { key: 'batting-zips', label: 'ZiPS Batting' },
            { key: 'pitching-zips', label: 'ZiPS Pitching' },
            { key: 'savant-savant', label: 'Savant Data' },
            { key: 'roster-fantrax', label: 'Fantrax Rosters' },
          ].map((item) => (
            <div key={item.key} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                statuses[item.key]?.status === 'success' ? 'bg-green-500' :
                statuses[item.key]?.status === 'importing' ? 'bg-yellow-500' :
                statuses[item.key]?.status === 'error' ? 'bg-red-500' :
                'bg-gray-600'
              }`} />
              <span className="text-gray-400">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Projection imports */}
      <h3 className="text-lg font-medium text-gray-300 mb-3">Projections</h3>
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

      {/* Statcast + Roster */}
      <h3 className="text-lg font-medium text-gray-300 mb-3">Other Data</h3>
      <div className="grid grid-cols-2 gap-4">
        <ImportCard
          title="Baseball Savant"
          description="Statcast expected stats and batted ball data"
          importType="savant"
          source="savant"
          onImport={handleImport}
          status={statuses['savant-savant'] ?? null}
        />
        <ImportCard
          title="Fantrax Rosters"
          description="Fantrax league roster export with salaries and contracts"
          importType="roster"
          source="fantrax"
          onImport={handleImport}
          status={statuses['roster-fantrax'] ?? null}
        />
      </div>
    </div>
  );
}
