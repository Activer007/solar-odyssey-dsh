import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, ChevronLeft, CircleHelp, Compass, Eye, EyeOff, Globe2, Info, Layers3, Maximize, Menu, Minus, Orbit, Pause, Play, RotateCcw, Settings2, Sparkles, Sun, X, Zap, ExternalLink, Move3D } from 'lucide-react';
import { bodies, bodyById } from '../data/astronomy';
import { SolarStructurePanel } from './SolarStructurePanel';
import { MissionPanel } from './MissionPanel';
import { EARTH_ORBIT_REFERENCE, J2000_ORBIT_SOURCE } from '../data/j2000Elements';
import type { BodyData } from '../data/astronomy';
import { useExplorer } from '../state/useExplorer';
import { simulation } from '../simulation/orbits';

function IconButton({ label, children, onClick, active = false, className = '' }: { label: string; children: ReactNode; onClick: () => void; active?: boolean; className?: string }) {
  return <button className={`icon-button ${active ? 'active' : ''} ${className}`} aria-label={label} title={label} onClick={onClick}>{children}</button>;
}

function Brand() {
  return <div className="brand"><span className="brand-mark"><Orbit size={32} strokeWidth={1.2} /></span><span className="brand-name">SOLAR ODYSSEY</span><span className="brand-divider" /><span className="brand-subtitle">太阳系探索计划</span></div>;
}

function Header() {
  const s = useExplorer();
  const header = useRef<HTMLElement>(null);
  const timeout = useRef<number | undefined>(undefined);
  const [fullscreenError, setFullscreenError] = useState(false);
  useEffect(() => () => window.clearTimeout(timeout.current), []);
  const fullscreen = async () => {
    const stage = header.current?.closest('.solar-stage');
    if (!stage) return;
    try {
      const root = stage.getRootNode() as Document | ShadowRoot;
      if (root.fullscreenElement === stage) await stage.ownerDocument.exitFullscreen();
      else await stage.requestFullscreen();
    } catch {
      if (!stage.isConnected) return;
      setFullscreenError(true);
      window.clearTimeout(timeout.current);
      timeout.current = window.setTimeout(() => setFullscreenError(false), 4000);
    }
  };
  return <header ref={header} className="app-header">
    <IconButton className="mobile-menu" label="切换天体导航" onClick={() => s.set({ navOpen: !s.navOpen })}><Menu size={20} /></IconButton>
    <Brand />
    <div className="header-controls">
      <button className={`text-button orbit-toggle ${s.orbits ? 'active' : ''}`} aria-pressed={s.orbits} onClick={() => s.set({ orbits: !s.orbits })}><Orbit size={17} /><span>轨道</span><span className="tiny-indicator" /></button>
      <div className="control-divider" />
      <label className="scale-select"><span className="sr-only">场景比例</span><select aria-label="场景比例" value={s.scale} onChange={(e) => s.set({ scale: e.target.value as 'educational' | 'real', cameraRevision: s.cameraRevision + 1 })}><option value="educational">科普展示比例</option><option value="real">真实物理比例</option></select><ChevronDown size={13} /></label>
      <div className="control-divider" />
      <IconButton label="探索任务" active={s.missionOpen} onClick={() => s.set({ missionOpen: true })}><BookOpen size={19} /></IconButton>
      <IconButton label="画质与显示设置" active={s.settingsOpen} onClick={() => s.set({ settingsOpen: true })}><Settings2 size={19} /></IconButton>
      <IconButton label="操作帮助" active={s.helpOpen} onClick={() => s.set({ helpOpen: true })}><CircleHelp size={19} /></IconButton>
      <IconButton label="切换全屏" onClick={fullscreen}><Maximize size={19} /></IconButton>
    </div>
    {fullscreenError ? <p className="status-toast" role="status">当前浏览器未允许全屏显示。</p> : null}
  </header>;
}

