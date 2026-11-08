import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeRendererContext, reportRendererHealth, useRendererHealth } from '../src/state/rendererHealth';

afterEach(() => reportRendererHealth('ready'));

describe('renderer context recovery', () => {
  it('permits browser recovery and reports loss and restoration outside the render loop', () => {
    const canvas = new EventTarget();
    const stop = observeRendererContext(canvas);
    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(useRendererHealth.getState().status).toBe('lost');
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(useRendererHealth.getState().status).toBe('restored');
    stop();
  });

  it('detaches both listeners and clears obsolete warnings when a renderer is replaced', () => {
    const canvas = new EventTarget();
    const report = vi.fn();
    const stop = observeRendererContext(canvas, report);
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    stop();
    expect(report.mock.calls.map(([status]) => status)).toEqual(['ready', 'lost', 'ready']);
    report.mockClear();
    const staleLoss = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(staleLoss);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(staleLoss.defaultPrevented).toBe(false);
    expect(report).not.toHaveBeenCalled();
  });
});
