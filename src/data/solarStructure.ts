/** One teaching model shared by geometry, labels, selection and energy paths. */
export type SolarLayerId = 'core' | 'radiative' | 'convective' | 'photosphere' | 'chromosphere' | 'transition' | 'corona';

export interface SolarLayer {
  id: SolarLayerId;
  name: string;
  enName: string;
  color: string;
  /** Normalized teaching coordinates; atmospheric thickness is exaggerated. */
  displayInner: number;
  displayOuter: number;
  displayNote: string;
  /** Fraction of the scientific solar radius, only where a simple range applies. */
  scientificRadius: readonly [number, number] | null;
  position: string;
  temperature: string;
  role: string;
  description: string;
  energy: string;
  source: string;
}

const layersSource = 'https://science.nasa.gov/blogs/the-sun-spot/2023/09/26/layers-of-the-sun/';
const interiorSource = 'https://solarscience.msfc.nasa.gov/interior.shtml';

export const solarLayers: readonly SolarLayer[] = [
  {
    id: 'core', name: '核心区', enName: 'Core', color: '#fff0ae',
    displayInner: 0, displayOuter: .25, scientificRadius: [0, .25],
    displayNote: '模型半径 0–0.25，保留核心约占太阳内侧 25% 半径的关系；核心按实心区域显示。',
    position: '中心至约 0.25 R☉', temperature: '中心约 1500 万 °C', role: '核聚变释放能量',
    description: '高温高压下，氢核通过核聚变（质子—质子链）形成氦，少量质量转化为能量。太阳是等离子体，不是燃烧的固体。',
    energy: '4 个氢核最终形成 1 个氦核，并释放能量与中微子。动画省略反应中间步骤。', source: interiorSource,
  },
  {
    id: 'radiative', name: '辐射区', enName: 'Radiative Zone', color: '#f4bd58',
    displayInner: .25, displayOuter: .7, scientificRadius: [.25, .7],
    displayNote: '模型半径 0.25–0.70，对应科学位置约 0.25–0.70 R☉；折线只表达辐射扩散机制。',
    position: '约 0.25–0.70 R☉', temperature: '向外由约 700 万降至 200 万 °C', role: '辐射扩散向外输运能量',
    description: '光子不断与等离子体相互作用，能量通过辐射扩散向外传递。这里的曲折路径代表多次散射与吸收、再发射。',
    energy: '真实扩散需要极长时间；演示中几秒的运动仅表达辐射扩散概念，并非真实传播速度。', source: interiorSource,
  },
  {
    id: 'convective', name: '对流区', enName: 'Convective Zone', color: '#ed7d39',
    displayInner: .7, displayOuter: .93, scientificRadius: [.7, 1],
    displayNote: '科学位置约 0.70–1.00 R☉，线性映射到模型半径 0.70–0.93，为放大的光球和大气层留出展示空间；0.93 不是科学边界。',
    position: '约 0.70–1.00 R☉ · 外侧约 20 万 km', temperature: '底部约 200 万 °C，向外降低', role: '热等离子体上升、冷却后下沉',
    description: '热等离子体上升，在表面附近冷却后下沉。循环运动把能量带向光球，也塑造了可见的米粒组织。',
    energy: '流体运动承担主要能量输运；橙色上升与蓝色下沉共同组成对流循环，不是流体数值模拟。', source: interiorSource,
  },
  {
    id: 'photosphere', name: '光球层', enName: 'Photosphere', color: '#ffc66a',
    displayInner: .93, displayOuter: 1, scientificRadius: null,
    displayNote: '模型半径 0.93–1.00 是放大的可见表面教学带；该厚度不按真实约 500 km 的物理比例绘制。',
    position: '可见表面附近 · 厚度约 500 km', temperature: '有效温度 5772 K · 约 5500 °C', role: '大部分可见光从这里逸出',
    description: '太阳的大部分可见光由此逸出。黑子较周围更冷、因而显暗；明暗颗粒反映下方对流活动。',
    energy: '可见光向太空辐射，从太阳到地球平均约需 8 分 20 秒。', source: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html',
  },
  {
    id: 'chromosphere', name: '色球层', enName: 'Chromosphere', color: '#e46b63',
    displayInner: 1, displayOuter: 1.055, scientificRadius: null,
    displayNote: '模型半径 1.00–1.055 为显著放大的教学带，不代表真实色球厚度；真实大气并非规则硬壳。',
    position: '光球之上 · 厚度约 2500 km', temperature: '约 6000–20000 °C · 随高度变化', role: '磁场、波动与等离子体相互作用',
    description: '稀薄、起伏不平的大气层。氢的红色谱线令它在日全食边缘呈现红色，针状体等结构在这里十分活跃。',
    energy: '磁场与波动参与向上输运能量。层色为教学编码，不能视为肉眼连续光下的真实色彩。', source: layersSource,
  },
  {
    id: 'transition', name: '过渡区', enName: 'Transition Region', color: '#ad8cf0',
    displayInner: 1.055, displayOuter: 1.105, scientificRadius: null,
    displayNote: '模型半径 1.055–1.105 夸张显示很薄且不规则的温度过渡带，不能据此推算实际厚度。',
    position: '色球与日冕之间 · 很薄且不规则', temperature: '约 2 万至 100 万 °C · 急剧升高', role: '连接较冷色球与炽热日冕',
    description: '温度在很短距离内迅速变化，连接较冷的色球与炽热日冕。科学家常用紫外谱线研究这一区域。',
    energy: '热量可由高温日冕向下传导；太阳大气的能量过程并非单向向外的简单接力。', source: 'https://solarscience.msfc.nasa.gov/t_region.shtml',
  },
  {
    id: 'corona', name: '日冕', enName: 'Corona', color: '#84c3f3',
    displayInner: 1.105, displayOuter: 1.22, scientificRadius: null,
    displayNote: '模型半径 1.105–1.22 仅为日冕示意范围；外缘不是日冕的真实终点，太阳风仍继续向外流动。',
    position: '最外层大气 · 延伸数百万 km', temperature: '典型约 100–200 万 °C', role: '磁结构、热传导与太阳风',
    description: '极稀薄却炽热的外大气，形成环、羽流与冕洞。日冕加热机制仍是研究课题，不能用距核心远近简单解释。',
    energy: '磁场活动塑造日冕结构；部分日冕物质流向行星际空间，形成太阳风。', source: 'https://solarscience.msfc.nasa.gov/corona.shtml',
  },
];

export const solarLayerById = Object.fromEntries(solarLayers.map(layer => [layer.id, layer])) as Record<SolarLayerId, SolarLayer>;

/** A layer-relative fraction maps to its teaching radius, never an atmospheric measurement. */
export function displayRadius(id: SolarLayerId, fraction: number): number {
  if (!Number.isFinite(fraction)) throw new RangeError('Solar layer fraction must be finite');
  const layer = solarLayerById[id];
  return layer.displayInner + (layer.displayOuter - layer.displayInner) * Math.max(0, Math.min(1, fraction));
}
