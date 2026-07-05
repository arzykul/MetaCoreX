/** Shared display formatters used across PoU analytics pages (dashboard, leaderboard, agent profile). */

/** Shorten an Ethereum address for display, e.g. "0x1234…abcd". */
export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
