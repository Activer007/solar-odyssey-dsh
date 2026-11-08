import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { observeRendererContext, reportRendererHealth, useRendererHealth } from '../state/rendererHealth';

/** Mount inside Canvas so listeners follow the actual renderer's lifetime. */
export function RendererHealth() {
  const gl = useThree(s => s.gl);
  useEffect(() => observeRendererContext(gl.domElement), [gl]);
  return null;
}

/** Mount outside Canvas so the recovery action works while rendering is suspended. */
export function RendererStatus({ retry }: { retry: () => void }) {
  const status = useRendererHealth(s => s.status);
  if (status === 'ready') return null;
  const lost = status === 'lost';
  return <aside data-testid="renderer-status" role={lost ? 'alert' : 'status'} style={{
    position: 'absolute', top: 'calc(var(--header-height, 72px) + 12px)', left: '50%', transform: 'translateX(-50%)',
    width: 'min(440px, calc(100% - 32px))', zIndex: 80, background: '#14202a', border: '1px solid #617387',
    borderRadius: 6, padding: '14px 18px', color: '#dce5ee', fontSize: 12, lineHeight: 1.7,
  }}>
    <strong>{lost ? '三维渲染暂时中断' : '三维渲染已恢复'}</strong>
    <p style={{ margin: '5px 0 10px' }}>{lost
      ? '浏览器正在尝试恢复图形资源。若画面未恢复，可重启三维场景。'
      : '可以继续探索。若画面仍有异常，可重启三维场景。'}</p>
    <div style={{ display: 'flex', gap: 16 }}>
      <button onClick={retry} style={{ color: 'var(--accent, #f3ba65)', textDecoration: 'underline' }}>重启三维场景</button>
      {!lost && <button onClick={() => reportRendererHealth('ready')}>关闭提示</button>}
    </div>
  </aside>;
}
