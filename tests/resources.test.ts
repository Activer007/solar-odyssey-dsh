import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { cachedTexture, createTextureResourceCache, disposeTextureResources, loadTexture } from '../src/scene/textureResources';
import { applyEarthTextureFallback } from '../src/scene/Planet';

afterEach(() => {
  disposeTextureResources();
  vi.restoreAllMocks();
});

describe('shared texture resource lifetime', () => {
  it('can retry a failed request instead of retaining its rejected Promise', async () => {
    const recovered = new THREE.Texture();
    const loader = vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync')
      .mockRejectedValueOnce(new Error('image unavailable'))
      .mockResolvedValueOnce(recovered);
    await expect(loadTexture('/retry-day.jpg')).rejects.toThrow('image unavailable');
    await expect(loadTexture('/retry-day.jpg')).resolves.toBe(recovered);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(cachedTexture('/retry-day.jpg')).toBe(recovered);
  });

  it('never publishes a disposed texture when loading finishes after cache release', async () => {
    let finish!: (texture: THREE.Texture) => void;
    vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockImplementationOnce(() =>
      new Promise<THREE.Texture>(resolve => { finish = resolve; }));
    const lateTexture = new THREE.Texture();
    const dispose = vi.spyOn(lateTexture, 'dispose');
    const request = loadTexture('/slow-night.jpg');
    const rejected = expect(request).rejects.toThrow(/released|cancelled/i);
    disposeTextureResources();
    finish(lateTexture);
    await rejected;
    expect(dispose).toHaveBeenCalledOnce();
    expect(cachedTexture('/slow-night.jpg')).toBeNull();
  });

  it('shares in-flight requests and releases each retained map only once', async () => {
    const texture = new THREE.Texture();
    const dispose = vi.spyOn(texture, 'dispose');
    const loader = vi.fn().mockResolvedValue(texture);
    const cache = createTextureResourceCache(loader);
    const first = cache.load('/shared.jpg');
    expect(cache.load('/shared.jpg')).toBe(first);
    await first;
    expect(await cache.load('/shared.jpg')).toBe(texture);
    expect(loader).toHaveBeenCalledOnce();
    cache.dispose();
    cache.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('publishes a visible failure and performs exactly one fresh attempt for manual retry', async () => {
    const texture = new THREE.Texture();
    const loader = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(texture);
    const cache = createTextureResourceCache(loader);
    const changed = vi.fn();
    const unsubscribe = cache.subscribe(changed);
    await expect(cache.load('/night.jpg')).rejects.toThrow('offline');
    expect(cache.getSnapshot()).toMatchObject([{ status: 'error', url: '/night.jpg' }]);
    await Promise.resolve();
    expect(loader).toHaveBeenCalledOnce();
    await cache.retryFailed();
    expect(cache.getSnapshot()).toMatchObject([{ status: 'ready', url: '/night.jpg' }]);
    expect(cache.cached('/night.jpg')).toBe(texture);
    await cache.retryFailed();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(changed).toHaveBeenCalledTimes(4);
    unsubscribe();
    cache.dispose();
  });

  it('a late completion cannot replace a new generation loading the same URL', async () => {
    const finishes: Array<(texture: THREE.Texture) => void> = [];
    const cache = createTextureResourceCache(() => new Promise(resolve => { finishes.push(resolve); }));
    const oldTexture = new THREE.Texture(), currentTexture = new THREE.Texture();
    const oldDispose = vi.spyOn(oldTexture, 'dispose');
    const old = cache.load('/reopened.jpg');
    const cancelled = expect(old).rejects.toThrow(/released/i);
    cache.dispose();
    const current = cache.load('/reopened.jpg');
    finishes[1](currentTexture);
    await current;
    finishes[0](oldTexture);
    await cancelled;
    expect(oldDispose).toHaveBeenCalledOnce();
    expect(cache.cached('/reopened.jpg')).toBe(currentTexture);
    expect(cache.getSnapshot()).toMatchObject([{ status: 'ready' }]);
    cache.dispose();
  });

  it('ignores a stale failed request after disposal rather than showing an obsolete failure', async () => {
    let fail!: (reason: unknown) => void;
    const cache = createTextureResourceCache(() => new Promise((_resolve, reject) => { fail = reject; }));
    const request = cache.load('/closed.jpg');
    const cancelled = expect(request).rejects.toThrow(/released/i);
    cache.dispose();
    fail(new Error('late network error'));
    await cancelled;
    expect(cache.getSnapshot()).toEqual([]);
  });
});

describe('Earth texture fallbacks', () => {
  it('uses the body color and contributes no emissive light while both maps are absent', () => {
    const material = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 1.1 });
    applyEarthTextureFallback(material, null, null, '#287ac2');
    expect(material.map).toBeNull();
    expect(material.color.getHexString()).toBe('287ac2');
    expect(material.emissive.getHex()).toBe(0);
    expect(material.emissiveIntensity).toBe(0);
    material.dispose();
  });

  it('enables city lights only with a loaded night map and disables them if that map is removed', () => {
    const material = new THREE.MeshStandardMaterial();
    const day = new THREE.Texture(), night = new THREE.Texture();
    applyEarthTextureFallback(material, day, night, '#287ac2');
    expect(material.map).toBe(day);
    expect(material.color.getHexString()).toBe('ffffff');
    expect(material.emissiveMap).toBe(night);
    expect(material.emissiveIntensity).toBeGreaterThan(0);
    applyEarthTextureFallback(material, day, null, '#287ac2');
    expect(material.emissiveMap).toBeNull();
    expect(material.emissiveIntensity).toBe(0);
    expect(material.emissive.getHex()).toBe(0);
    day.dispose();
    night.dispose();
    material.dispose();
  });
});
