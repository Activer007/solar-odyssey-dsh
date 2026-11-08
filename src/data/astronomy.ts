import { j2000Elements, type J2000OrbitalElements, type OrbitingBodyId } from './j2000Elements';
import { texturePath } from './texturePath';

/** NSSDCA physical facts and fixed JPL J2000 orbital geometry. */
export type BodyId = 'sun' | OrbitingBodyId;

export interface BodyData {
  id: BodyId;
  name: string;
  enName: string;
  type: string;
  /** Volumetric mean radius, kilometres; gas/ice giant reference is the 1 bar level. */
  radiusKm: number;
  /** Semimajor axis in astronomical units, not the instantaneous distance. */
  distanceAU: number;
  rotation: string;
  /** Signed sidereal hours (retrograde negative); do not double-apply with >90° axial tilt. */
  rotationHours: number;
  /** Approximate sidereal orbital period, Earth days. Zero means not applicable. */
  periodDays: number;
  temperature: string;
  description: string;
  features: string[];
  color: string;
  texture?: string;
  source: string;
  /** Shared canonical JPL Table 1 epoch values; absent for the Sun. */
  orbit?: Readonly<J2000OrbitalElements>;
  /** Degrees; Venus and Uranus use the complete >90° convention. */
  axialTilt: number;
}

const fact = (id: string) => `https://nssdc.gsfc.nasa.gov/planetary/factsheet/${id}fact.html`;
const texture = (name: string) => texturePath(`2k_${name}.jpg`);

