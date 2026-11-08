import { ArrowLeft, ArrowRight, ExternalLink, Layers3, Zap } from 'lucide-react';
import { solarLayers } from '../data/astronomy';
import { solarLessons } from '../data/solarLessons';
import { useExplorer } from '../state/useExplorer';
import { SolarLessonPanel } from './SolarLessonPanel';

export function SolarStructurePanel() {
  const s = useExplorer();
  const selected = solarLayers.find(layer => layer.id === s.selectedLayer);
  const highlighted = s.lessonStep === null ? (s.selectedLayer ? [s.selectedLayer] : []) : solarLessons[s.lessonStep].layers;
  return <>
    <div className="info-heading"><div><h1>太阳的内部</h1><p className="english-name">BENEATH THE SURFACE</p></div><Layers3 size={25} strokeWidth={1} /></div>
    <p className="display-scale-note" data-testid="solar-color-note"><strong>示意配色</strong> · 用颜色区分区域，薄层厚度已放大。白色羽流参考日全食可见光下的日冕形态。</p>
    <SolarLessonPanel />
    <div className="layer-selector" aria-label="太阳结构层">
      {solarLayers.map((layer, index) => <button key={layer.id} className={highlighted.includes(layer.id) ? 'selected' : ''}
        aria-pressed={highlighted.includes(layer.id)} onClick={() => s.selectLayer(layer.id)} data-testid={`layer-${layer.id}`}>
        <span className="layer-color" style={{ background: layer.color }} /><span>{layer.name}</span><small>{String(index + 1).padStart(2, '0')}</small>
      </button>)}
    </div>
    <button className="show-all-layers" data-testid="show-all-layers" aria-pressed={s.selectedLayer === null} onClick={() => s.selectLayer(null)}>显示全部结构</button>
    {selected ? <div className="layer-detail" aria-live="polite">
      <h2 style={{ color: selected.color }}>{selected.name}</h2><p className="layer-english">{selected.enName}</p>
      <dl className="layer-facts"><div><dt>科学位置</dt><dd>{selected.position}</dd></div><div><dt>代表温度</dt><dd>{selected.temperature}</dd></div></dl>
      <p>{selected.description}</p><p className="display-scale-note">教学显示：{selected.displayNote}</p>
      <div className="energy-explanation"><Zap size={15} /><p>{selected.energy}</p></div>
      <a className="source-link" href={selected.source} target="_blank" rel="noreferrer">科学资料：NASA <ExternalLink size={12} /></a>
    </div> : <p className="structure-all-note">七层一起显示。点击结构或上方名称可独立观察，再次点击可取消选择。</p>}
    <div className="structure-controls">
      <label className="slider-label"><span>外层透明度</span><output>{Math.round(s.opacity * 100)}%</output>
        <input aria-label="外层透明度" type="range" min="0.1" max="1" step="0.05" value={s.opacity} onChange={e => s.set({ opacity: Number(e.target.value) })} />
      </label>
      <button className={`toggle-row ${s.exploded ? 'active' : ''}`} aria-pressed={s.exploded}
        onClick={() => s.set({ exploded: !s.exploded, energy: false, lessonStep: null })}>
        <Layers3 size={15} /><span>分层展开</span><span className="switch"><span /></span>
      </button>
      <button data-testid="energy-toggle" className={`toggle-row ${s.energy ? 'active' : ''}`} aria-pressed={s.energy}
        onClick={() => s.set({ energy: !s.energy, exploded: false, lessonStep: null })}>
        <Zap size={15} /><span>能量传递演示</span><span className="switch"><span /></span>
      </button>
    </div>
    <p className="simulation-note">真实太阳由连续的等离子体构成。剖面、羽流、时间、粒子大小和反应过程均为教学示意。展开时隐藏能量路径。</p>
    <button className="secondary-button" onClick={s.exitInterior}><ArrowLeft size={15} />返回太阳外部</button>
    <button className="back-overview" onClick={s.overview}>返回太阳系全景 <ArrowRight size={14} /></button>
  </>;
}
