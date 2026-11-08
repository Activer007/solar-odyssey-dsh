import { describe, expect, it } from 'vitest';
import { initialQuality, saveQuality, QUALITY_STORAGE_KEY } from '../src/state/qualityPreference';

describe('conservative renderer preferences', () => {
  it('uses low quality for unknown or invalid preferences', () => {
    for (const value of [null, '', 'ultra', '{"quality":"high"}']) {
      expect(initialQuality({ getItem: () => value, setItem: () => {} })).toEqual({ quality: 'low', qualitySource: 'default' });
    }
    expect(initialQuality({ getItem: () => { throw new Error('disabled'); }, setItem: () => {} }).quality).toBe('low');
  });
  it('retains an explicit user override and tolerates unavailable storage', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    for (const quality of ['high', 'low'] as const) {
      saveQuality(quality, storage);
      expect(values.get(QUALITY_STORAGE_KEY)).toBe(quality);
      expect(initialQuality(storage)).toEqual({ quality, qualitySource: 'manual' });
    }
    expect(() => saveQuality('high', { getItem: () => null, setItem: () => { throw new Error('disabled'); } })).not.toThrow();
  });
});