function PlanetThumbnail({ body }: { body: BodyData }) {
  return <span aria-hidden="true" className={`planet-thumbnail planet-${body.id}`} style={{ backgroundColor: body.color, backgroundImage: body.texture ? `url(${body.texture})` : undefined }}><span /></span>;
}

function Navigation() {
  const s = useExplorer();
  const nav = useRef<HTMLElement>(null);
  const closeWhenNarrow = () => {
    const shell = nav.current?.closest('.app-shell');
    if (shell && shell.clientWidth <= 760) s.set({ navOpen: false });
  };
  const choose = (id: BodyData['id']) => { s.selectBody(id); closeWhenNarrow(); };
  return <>
    {s.navOpen ? <button className="mobile-nav-shade" aria-label="关闭天体导航" onClick={() => s.set({ navOpen: false })} /> : null}
    <aside ref={nav} className={`body-navigation ${s.navOpen ? '' : 'collapsed'}`} aria-label="天体导航">
      <button className={`overview-link ${s.mode === 'overview' ? 'selected' : ''}`} onClick={() => { s.overview(); closeWhenNarrow(); }}><Orbit size={28} strokeWidth={1} /><span>太阳系全景</span></button>
      <div className="nav-section-label">探索天体 <span>09</span></div>
      <nav>{bodies.map((body) => <button key={body.id} className={`body-link ${s.mode !== 'overview' && s.selected === body.id ? 'selected' : ''}`} aria-current={s.mode !== 'overview' && s.selected === body.id ? 'true' : undefined} onClick={() => choose(body.id)} data-testid={`nav-${body.id}`}><PlanetThumbnail body={body} /><span className="body-link-name">{body.name}<small>{body.enName}</small></span>{s.mode !== 'overview' && s.selected === body.id ? <span className="selected-dot" /> : null}</button>)}</nav>
      <div className="navigation-bottom"><button className="source-button" onClick={() => s.set({ sourcesOpen: true })}><span className="source-emblem">N</span><span>科学，让探索更远<small>资料来源与素材署名 <ExternalLink size={10} /></small></span></button><button className="collapse-nav" aria-label="收起天体导航" onClick={() => s.set({ navOpen: false })}><ChevronLeft size={15} /></button></div>
    </aside>
    {!s.navOpen ? <IconButton className="reopen-nav" label="展开天体导航" onClick={() => s.set({ navOpen: true })}><Menu size={19} /></IconButton> : null}
  </>;
}

function Breadcrumb() {
  const mode = useExplorer((s) => s.mode);
  const selected = useExplorer((s) => s.selected);
  const s = useExplorer.getState();
  return <div className="scene-breadcrumb"><button onClick={s.overview}>太阳系</button>{mode !== 'overview' ? <><span>/</span><button onClick={() => s.selectBody(selected)}>{bodyById[selected].name}</button></> : <><span>/</span><span>全景探索</span></>}{mode === 'interior' ? <><span>/</span><strong>内部结构</strong></> : null}<span className="mode-tag">{mode === 'interior' ? 'STRUCTURE EXPLORER' : mode === 'body' ? 'CELESTIAL OBSERVATION' : 'SOLAR SYSTEM'}</span></div>;
}

function Stat({ label, value, unit }: { label: string; value: ReactNode; unit?: string }) {
  return <div className="stat"><dt>{label}</dt><dd>{value}{unit ? <small>{unit}</small> : null}</dd></div>;
}