export const bodies: BodyData[] = [
  {
    id: 'sun', name: '太阳', enName: 'Sun', type: 'G2 V 型主序星',
    radiusKm: 695700, distanceAU: 0, rotation: '约 25–36 地球日 · 差异自转', rotationHours: 609.12,
    periodDays: 0, temperature: '5772 K · 有效温度',
    description: '太阳是由引力维系的炽热等离子体。核心的氢核聚变持续释放能量，经辐射与对流传向外部，最终照亮太阳系。',
    features: ['核心核聚变为太阳供能', '黑子、日珥与耀斑关联磁场活动', '没有固体表面；光球层发出大部分可见光'],
    color: '#f6a54b', source: fact('sun'), axialTilt: 7.25,
  },
  {
    id: 'mercury', name: '水星', enName: 'Mercury', type: '类地行星',
    radiusKm: 2439.7, distanceAU: j2000Elements.mercury.semiMajorAxisAU, rotation: '58.65 地球日', rotationHours: 1407.6,
    periodDays: 87.969, temperature: '167 °C · 地表平均',
    description: '水星最接近太阳。稀薄的外逸层几乎无法留住热量，遍布撞击坑的岩石表面经历剧烈昼夜温差。',
    features: ['岩石地表保存大量撞击坑', '自转与公转形成 3:2 共振', '极区永久阴影中存在水冰'],
    color: '#aaa49b', texture: texture('mercury'), source: fact('mercury'),
    orbit: j2000Elements.mercury, axialTilt: 0.034,
  },
  {
    id: 'venus', name: '金星', enName: 'Venus', type: '类地行星',
    radiusKm: 6051.8, distanceAU: j2000Elements.venus.semiMajorAxisAU, rotation: '243.02 地球日 · 逆行', rotationHours: -5832.5,
    periodDays: 224.701, temperature: '464 °C · 地表平均',
    description: '金星的二氧化碳大气产生强烈温室效应。浓密的硫酸云遮蔽地表，从太空看去呈现明亮的云层外观。',
    features: ['可见外观是浓密云顶，并非岩石地表', '地表气压约为地球的 92 倍', '缓慢逆行自转，一次自转长于一年'],
    color: '#dec49a', texture: texture('venus_atmosphere'), source: fact('venus'),
    orbit: j2000Elements.venus, axialTilt: 177.4,
  },
  {
    id: 'earth', name: '地球', enName: 'Earth', type: '类地行星',
    radiusKm: 6371, distanceAU: j2000Elements.earth.semiMajorAxisAU, rotation: '23.93 小时 · 恒星日', rotationHours: 23.9345,
    periodDays: 365.256, temperature: '15 °C · 地表平均',
    description: '液态海洋、适宜的大气与磁场共同塑造了这颗蓝色星球。它是目前唯一已知存在生命的天体，也是人类的共同家园。',
    features: ['海洋覆盖约 71% 的地表', '独立云层与昼夜交界', '夜间灯光是静态合成图，不代表实时用电'],
    color: '#71a8c9', texture: texture('earth_daymap'), source: fact('earth'),
    orbit: j2000Elements.earth, axialTilt: 23.44,
  },
  {
    id: 'mars', name: '火星', enName: 'Mars', type: '类地行星',
    radiusKm: 3389.5, distanceAU: j2000Elements.mars.semiMajorAxisAU, rotation: '24.62 小时', rotationHours: 24.6229,
    periodDays: 686.98, temperature: '−65 °C · 地表平均',
    description: '含铁矿物氧化，让火星披上红色外衣。巨型火山、峡谷与古老河道记录了这颗寒冷行星漫长的地质历史。',
    features: ['奥林帕斯山是巨大的盾状火山', '水手号峡谷横跨数千千米', '稀薄的二氧化碳大气与两极冰盖'],
    color: '#c97956', texture: texture('mars'), source: fact('mars'),
    orbit: j2000Elements.mars, axialTilt: 25.19,
  },
  {
    id: 'jupiter', name: '木星', enName: 'Jupiter', type: '气态巨行星',
    radiusKm: 69911, distanceAU: j2000Elements.jupiter.semiMajorAxisAU, rotation: '约 9.93 小时 · System III', rotationHours: 9.925,
    periodDays: 4332.589, temperature: '−110 °C · 1 bar 大气层',
    description: '太阳系最大的行星以氢与氦为主。快速自转与强烈大气运动形成明暗相间的云带，大红斑则是一场持续已久的巨大风暴。',
    features: ['云带由不同方向的高速气流分隔', '大红斑为巨大反气旋风暴', '没有可站立的固体表面'],
    color: '#c0a080', texture: texture('jupiter'), source: fact('jupiter'),
    orbit: j2000Elements.jupiter, axialTilt: 3.13,
  },
  {
    id: 'saturn', name: '土星', enName: 'Saturn', type: '气态巨行星',
    radiusKm: 58232, distanceAU: j2000Elements.saturn.semiMajorAxisAU, rotation: '约 10.7 小时 · 近似', rotationHours: 10.7,
    periodDays: 10755.699, temperature: '−140 °C · 1 bar 大气层',
    description: '土星醒目的环主要由水冰颗粒与少量岩石组成。环并非整块薄板，而是无数独立绕行颗粒构成的宽阔体系。',
    features: ['A、B、C 环与卡西尼缝', '冰粒组成的环绕赤道展开', '气态行星自转周期依测量体系而异'],
    color: '#d6c39b', texture: texture('saturn'), source: fact('saturn'),
    orbit: j2000Elements.saturn, axialTilt: 26.73,
  },
  {
    id: 'uranus', name: '天王星', enName: 'Uranus', type: '冰巨星',
    radiusKm: 25362, distanceAU: j2000Elements.uranus.semiMajorAxisAU, rotation: '约 17.24 小时 · 逆行', rotationHours: -17.24,
    periodDays: 30685.4, temperature: '−195 °C · 1 bar 大气层',
    description: '天王星的自转轴几乎躺在公转轨道平面上，带来极端漫长的季节。大气中的甲烷吸收红光，使其呈现青蓝色。',
    features: ['约 97.8° 的特殊自转轴倾角', '含水、氨和甲烷的高压内部', '淡青蓝大气与暗淡环系'],
    color: '#9dd6d7', texture: texture('uranus'), source: fact('uranus'),
    orbit: j2000Elements.uranus, axialTilt: 97.77,
  },
  {
    id: 'neptune', name: '海王星', enName: 'Neptune', type: '冰巨星',
    radiusKm: 24622, distanceAU: j2000Elements.neptune.semiMajorAxisAU, rotation: '约 16.11 小时', rotationHours: 16.11,
    periodDays: 60189.018, temperature: '−200 °C · 1 bar 大气层',
    description: '遥远的海王星有活跃的大气与极强的风。旅行者 2 号记录的暗斑属于会演化的风暴，并非永久固定的地表特征。',
    features: ['甲烷大气与高速风暴', '暗斑是大气现象，会出现与消散', '蓝色纹理经过视觉增强；并非实时观测'],
    color: '#5d83cf', texture: texture('neptune'), source: fact('neptune'),
    orbit: j2000Elements.neptune, axialTilt: 28.32,
  },
];

export const bodyById = Object.fromEntries(bodies.map((body) => [body.id, body])) as Record<BodyId, BodyData>;

export { solarLayers, solarLayerById, displayRadius } from './solarStructure';
export type { SolarLayerId, SolarLayer } from './solarStructure';

export const scienceNotice = '固定 J2000 轨道根数与恒星周期推进的混合近似，省略摄动及长期变化；地球轨道以地月质心近似，并非实时星历。太阳活动及能量动画均为科学可视化模拟。';
export const textureCredit = '行星纹理：Solar System Scope / INOVE，NASA 数据衍生，CC BY 4.0。静态合成与增强色彩，非实时观测。';
