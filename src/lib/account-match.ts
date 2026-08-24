export type MatchableAccount = {
  id: string;
  match_hints: string | null;
  is_archived: number;
  deleted_at?: string | null;
  created_at?: string;
};

/**
 * Matches an account from raw alert text using configured hint tokens.
 *
 * @param text - Raw alert text (e.g., SMS or email body)
 * @param accounts - Array of accounts with hints to match
 * @returns The ID of the first matching (non-archived, non-deleted) account, or null
 *
 * Logic:
 * - Lowercases text once
 * - Filters to non-archived (is_archived !== 1) and non-deleted (no deleted_at)
 * - Sorts by created_at ascending for stable order; preserves input order if created_at missing
 * - For each account, splits match_hints on comma/newline, trims, lowercases
 * - Drops tokens shorter than 2 characters
 * - Returns first account where ANY token is a substring of lowercased text
 * - Does not mutate input array
 */
export function matchAccountFromText(
  text: string,
  accounts: MatchableAccount[]
): string | null {
  const lowerText = text.toLowerCase();

  // Filter: non-archived, non-deleted accounts
  const filtered = accounts.filter(
    (acc) => acc.is_archived !== 1 && !acc.deleted_at
  );

  // Stable sort by created_at ascending, preserving input order for ties
  const sorted = [...filtered].sort((a, b) => {
    const aDate = a.created_at ? new Date(a.created_at).getTime() : Infinity;
    const bDate = b.created_at ? new Date(b.created_at).getTime() : Infinity;
    return aDate - bDate;
  });

  // Find first matching account
  for (const account of sorted) {
    if (!account.match_hints) continue;

    // Split on comma and newline, trim, lowercase, filter short tokens
    const tokens = account.match_hints
      .split(/[,\n]/)
      .map((token) => token.trim().toLowerCase())
      .filter((token) => token.length >= 2);

    // Return if any token is a substring
    if (tokens.some((token) => lowerText.includes(token))) {
      return account.id;
    }
  }

  return null;
}
