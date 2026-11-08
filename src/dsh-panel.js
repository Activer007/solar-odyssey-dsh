// DSH evaluates this entry with its own React. The separate game chunk owns a
// React 19 root for the renderer required by React Three Fiber 9.
const React = require('react');
const { createElement: h, useEffect, useRef, useState } = React;
const panelId = 'solar-odyssey';

function OrbitIcon() {
  return h('svg', { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': true },
    h('ellipse', { cx: 12, cy: 12, rx: 11, ry: 4, transform: 'rotate(-32 12 12)', fill: 'none', stroke: 'currentColor' }),
    h('circle', { cx: 12, cy: 12, r: 3.5, fill: 'currentColor' }),
    h('circle', { cx: 20, cy: 7, r: 1.6, fill: 'currentColor' }));
}

function SolarPanel({ t }) {
  const container = useRef(null);
  const [status, setStatus] = useState('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let dispose;
    const host = container.current;
    // The first desktop releases with chunk support predate require.asset.
    const textures = typeof require.asset === 'function' ? Promise.resolve() : require.async('./client.textures.js');
    textures.then(() => require.async('./client.game.js')).then(({ mountGame }) => {
      if (!active) return;
      dispose = mountGame(host);
      setStatus('ready');
    }).catch(error => {
      if (!active) return;
      console.error('Solar Odyssey could not start', error);
      setStatus('error');
    });
    return () => {
      active = false;
      dispose?.();
    };
  }, [attempt]);

  return h('div', { style: { position: 'relative', width: '100%', height: '100%', minHeight: 0, overflow: 'hidden' } },
    h('div', { ref: container, 'data-solar-odyssey': '', style: { width: '100%', height: '100%' } }),
    status !== 'ready' && h('div', {
      role: status === 'error' ? 'alert' : 'status',
      style: { position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', gap: 12, padding: 20, textAlign: 'center' },
    }, t(status === 'error' ? 'error' : 'loading'), status === 'error' && h('button', {
      type: 'button', onClick: () => { setStatus('loading'); setAttempt(value => value + 1); },
    }, t('retry'))));
}

module.exports = {
  inject: ['slots', 'locale'],
  apply(ctx) {
    ctx.effect(() => ctx.locale.register(panelId, {
      zh: { title: '太阳系探索计划', loading: '正在加载太阳系…', error: '太阳系未能加载。', retry: '重试' },
      en: { title: 'Solar Odyssey', loading: 'Loading the solar system…', error: 'Solar Odyssey could not load.', retry: 'Retry' },
    }));
    const t = ctx.locale.bind(panelId);
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist', id: panelId, order: 30, label: () => t('title'), locale: panelId,
    }, OrbitIcon));
    ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main', key: panelId, locale: panelId, inject: () => ({ t }),
    }, SolarPanel));
  },
};
