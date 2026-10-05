/**
 * Visitor preferences in `localStorage` (Constitution II allows it for preferences only), such as the info
 * panel's open/collapsed choice (spec 012, D-020). Storage can be missing, blocked or full (private mode), and
 * even reading `window.localStorage` can throw, so these never throw: reads fall back, failed writes are dropped.
 * Values are stored as JSON.
 */
export function readPreference(key: string, fallback: boolean, storage?: Storage): boolean;
export function readPreference(key: string, fallback: string, storage?: Storage): string;
export function readPreference(key: string, fallback: boolean | string, storage?: Storage): boolean | string {
  try {
    const raw = (storage ?? window.localStorage).getItem(key);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    return typeof value === typeof fallback ? (value as boolean | string) : fallback;
  } catch {
    return fallback; // blocked storage or a corrupt value
  }
}

export function writePreference(key: string, value: boolean | string, storage?: Storage): void {
  try {
    (storage ?? window.localStorage).setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable or full: the choice just isn't remembered.
  }
}
