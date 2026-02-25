import { normalizeName } from '@fta/shared';
import { db } from '../../db/database.js';
import * as schema from '../../db/schema.js';

interface PlayerEntry {
  id: number;
  normalizedName: string;
}

let playerIndex: PlayerEntry[] = [];
let lastLoadedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MIN_NAME_LENGTH = 5; // Skip names ≤4 chars normalized to avoid false positives

function loadPlayerIndex(): void {
  const now = Date.now();
  if (playerIndex.length > 0 && now - lastLoadedAt < CACHE_TTL_MS) return;

  const rows = db.select({ id: schema.players.id, name: schema.players.name }).from(schema.players).all();

  playerIndex = rows
    .map((r) => ({
      id: r.id,
      normalizedName: normalizeName(r.name),
    }))
    .filter((p) => p.normalizedName.length > MIN_NAME_LENGTH);

  // Sort by name length descending so longer names match first (e.g. "Vladimir Guerrero" before "Vladimir")
  playerIndex.sort((a, b) => b.normalizedName.length - a.normalizedName.length);

  lastLoadedAt = now;
}

export function tagPlayersInText(text: string): number[] {
  loadPlayerIndex();

  const normalizedText = normalizeName(text);
  const matchedIds = new Set<number>();

  for (const player of playerIndex) {
    if (normalizedText.includes(player.normalizedName)) {
      matchedIds.add(player.id);
    }
  }

  return Array.from(matchedIds);
}
