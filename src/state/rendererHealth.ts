import { create } from 'zustand';

export type RendererHealthStatus = 'ready' | 'lost' | 'restored';

export const useRendererHealth = create<{ status: RendererHealthStatus }>(() => ({ status: 'ready' }));

export function reportRendererHealth(status: RendererHealthStatus) {
  useRendererHealth.setState({ status });
}

/** Keep recovery enabled; Three.js rebuilds its WebGL state on context restoration. */
export function observeRendererContext(target: EventTarget, report = reportRendererHealth) {
  const lost = (event: Event) => {
    event.preventDefault();
    report('lost');
  };
  const restored = () => report('restored');
  target.addEventListener('webglcontextlost', lost);
  target.addEventListener('webglcontextrestored', restored);
  report('ready');
  return () => {
    target.removeEventListener('webglcontextlost', lost);
    target.removeEventListener('webglcontextrestored', restored);
    report('ready');
  };
}