function OverviewInfo() {
  const s = useExplorer();
  return <><div className="info-heading"><div><h1>我们的太阳系</h1><p className="english-name">THE SOLAR SYSTEM</p></div><Orbit size={25} strokeWidth={1} /></div><p className="info-description">一颗恒星，八颗行星。沿着引力勾勒的轨迹，探索这片属于我们的宇宙家园。</p><dl className="stats-grid"><Stat label="中心恒星" value="太阳" /><Stat label="行星数量" value="8" unit="颗" /><Stat label="海王星轨道半长轴" value={bodyById.neptune.distanceAU.toFixed(1)} unit="AU" /><Stat label="系统年龄" value="约 46" unit="亿年" /></dl><button className="primary-button" onClick={() => s.selectBody('sun')}>从太阳开始探索 <ArrowRight size={18} /></button><div className="panel-section"><h2>选择你的目的地</h2><p>点击场景中的天体，或从左侧导航选择。镜头将带你飞近，观察每个世界的独特细节。</p></div><div className="model-notice"><Info size={15} /><p>{s.scale === 'educational' ? '天体大小与轨道间距已做独立调整，便于观察。' : '半径与轨道距离采用同一物理比例，小型天体在全景中几乎不可见；请用导航进入特写。'}</p></div><SourceLink href="https://science.nasa.gov/solar-system/" /></>;
}

function BodyInfo() {
  const s = useExplorer();
  const body = bodyById[s.selected];
  const isSun = body.id === 'sun';
  return <><div className="info-heading"><div><h1>{body.name}</h1><p className="english-name">{body.enName}</p></div><span className="body-type">{body.type}</span></div><p className="info-description">{body.description}</p><dl className="stats-grid"><Stat label="平均半径" value={body.radiusKm.toLocaleString('en-US')} unit="km" /><Stat label="轨道半长轴" value={isSun ? '—' : Number(body.distanceAU.toPrecision(5))} unit={isSun ? undefined : 'AU'} /><Stat label={isSun ? '自转（差异旋转）' : '自转周期'} value={body.rotation} /><Stat label={isSun ? '光球有效温度' : '公转周期'} value={isSun ? '5,772 K' : body.periodDays > 1000 ? `${(body.periodDays / 365.25).toFixed(2)} 年` : `${body.periodDays.toLocaleString('zh-CN')} 天`} /></dl>{isSun ? <><button data-testid="enter-interior" className="primary-button" onClick={s.enterInterior}>探索内部结构 <ArrowRight size={18} /></button><button className="secondary-button flare-button" onClick={() => s.set({ flare: s.flare + 1 })}><Zap size={15} />模拟一次太阳耀斑<span>可视化模拟</span></button></> : <div className="temperature-row"><span>温度条件</span><p>{body.temperature}</p></div>}{body.id === 'earth' ? <button className="secondary-button" onClick={() => s.setView('night')}><Eye size={15} />观察夜间灯光</button> : null}<div className="features-list">{body.features.map((feature, i) => <div className="feature-row" key={feature}><span className="feature-number">{String(i + 1).padStart(2, '0')}</span><p>{feature}</p></div>)}</div>{isSun ? <p className="simulation-note">动态光球、太阳黑子、日珥及耀斑为程序化科学可视化，并非实时观测。</p> : <p className="simulation-note">地表或云顶纹理为静态合成影像。自转、云层运动和大气光晕为可视化模拟。</p>}{body.id === 'earth' && <p className="simulation-note">{EARTH_ORBIT_REFERENCE}</p>}<SourceLink href={body.source} /><button className="back-overview" onClick={s.overview}><ArrowLeft size={14} />返回太阳系全景</button></>;
}

function SourceLink({ href }: { href: string }) {
  return <a className="source-link" href={href} target="_blank" rel="noreferrer">科学资料：NASA <ExternalLink size={12} /></a>;
}

function StructureInfo() {
  return <SolarStructurePanel />;
}

function InformationPanel() {
  const mode = useExplorer((s) => s.mode);
  const selected = useExplorer((s) => s.selected);
  const infoOpen = useExplorer((s) => s.infoOpen);
  const set = useExplorer((s) => s.set);
  return <>{infoOpen ? <aside className="information-panel" aria-label="科普信息"><IconButton className="close-info" label="收起科普信息" onClick={() => set({ infoOpen: false })}><Minus size={15} /></IconButton><div className="information-scroll" key={`${mode}-${selected}`}>{mode === 'interior' ? <StructureInfo /> : mode === 'body' ? <BodyInfo /> : <OverviewInfo />}</div></aside> : <IconButton className="reopen-info" label="展开科普信息" onClick={() => set({ infoOpen: true })}><BookOpen size={19} /></IconButton>}</>;
}

