export type Quality = 'high' | 'low';
export const QUALITY_STORAGE_KEY = 'solar-odyssey.quality';
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Unknown GPUs start conservatively; only an explicit saved choice opts up. */
export function initialQuality(storage?: PreferenceStorage): { quality: Quality; qualitySource: 'default' | 'manual' } {
  try {
    const value = (storage ?? globalThis.localStorage)?.getItem(QUALITY_STORAGE_KEY);
    if (value === 'high' || value === 'low') return { quality: value, qualitySource: 'manual' };
  } catch { /* Storage can be disabled; exploration still works. */ }
  return { quality: 'low', qualitySource: 'default' };
}

export function saveQuality(quality: Quality, storage?: PreferenceStorage) {
  try { (storage ?? globalThis.localStorage)?.setItem(QUALITY_STORAGE_KEY, quality); } catch { /* Session choice remains usable. */ }
}
