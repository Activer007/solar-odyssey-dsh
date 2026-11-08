import { useEffect, useSyncExternalStore } from 'react';
import * as THREE from 'three';

export interface TextureResourceStatus {
  id: string;
  url: string;
  color: boolean;
  status: 'loading' | 'ready' | 'error';
}
interface TextureEntry { texture: THREE.Texture | null; promise: Promise<THREE.Texture>; }
export class TextureResourceReleasedError extends Error {
  constructor() { super('Texture resource released while loading'); this.name = 'TextureResourceReleasedError'; }
}
const key = (url: string, color: boolean) => `${color ? 'srgb' : 'linear'}:${url}`;

/** One shared owner retains successful maps until the entire scene is released. */
export function createTextureResourceCache(loader: (url: string) => Promise<THREE.Texture>) {
  const textures = new Map<string, TextureEntry>();
  const states = new Map<string, TextureResourceStatus>();
  const listeners = new Set<() => void>();
  let snapshot: readonly TextureResourceStatus[] = [];
  const publish = () => {
    snapshot = [...states.values()];
    listeners.forEach(listener => listener());
  };
  const cached = (url: string | undefined, color = true) => url ? textures.get(key(url, color))?.texture ?? null : null;
  const load = (url: string, color = true): Promise<THREE.Texture> => {
    const id = key(url, color), existing = textures.get(id);
    if (existing) return existing.promise;
    const entry: TextureEntry = { texture: null, promise: undefined as unknown as Promise<THREE.Texture> };
    textures.set(id, entry);
    let request: Promise<THREE.Texture>;
    try { request = loader(url); } catch (error) { request = Promise.reject(error); }
    entry.promise = request.then(texture => {
      // An earlier scene may finish after disposal or a new load of this URL.
      // Its caller must never receive the now-disposed result.
      if (textures.get(id) !== entry) {
        texture.dispose();
        throw new TextureResourceReleasedError();
      }
      texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.anisotropy = 4;
      entry.texture = texture;
      states.set(id, { id, url, color, status: 'ready' });
      publish();
      return texture;
    }, error => {
      if (textures.get(id) !== entry) throw new TextureResourceReleasedError();
      // Keep the visible failure, never the rejected Promise. Each explicit
      // retry or later mount gets one fresh attempt; there is no retry loop.
      textures.delete(id);
      states.set(id, { id, url, color, status: 'error' });
      publish();
      throw error;
    });
    states.set(id, { id, url, color, status: 'loading' });
    publish();
    return entry.promise;
  };
  return {
    cached,
    load,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    retryFailed: () => Promise.allSettled([...states.values()].filter(item => item.status === 'error').map(item => load(item.url, item.color))),
    dispose() {
      const owned = [...textures.values()];
      textures.clear();
      states.clear();
      owned.forEach(entry => entry.texture?.dispose());
      publish();
    },
  };
}

const resources = createTextureResourceCache(url => new THREE.TextureLoader().loadAsync(url));
export const cachedTexture = resources.cached;
export const loadTexture = resources.load;
export const disposeTextureResources = resources.dispose;
export const retryFailedTextureResources = resources.retryFailed;
export function useTextureResourceStatus() {
  return useSyncExternalStore(resources.subscribe, resources.getSnapshot, resources.getSnapshot);
}

// Subscriptions also update mounted materials after a user requests a retry.
// Reading the shared cache on every render avoids retaining stale URL results.
export function useLocalTexture(url?: string, color = true) {
  useTextureResourceStatus();
  useEffect(() => {
    if (url) void loadTexture(url, color).catch(() => { /* failure is shown by ResourceStatus */ });
  }, [url, color]);
  return cachedTexture(url, color);
}