function SceneCaption() {
  const mode = useExplorer((s) => s.mode);
  const selected = useExplorer((s) => s.selected);
  const title = mode === 'overview' ? '向着群星，出发' : mode === 'interior' ? '光的旅程，从核心开始' : selected === 'sun' ? '恒星，亦是起点' : `${bodyById[selected].name}，近在眼前`;
  const subtitle = mode === 'overview' ? '在 3D 宇宙中，重新认识我们的家园。' : mode === 'interior' ? '选择一个结构层，追寻能量向外传递的路径。' : selected === 'sun' ? '在光的源头，开启一段旅程。' : '拖动旋转 · 滚轮缩放 · 右键平移';
  return <div className="scene-caption"><h2>{title}</h2><p>{subtitle}</p></div>;
}

function ViewControls() {
  const s = useExplorer();
  return <div className="view-controls"><div className="view-presets"><button className={s.view === 'free' ? 'selected' : ''} onClick={() => s.setView('free')} title="自由视角"><Eye size={15} /><span>自由视角</span></button><button className={s.view === 'top' ? 'selected' : ''} onClick={() => s.setView('top')} title="俯视"><Layers3 size={15} /><span>俯视</span></button><button className={s.view === 'side' ? 'selected' : ''} onClick={() => s.setView('side')} title="侧视"><Orbit size={15} /><span>侧视</span></button></div><button className="view-reset" onClick={s.resetCamera}><RotateCcw size={15} /><span>重置</span></button><button className={`flight-control ${s.cameraMode === 'fly' ? 'selected' : ''}`} aria-pressed={s.cameraMode === 'fly'} onClick={() => s.set({ cameraMode: s.cameraMode === 'fly' ? 'orbit' : 'fly' })}><Move3D size={15} /><span>{s.cameraMode === 'fly' ? '自由飞行' : '观察模式'}</span></button></div>;
}

function Timeline() {
  const paused = useExplorer((s) => s.paused);
  const speed = useExplorer((s) => s.speed);
  const scale = useExplorer((s) => s.scale);
  const set = useExplorer((s) => s.set);
  const [days, setDays] = useState(simulation.days);
  useEffect(() => { setDays(simulation.days); if(paused)return; const timer = window.setInterval(() => setDays(simulation.days), 500); return () => window.clearInterval(timer); }, [paused]);
  const date = new Date(Date.UTC(2000, 0, 1, 12) + days * 86400000);
  const dateString = `${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, '0')}.${String(date.getUTCDate()).padStart(2, '0')}`;
  return <footer className="timeline"><button className="play-button" aria-label={paused ? '恢复模拟' : '暂停模拟'} onClick={() => set({ paused: !paused })}>{paused ? <Play size={20} fill="currentColor" /> : <Pause size={19} fill="currentColor" />}</button><div className="simulation-date"><span>模拟时间 <small>UTC</small></span><output data-testid="simulation-date">{dateString}</output><IconButton label="重置模拟时间至J2000" onClick={() => { simulation.resetDays(); setDays(0); }}><RotateCcw size={13} /></IconButton></div><div className="timeline-divider" /><label className="speed-control"><span>时间流速</span><input aria-label="时间流速" title="每个前台实际秒推进的模拟天数；切到后台自动停止，返回不补跳" type="range" min="-1" max="2" step="0.01" value={Math.log10(speed)} style={{ '--range-fill': `${((Math.log10(speed) + 1) / 3) * 100}%` } as React.CSSProperties} onChange={(e) => set({ speed: Number(Math.pow(10, Number(e.target.value)).toPrecision(3)) })} /><output>{speed < 1 ? speed.toFixed(1) : speed < 10 ? speed.toFixed(1) : Math.round(speed)}<small> 天 / 秒</small></output></label><div className="timeline-divider second" /><button className="scale-notice" onClick={() => set({ helpOpen: true })}><Info size={16} /><span>{scale === 'educational' ? '科普展示比例' : '真实物理比例'}<b>·</b>简化开普勒模型<b>·</b>非实时星历</span></button></footer>;
}

