# Solar Odyssey · 太阳系探索计划

一个可安装到 DeepSeek Harness 的中文 3D 科普游戏。保留 `game02` 的太阳系全景、八大行星、太阳七层剖面、四步「能量的旅程」、时间控制和画质选项。右上角的「探索任务」把课程、地球夜面和土星观察串成一次任务，完成三项观察后解锁一道科普题。画质和任务进度保存在当前浏览器或桌面环境的本地存储中。

## 构建与安装

需要 Node.js 22.12+、npm 和支持 WebGL 2 的浏览器或桌面环境。

```powershell
npm ci
npm pack
```

在 DSH 的「插件」页安装生成的 `local-solar-odyssey-1.0.0.tgz`。开发时也可以先运行 `npm run build:dsh`，然后使用 Creator Mode 的 `plugin_manager`，选择 `install_bundle` 并传入项目绝对目录。安装后从侧栏打开「太阳系探索计划」（英文外壳显示 Solar Odyssey）。如果管理器返回 `restart-required`，重启相应 profile 后再打开。Web CLI 的等效操作如下。

```powershell
dsh plugin --profile web add ./local-solar-odyssey-1.0.0.tgz
dsh --profile web
```

插件也保留独立预览入口。使用 `npm run dev` 启动，或用 `npm run build:preview` 生成独立站点产物。独立站点的 `dist/` 与 DSH 使用的 `lib/` 分开。

## 项目结构

- `src/dsh-panel.js` 向 DSH 注册侧栏入口与 `main` 面板。面板使用宿主 React，通过 Client loader 延迟获取游戏 chunk。
- `src/dsh-game.tsx` 在面板内启动独立的 React 19 / React Three Fiber 根。Shadow DOM 隔离原游戏样式，退出面板时卸载游戏根和 WebGL 场景。主视图的尺寸和键盘焦点由面板决定。
- `src/scene/`、`src/simulation/` 和 `src/data/` 保留原来的渲染、轨道与科普数据。`src/state/mission.ts` 记录观察与问答进度。
- `scripts/build-dsh.mjs` 输出 DSH factory、游戏 chunk 和按内容版本化的纹理。支持 `require.asset` 的 DSH 按需加载纹理文件。缺少该接口的早期桌面版使用随包的纹理 chunk。安装包内已经编译渲染依赖，游玩无需模型 API 或外部素材服务器。

## 验证

```powershell
npm test
npm run assets:verify
npm run build:dsh
```

集成时可按「侧栏入口 → 探索任务 → 四步太阳课程 → 地球夜面 → 土星 → 科普问答」走通主流程。切回聊天再打开游戏，任务进度应保留。按键应只在游戏场景获得焦点时生效。安装包中的 `docs/assets-manifest.json` 对应源码纹理；构建后会为文件名附加内容摘要，文件字节保持一致。

## 科学说明与素材署名

公转采用固定 J2000 根数和简化模型，日期用于示意。太阳剖面、能量粒子和时间尺度经过教学调整。天体纹理由 Solar System Scope / INOVE 基于 NASA 图像和高程资料制作，采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。纹理在游戏中经过球面映射和光照处理。逐文件来源与科学依据见 [资料来源](docs/SOURCES.md) 和 [素材清单](docs/assets-manifest.json)。
