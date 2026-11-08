import type { SolarLayerId } from './astronomy';
import type { EnergyStage } from '../scene/solarEnergy';

export interface SolarLesson {
  title: string;
  stage: EnergyStage;
  primaryLayer: SolarLayerId;
  layers: readonly SolarLayerId[];
  explanation: string;
  animation: string;
  source: string;
}

export const solarLessons: readonly SolarLesson[] = [
  {
    title: '核心聚变', stage: 'fusion', primaryLayer: 'core', layers: ['core'],
    explanation: '太阳核心的高温高压使氢核通过质子—质子链逐步形成氦核，释放能量与中微子。太阳是等离子体，并不是燃烧的固体。',
    animation: '聚拢的亮点表示反应物，随后出现氦核与能量波；中间反应步骤已省略。',
    source: 'https://solarscience.msfc.nasa.gov/interior.shtml',
  },
  {
    title: '辐射扩散', stage: 'radiative', primaryLayer: 'radiative', layers: ['radiative'],
    explanation: '能量在辐射区被反复吸收、再发射与散射。局部路径可以回折，许多相互作用共同形成缓慢的向外扩散。',
    animation: '曲折亮线和沿线光点表示扩散机制；几秒钟的演示不等于真实输运时间，也不追踪一个真实光子。',
    source: 'https://solarscience.msfc.nasa.gov/interior.shtml',
  },
  {
    title: '对流循环', stage: 'convective', primaryLayer: 'convective', layers: ['convective'],
    explanation: '较热的等离子体上升，在接近光球时膨胀、冷却，再向下沉降。循环搬运能量，也形成太阳表面的米粒组织。',
    animation: '暖色表示上升段，冷色表示下沉段；流线构成闭合循环，并非全部向外的光子射线。',
    source: 'https://solarscience.msfc.nasa.gov/interior.shtml',
  },
  {
    title: '光球辐射与太阳大气', stage: 'atmosphere', primaryLayer: 'photosphere',
    layers: ['photosphere', 'chromosphere', 'transition', 'corona'],
    explanation: '可见光从光球向外辐射；磁场塑造日冕环，部分日冕气体向外形成太阳风。高温日冕还会向较冷的低层大气传导热量。',
    animation: '观察向外的光点、弯曲磁环、向下热传导与太阳风的区别。太阳大气不是单向接力，日冕加热仍有未解问题。',
    source: 'https://solarscience.msfc.nasa.gov/t_region.shtml',
  },
];