function SettingsContent() {
  const s = useExplorer();
  return <><p className="dialog-intro">首次默认使用流畅模式。你可以提高画质，选择会在此设备上保留。</p><div className="settings-choice"><button className={s.quality === 'high' ? 'selected' : ''} onClick={() => s.chooseQuality('high')}><Sparkles size={19} /><strong>高画质</strong><small>精细几何 · Bloom · 更多粒子</small>{s.quality === 'high' ? <Check size={15} /> : null}</button><button className={s.quality === 'low' ? 'selected' : ''} onClick={() => s.chooseQuality('low')}><Compass size={19} /><strong>流畅模式</strong><small>降低分辨率、几何和粒子数量</small>{s.quality === 'low' ? <Check size={15} /> : null}</button></div><button className={`toggle-row ${s.orbits ? 'active' : ''}`} aria-pressed={s.orbits} onClick={() => s.set({ orbits: !s.orbits })}><Orbit size={17} /><span>显示公转轨道</span><span className="switch"><span /></span></button><button className={`toggle-row ${s.labels ? 'active' : ''}`} aria-pressed={s.labels} onClick={() => s.set({ labels: !s.labels })}>{s.labels ? <Eye size={17} /> : <EyeOff size={17} />}<span>显示三维标注</span><span className="switch"><span /></span></button><p className="dialog-footnote">集成显卡或移动设备建议使用流畅模式。实际帧率取决于设备、浏览器与显示分辨率。</p></>;
}

function HelpContent() {
  return <><p className="dialog-intro">把镜头交给好奇心。每个天体都可以近距离观察。</p><div className="help-rows"><div><span>旋转视角</span><kbd>鼠标左键拖动 / 单指拖动</kbd></div><div><span>缩放</span><kbd>滚轮 / 双指缩放</kbd></div><div><span>平移</span><kbd>鼠标右键拖动</kbd></div><div><span>暂停 / 播放</span><kbd>Space</kbd></div><div><span>返回太阳系</span><kbd>Home</kbd></div><div><span>选择天体</span><kbd>1 – 9</kbd></div><div><span>关闭对话框</span><kbd>Esc</kbd></div></div><p className="simulation-note">时间流速按每个前台实际秒推进模拟天数。切到后台自动停止，返回后不补跳；手动暂停状态保持。太阳活动与能量粒子采用独立的示意动画节奏。</p><div className="panel-section"><h2>理解这个模型</h2><p>科普展示比例分别调整天体半径和轨道间距，便于辨认；真实比例保持两者比例一致。特写会自动调整观察距离。</p><p>公转采用固定 J2000 轨道根数与恒星周期推进的简化模型；地球位置以地月质心近似。模拟日期是示意时钟，不代表精确星历。太阳剖面的大气厚度、粒子大小和能量传输时间已做示意调整。</p></div><div className="panel-section"><h2>太阳内部探索</h2><p>选择太阳 → 探索内部结构 → 点击七个结构层。跟随四步讲解，或开启「能量传递演示」自由探索核聚变、辐射扩散、对流循环，以及光球与太阳大气。再次选择同一层可取消，或使用「显示全部结构」。</p></div></>;
}

