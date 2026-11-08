import { Component, useState, type KeyboardEvent, type ReactNode } from 'react';
import { bodies } from './data/astronomy';
import { Scene } from './scene/Scene';
import { ExplorerUI } from './ui/ExplorerUI';
import { ResourceStatus } from './ui/ResourceStatus';
import { RendererStatus } from './scene/RendererHealth';
import { useExplorer } from './state/useExplorer';

class RenderBoundary extends Component<{ children: ReactNode; retry: () => void }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() {
    return this.state.error ? <div className="webgl-fallback">
      <h1>渲染暂时中断</h1><p>请检查浏览器硬件加速，或重启三维场景。</p>
      <button onClick={this.props.retry}>重启三维场景</button>
    </div> : this.props.children;
  }
}

function gameShortcuts(event: KeyboardEvent<HTMLElement>) {
  if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey ||
    (event.target instanceof HTMLElement && event.target.closest('input,select,textarea,button,a,[contenteditable]'))) return;
  const explorer = useExplorer.getState();
  if (explorer.helpOpen || explorer.settingsOpen || explorer.sourcesOpen || explorer.missionOpen) return;
  if (event.code === 'Space') {
    if (!event.repeat) explorer.set({ paused: !explorer.paused });
  } else if (event.code === 'Home') {
    explorer.overview();
  } else if (/^[1-9]$/.test(event.key)) {
    explorer.selectBody(bodies[Number(event.key) - 1].id);
  } else return;
  event.preventDefault();
  event.stopPropagation();
}

export default function App() {
  const [renderer, setRenderer] = useState(0);
  const retry = () => setRenderer(value => value + 1);
  return <div className="solar-stage">
    <section className="app-shell" aria-label="太阳系探索计划" tabIndex={0} onKeyDown={gameShortcuts}
      onPointerDownCapture={event => {
        if (event.target instanceof Element && event.target.closest('.scene-viewport') && !event.target.closest('button')) {
          event.currentTarget.focus({ preventScroll: true });
        }
      }}>
      <RenderBoundary key={renderer} retry={retry}><Scene /></RenderBoundary>
      <ExplorerUI /><ResourceStatus /><RendererStatus retry={retry} />
    </section>
  </div>;
}
