/**
 * Player name normalization and matching utilities.
 *
 * Different projection sources format names differently:
 *   - "Ronald Acuna Jr." vs "Ronald Acuña Jr" vs "Acuna Jr., Ronald"
 *   - Accented characters, suffixes (Jr./Sr./II/III), punctuation
 */

/**
 * Normalize a player name for fuzzy comparison.
 *
 * Strips accents, lowercases, removes suffixes and punctuation,
 * and collapses whitespace.
 */
export function normalizeName(name: string): string {
  return name
    // Normalize unicode (decompose accents)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Lowercase
    .toLowerCase()
    // Handle "Last, First" format
    .replace(/^([^,]+),\s*(.+)$/, '$2 $1')
    // Remove common suffixes
    .replace(/\b(jr\.?|sr\.?|ii|iii|iv)\b/gi, '')
    // Remove periods and apostrophes
    .replace(/[.']/g, '')
    // Remove hyphens (keep space)
    .replace(/-/g, ' ')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if two player names match after normalization.
 */
export function namesMatch(nameA: string, nameB: string): boolean {
  return normalizeName(nameA) === normalizeName(nameB);
}
