// The shared game state contains only JSON data. WeChat's game runtime may lack structuredClone.
export function ensureGameClone(): void {
  if (typeof globalThis.structuredClone === 'function') return;
  globalThis.structuredClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
}
