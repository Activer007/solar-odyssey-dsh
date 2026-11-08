# 科学数据与素材来源

核查日期：2026-10-27。应用中的天文参数取适合科普的近似值；这不是导航、观测规划或实时空间天气服务。

## 科学参数

- [NASA NSSDCA Planetary Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/)：行星温度、恒星公转周期、自转轴倾角和自转资料。
- [NASA/JPL SSD — Approximate Positions of the Planets, Table 1](https://ssd.jpl.nasa.gov/planets/approx_pos.html)：固定 J2000.0 的半长轴、偏心率、倾角、平黄经、近日点黄经与升交点黄经。代码唯一来源为 `src/data/j2000Elements.ts`。
- [Fact Sheet Notes](https://nssdc.gsfc.nasa.gov/planetary/factsheet/planetfact_notes.html)：参数定义。
- 体积平均半径与恒星公转周期使用各天体的独立事实表：[太阳](https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html)、[水星](https://nssdc.gsfc.nasa.gov/planetary/factsheet/mercuryfact.html)、[金星](https://nssdc.gsfc.nasa.gov/planetary/factsheet/venusfact.html)、[地球](https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html)、[火星](https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html)、[木星](https://nssdc.gsfc.nasa.gov/planetary/factsheet/jupiterfact.html)、[土星](https://nssdc.gsfc.nasa.gov/planetary/factsheet/saturnfact.html)、[天王星](https://nssdc.gsfc.nasa.gov/planetary/factsheet/uranusfact.html)、[海王星](https://nssdc.gsfc.nasa.gov/planetary/factsheet/neptunefact.html)。均为 NASA Goddard / NSSDCA，作者 David R. Williams。
- [NASA Solar System](https://science.nasa.gov/solar-system/) 及对应天体主题页：中文科普内容的事实依据，中文文本为本项目原创摘要。

### 定义和限制

1. `radiusKm` 是**体积平均半径**，不是赤道半径。气态、冰巨星的参考外形取约 1 bar 气压层；它们没有可供站立的固体表面。
2. `distanceAU` 是日心轨道半长轴的近似值，不是当下距离。1 AU = 149,597,870.7 km。轨道周期使用独立事实表中的恒星公转周期，与综合表中的回归年周期略有差异。
3. 类地行星温度是全球地表平均值，不能代表某个地点或时刻。木星、土星、天王星和海王星的温度是 **1 bar 大气层**代表值；不称为“地表温度”。太阳采用 5772 K 有效温度。
4. 自转为相对恒星的周期；金星与天王星为逆行。天王星 97.77°、金星 177.4° 使用完整轴倾角约定。若模型已经应用大于 90° 的倾角，不应再把自转负号重复应用。巨行星差异自转，自转参数依测量体系而异，土星使用约数。
5. 太阳采用差异自转：赤道约 25 地球日，极区约 36 地球日。`rotationHours = 609.12` 是 NASA 在约 16° 纬度采用的代表值。
6. 轨道采用 JPL Table 1 的固定 J2000.0 六参数，再按 NSSDCA 恒星公转周期推进。该混合近似省略世俗变化、摄动及长期演化，**不提供指定日期的真实星历**，不能沿用 JPL 完整随时间变化算法的 1800–2050 年误差界。
7. 科普比例压缩距离并放大天体。真实比例模式使用一致的距离与半径换算，天体会很小；选中后可进入特写。标注和交互命中区域可保持可用大小，它们不是物理直径。

### 轨道历元、方位与坐标

历元为 J2000.0，JD 2451545.0（TDB），参考平面是 J2000 平黄道，零方向为 J2000 平春分点。`a` 单位 AU，偏心率 `e` 无量纲，倾角 `I`、平黄经 `L`、近日点黄经 `ϖ` 和升交点黄经 `Ω` 以度保存，计算时统一转弧度。近日点幅角 `ω = ϖ − Ω`，初始平近点角 `M₀ = L − ϖ`；之后以 `2π × days / periodDays` 推进，解开普勒方程并依次旋转近日点、倾角、升交点。轨道线与天体位置共用同一函数。

黄道坐标 `(X,Y,Z)` 通过绕 X 轴 −90° 的旋转变为 Three.js 世界坐标 `(X,Z,−Y)`，保持右手系，正公转角从世界 +X 指向 −Z，轨道北极为 +Y。这是本项目的坐标约定。game01 的简单 `(X,Z,Y)` 交换属于反射，因此未直接照搬；以合成方向、升交点及叉积测试独立核查。

JPL 的 Earth 行实际上为 Earth/Moon Barycenter；本项目以地月质心近似地球轨道，不模拟地心相对质心的月周期运动。物理半径仍为地球半径。模拟日期采用 UTC 样式的示意时钟，未做 UTC↔TDB 的精密换算，不用于观测规划。

## 太阳结构与能量

- [NASA Sun Facts](https://science.nasa.gov/sun/facts/)：等离子体、核聚变、差异自转、太阳大气、磁场活动、太阳风。
- [NASA Layers of the Sun](https://science.nasa.gov/blogs/the-sun-spot/2023/09/26/layers-of-the-sun/)：七个教学区域与色球温度。
- [NASA Marshall — The Solar Interior](https://solarscience.msfc.nasa.gov/interior.shtml)：核心约内侧 25% 半径，辐射区，对流区约外侧 30%，质子—质子链。
- [NASA Marshall — Transition Region](https://solarscience.msfc.nasa.gov/t_region.shtml)：色球与日冕之间的不规则薄层，温度急变及由日冕向下的热传导。
- [NASA Marshall — Corona](https://solarscience.msfc.nasa.gov/corona.shtml)：百万度量级日冕与磁结构。
- [NASA Sun Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html)：太阳平均半径 695,700 km、5772 K 有效温度、约 500 km 光球厚度、约 2500 km 色球厚度。

剖面是可旋转的三维几何教学模型，**不是太阳内部照片**。层界面使用简化球面；真实太阳大气并不由规则硬壳组成。光球、色球、过渡区和日冕的厚度、层间空隙与颜色为便于理解而放大或编码；它们不能用于测量。

核聚变粒子、辐射扩散示意路径、对流循环、光子外射、日冕流线与太阳风均为**程序生成的科学可视化模拟**。动画压缩真实时间，省略反应中间过程，不追踪真实光子，不是磁流体数值模拟或实时卫星数据。辐射扩散时间高度依赖模型；不把动画的几秒钟当成太阳真实传输时间。太阳大气中也存在向下热传导，不能把全部能量过程理解为单向传递。

### 本轮统一的教学尺度

`src/data/solarStructure.ts` 是层名称、颜色、显示内外径、科学位置及来源的唯一数据源。显示半径是无量纲教学坐标，不能直接读作太阳实际半径：

| 区域 | 科学位置或定义 | 教学显示内–外半径 |
| --- | --- | --- |
| 核心 | 中心至约 0.25 R☉ | 0–0.25 |
| 辐射区 | 约 0.25–0.70 R☉ | 0.25–0.70 |
| 对流区 | 约 0.70–1.00 R☉ | 0.70–0.93 |
| 光球 | 可见表面附近，约 500 km 厚 | 0.93–1.00 |
| 色球 | 光球上方，约 2500 km 厚 | 1.00–1.027，薄红边 |
| 过渡区 | 很薄且不规则的温度急变区 | 1.027–1.067，紫色带 |
| 日冕 | 延伸的外部大气 | 1.067–1.48，白色羽流逐渐淡出 |

对流区的科学半径 0.70–1.00 R☉ 按层内位置线性映射至显示半径 0.70–0.93，给放大的薄层留出空间；0.93 不是科学边界。大气层不填造固定的科学半径范围。几何、标签、选择和能量路径都使用该显示映射；所有层仍是教学分区，真实太阳没有七个硬壳。

四步讲解分别表现核心聚变、辐射扩散、对流循环、光球辐射与太阳大气。辐射路径含局部回折；对流以暖色上升、冷色下沉构成闭环。最后一步区分外射光、磁环、日冕向低层大气的热传导及向外的部分太阳风。路径与粒子大小、颜色、速度及反应过程均为示意；光和风在教学模型边缘之外的路径也不代表日冕真实边界。模型展开时隐藏能量路径，避免路径脱离对应层。

## 本地纹理 / 署名

**Textures by Solar System Scope / INOVE, based on NASA imagery and elevation data. Licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).**

原始作品与许可：[Solar System Scope — Solar Textures](https://www.solarsystemscope.com/textures/)。项目保留作品名、作者、原始链接和许可链接。图像未经本项目重新绘制；球面映射、色彩管理、光照、透明度及屏幕显示构成展示处理。CC BY 4.0 允许复制、分享与改编，包括商业用途，前提是提供适当署名与许可链接，并注明修改。

原站通过当前下载环境返回 403，实际文件于核查日下载自 [Simple Space Data Mirror](https://www.simplespacedata.org/) 的 Solar System Scope 镜像。下载 URL 格式为 `https://www.simplespacedata.org/texture/solarsystemscope/<kind>/latest/<filename>`；`kind` 为文件名去掉 `2k_` 与扩展名。原始 URL 为 `https://www.solarsystemscope.com/textures/download/<filename>`。镜像不是科学来源，图像作者与许可仍为 Solar System Scope / INOVE。

| 本地文件（`public/textures/`） | 内容 | 尺寸 | SHA-256 |
| --- | --- | --- | --- |
| `2k_mercury.jpg` | 水星地表静态合成 | 2048×1024 | `5a5c80607f643496bac9a631e71957def35ed788895f18b678ac849c2b38e48a` |
| `2k_venus_atmosphere.jpg` | 金星云层静态合成 | 2048×1024 | `225012ad4911730605c4e189ca2a3bf674fce50cc48aab4102b936b47d6991ac` |
| `2k_earth_daymap.jpg` | 地球日间静态合成 | 2048×1024 | `767ee1dc6eb3802699bfccf6f264880f8acd0b80de3191cd24984fe279b07b7c` |
| `2k_earth_nightmap.jpg` | 地球夜间灯光静态合成 | 2048×1024 | `c16fd1bc096ab91a5c5265c6ff9847c43f489f2e2ee790ccdbcbd03251cf3a5a` |
| `2k_earth_clouds.jpg` | 地球云层静态合成 | 2048×1024 | `fffd7f68d41b37274822150e54a6ef605af1d3ec35624d9f628c3b896bfa42ed` |
| `2k_mars.jpg` | 火星地表静态合成 | 2048×1024 | `2d187f3e77a98eaa8cea5f4cc722f633c122ef170b9e94ace6b5fb6cbc3f8e01` |
| `2k_jupiter.jpg` | 木星云带静态合成 | 2048×1024 | `b0f04d005350252636b0e3396fc592548cbd9e9126b269d32d5c6abd4b0e4f2b` |
| `2k_saturn.jpg` | 土星云层静态合成 | 2048×1024 | `54a900ca9bf7ab62e70f862852759abdf342e6d6436a95a2fe9ebdb6bcd3bbac` |
| `2k_saturn_ring_alpha.png` | 土星环径向颜色与透明度 | 2048×125 | `4b0644b2f3ef259fd0bfaedd9dc52f9e7d9738f65f50363e8c4dd19f650d7334` |
| `2k_uranus.jpg` | 天王星大气静态合成 | 2048×1024 | `d15239d46f82d3ea13d2b260b5b29b2a382f42f2916dae0694d0387b1204a09d` |
| `2k_neptune.jpg` | 海王星大气静态合成 | 2048×1024 | `cb42ea82709741d28b0af44d8b283cbc6dbd0c521a7f0e1e1e010ade00977df6` |

总资源大小约 4.35 MiB。已通过图像解码和尺寸检查。所有图像以项目本地资源提供，应用运行时不向纹理站发送请求。

机器可读清单为 `docs/assets-manifest.json`，记录作者、许可、原始来源、实际镜像下载地址、内容、尺寸、字节数及 SHA-256。现有 11 个文件共 4,567,190 字节；本轮未替换或重新下载纹理。`npm run assets:verify` 检查缺失、多余、大小及哈希；`npm run assets:manifest` 先核对本表的历史哈希才生成清单，避免重生成掩盖文件变化。`npm run assets:download` 仅补缺文件，下载内容必须匹配已提交清单，已有文件不会被覆盖。镜像的 `latest` 路径可能改变，因此不能仅凭 URL 同名接受新内容。

### 观测图像、静态合成与程序效果的区别

- 这些行星贴图是根据 NASA 数据整理的**静态球面合成纹理**，不是某一天的一张完整拍摄图。Solar System Scope 说明部分未测区域以一致的虚构地形补齐，色彩略作增强。
- 地球云层的自转、海王星风暴的固定位置和其他动态表现是教学处理，不代表即时天气或永久地貌。海王星的蓝色经过增强。
- 地球大气辉光、太阳黑子、颗粒、日珥、耀斑、日冕、星空及能量粒子均为程序效果；太阳界面不使用一张贴图冒充动态太阳。
- 本应用不使用 NASA 标志，不暗示 NASA 或图像作者为本项目背书。
