import Papa from 'papaparse';

export interface ColumnMapping {
  [targetField: string]: string | string[]; // target: source column name(s) to try
}

export interface ParseResult<T> {
  data: T[];
  errors: string[];
  rowCount: number;
  detectedFormat: string | null;
}

/**
 * Parse CSV content and map columns to a standardized format.
 */
export function parseCSV<T>(
  csvContent: string,
  columnMapping: ColumnMapping,
  transform?: (row: Record<string, string>) => T | null,
): ParseResult<T> {
  const parsed = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false, // keep as strings, we'll convert manually
    transformHeader: (h) => h.trim(),
  });

  const errors: string[] = parsed.errors.map((e) => `Row ${e.row}: ${e.message}`);
  const data: T[] = [];

  for (const row of parsed.data) {
    const mapped: Record<string, string> = {};

    for (const [target, sourceCols] of Object.entries(columnMapping)) {
      const candidates = Array.isArray(sourceCols) ? sourceCols : [sourceCols];
      for (const col of candidates) {
        if (row[col] !== undefined && row[col] !== '') {
          mapped[target] = row[col];
          break;
        }
      }
    }

    if (transform) {
      const transformed = transform(mapped);
      if (transformed) data.push(transformed);
    } else {
      data.push(mapped as unknown as T);
    }
  }

  return { data, errors, rowCount: data.length, detectedFormat: null };
}

/**
 * Auto-detect the CSV format based on column headers.
 */
export function detectFormat(csvContent: string): 'fangraphs-batting' | 'fangraphs-pitching' | 'savant' | 'fantrax-roster' | 'unknown' {
  const firstLine = csvContent.split('\n')[0] ?? '';
  const headers = firstLine.split(',').map((h) => h.trim().replace(/"/g, ''));

  // FanGraphs batting: has Name, Team, PA, AB, H, HR
  if (headers.includes('Name') && headers.includes('PA') && headers.includes('AB') && headers.includes('HR') && !headers.includes('IP')) {
    return 'fangraphs-batting';
  }

  // FanGraphs pitching: has Name, Team, W, IP, ERA
  if (headers.includes('Name') && headers.includes('IP') && (headers.includes('W') || headers.includes('ERA'))) {
    return 'fangraphs-pitching';
  }

  // Savant: has last_name, first_name, player_id or xba, xslg
  if (headers.includes('last_name') || headers.includes('xba') || headers.includes('xwoba')) {
    return 'savant';
  }

  // Fantrax roster: has Player, Status, Salary
  if (headers.includes('Player') && (headers.includes('Status') || headers.includes('Salary'))) {
    return 'fantrax-roster';
  }

  return 'unknown';
}

export function parseNumber(val: string | undefined): number {
  if (!val || val === '' || val === '-') return 0;
  const cleaned = val.replace(/[$,%]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}
