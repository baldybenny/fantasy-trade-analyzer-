/**
 * Baseball Savant Fetcher
 *
 * Fetches expected statistics CSV from Baseball Savant leaderboard.
 * The live CSV uses "last_name, first_name" as a single combined column
 * (comma inside quotes), so we pre-process to split it into separate columns.
 */

/**
 * Fetch raw CSV from Baseball Savant expected statistics leaderboard.
 * Pre-processes the combined "last_name, first_name" column into separate columns.
 *
 * Defaults to prior year since early in a new season there may be no data yet.
 */
export async function fetchSavantData(year?: number): Promise<string> {
  const y = year ?? new Date().getFullYear() - 1;
  const url = `https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter&year=${y}&position=&team=&min=1&csv=true`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'FantasyTradeAnalyzer/1.0',
      'Accept': 'text/csv',
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`Baseball Savant API error: ${res.status} ${res.statusText}`);
  }

  const rawCsv = await res.text();
  return preprocessSavantCsv(rawCsv);
}

/**
 * The Savant CSV has:
 * 1. A BOM character (\uFEFF) at the start
 * 2. A combined `"last_name, first_name"` header (single quoted column with comma inside)
 * 3. Data rows with `"Lindor, Francisco"` as a single quoted field
 *
 * The existing importer expects separate `last_name` and `first_name` columns.
 * This function strips the BOM and splits that combined column.
 */
function preprocessSavantCsv(csv: string): string {
  // Strip BOM
  let cleaned = csv.replace(/^\uFEFF/, '');

  const lines = cleaned.split('\n');
  if (lines.length === 0) return cleaned;

  const header = lines[0];

  // Check if there's a combined "last_name, first_name" column
  if (!header.includes('"last_name, first_name"') && !header.includes('last_name, first_name')) {
    // If columns are already separate, return as-is
    return cleaned;
  }

  // Replace the combined header with separate columns
  const processedLines: string[] = [];
  const newHeader = header.replace(/"last_name, first_name"/, 'last_name,first_name');
  processedLines.push(newHeader);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Find the quoted "Last, First" field and split it into two unquoted fields
    const processed = line.replace(/"([^"]+),\s*([^"]+)"/, '$1,$2');
    processedLines.push(processed);
  }

  return processedLines.join('\n');
}