function SourcesContent() {
  return <><p className="dialog-intro">科学事实来自 NASA 等权威机构。静态影像、简化轨道与程序化模拟在应用中明确区分。</p><div className="source-list"><a href={J2000_ORBIT_SOURCE} target="_blank" rel="noreferrer"><Orbit size={20} /><span><strong>J2000 轨道根数</strong><small>NASA/JPL SSD · 固定历元近似</small></span><ExternalLink size={15} /></a><a href="https://science.nasa.gov/solar-system/" target="_blank" rel="noreferrer"><Globe2 size={20} /><span><strong>太阳系与行星事实</strong><small>NASA Science · Solar System</small></span><ExternalLink size={15} /></a><a href="https://science.nasa.gov/sun/facts/" target="_blank" rel="noreferrer"><Sun size={20} /><span><strong>太阳的物理特征</strong><small>NASA Science · Sun Facts</small></span><ExternalLink size={15} /></a><a href="https://science.nasa.gov/blogs/the-sun-spot/2023/09/26/layers-of-the-sun/" target="_blank" rel="noreferrer"><Layers3 size={20} /><span><strong>太阳七层结构</strong><small>NASA · Layers of the Sun</small></span><ExternalLink size={15} /></a><a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noreferrer"><Orbit size={20} /><span><strong>天体纹理与素材署名</strong><small>Solar System Scope · CC BY 4.0</small></span><ExternalLink size={15} /></a></div><p className="dialog-footnote">太阳动态表面、日冕、日珥、耀斑与能量粒子均为程序化科学可视化，并非实时太阳活动数据。完整数据定义、素材来源与许可证见项目 docs/SOURCES.md。</p></>;
}

function ExplorerDialog() {
  const s = useExplorer();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const active = s.settingsOpen ? 'settings' : s.helpOpen ? 'help' : s.sourcesOpen ? 'sources' : s.missionOpen ? 'mission' : null;
  const close = () => s.set({ settingsOpen: false, helpOpen: false, sourcesOpen: false, missionOpen: false });
  useEffect(() => { const dialog = dialogRef.current; if (active && !dialog?.open) dialog?.showModal(); if (!active && dialog?.open) dialog.close(); }, [active]);
  const titles = { settings: '画质与显示', help: '探索指南', sources: '科学资料与素材来源', mission: '探索任务' };
  return <dialog ref={dialogRef} className="explorer-dialog" onCancel={close} onClose={close} aria-labelledby="dialog-title">
    <div className="dialog-header">
      <div><span className="dialog-label">SOLAR ODYSSEY</span><h2 id="dialog-title">{active && titles[active]}</h2></div>
      <IconButton label="关闭对话框" onClick={close}><X size={20} /></IconButton>
    </div>
    <div className="dialog-body">
      {active === 'settings' && <SettingsContent />}
      {active === 'help' && <HelpContent />}
      {active === 'sources' && <SourcesContent />}
      {active === 'mission' && <MissionPanel close={close} />}
    </div>
    <button className="dialog-done" onClick={close}>继续探索 <ArrowRight size={16} /></button>
  </dialog>;
}

export function ExplorerUI() {
  const navOpen = useExplorer((s) => s.navOpen);
  const infoOpen = useExplorer((s) => s.infoOpen);
  const mode = useExplorer((s) => s.mode);
  const layout = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = layout.current;
    if (!node) return;
    let wasNarrow = false;
    const observer = new ResizeObserver(([entry]) => {
      const narrow = entry.contentRect.width <= 760;
      if (narrow && !wasNarrow) useExplorer.getState().set({ navOpen: false, infoOpen: false });
      wasNarrow = narrow;
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      const state = useExplorer.getState();
      state.set({ settingsOpen: false, helpOpen: false, sourcesOpen: false, missionOpen: false });
    };
  }, []);
  return <div ref={layout} className={`explorer-ui ${navOpen ? 'nav-open' : 'nav-closed'} ${infoOpen ? 'info-open' : 'info-closed'} mode-${mode}`}><Header /><Navigation /><div className="scene-interface" role="region" aria-label="三维场景控制"><Breadcrumb /><SceneCaption /><ViewControls /></div><InformationPanel /><Timeline /><ExplorerDialog /></div>;
}
