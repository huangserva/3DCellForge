# 3D Model Studio

[English](README.md) | [中文](README.zh-CN.md)

AI 驱动的交互式 3D 模型生成、检查和演示工作台。

3D Model Studio 是一个 React + Three.js 原型，用于把上传图片或 GLB 文件变成可交互的 3D 模型工作区。它支持 WebGL 拖拽旋转、滚轮缩放、左侧模型库 / 中央 3D 舞台 / 右侧工具区、截图、GLB 导出、历史上传默认收起、Demo 演示模式、生成队列，以及通过 Hyper3D / Tripo / Fal.ai / Atlas Cloud / Hunyuan3D / JS Depth / 本地模型导入生成或加载 3D 模型。

## 演示视频

[![3D Model Studio 演示视频](docs/demo/3DCellForge-demo-cover.jpg)](docs/demo/3DCellForge-demo-2026-05-10.mp4)

打开视频文件：[演示 MP4](docs/demo/3DCellForge-demo-2026-05-10.mp4)

## 功能

- 基于 React Three Fiber 的交互式模型查看器。
- 三栏工作台：左侧 Model Library，中间 WebGL 主舞台，右侧素材和生成工具。
- 支持拖拽旋转、滚轮缩放、结构隔离、部件 Inspect 和场景导出。
- 对象级说明面板会根据资产名称和生成元数据推断类别、来源、Provider 状态、材质重点、演示价值和标签，覆盖车辆、飞机、船舰、产品、文物和有机标本。
- 模型质量评分会展示 GLB 文件大小、三角面数、贴图数量和演示可用性。
- Demo Mode 会隐藏左右工具区、根据物体类型使用不同运镜，并显示干净的演示信息层，适合截图和录屏。
- Model Library 抽屉升级为资产库视图，包含源图预览、Provider / 状态、任务 ID、GLB URL 操作、Provider 对比和删除入口。
- Saved Assets 默认收起，当前激活的生成 / 导入资产会固定显示并可直接点击打开。
- 生成 / 导入成功的模型会写入 IndexedDB，刷新页面后会自动恢复；localStorage 只做轻量兜底。
- 自定义上传记录支持删除，并同步清理相关本地数据。
- 通用部件详情抽屉、素材参考、对比面板、模型笔记、图库操作、日志、项目保存和生成队列。
- 支持 Hyper3D、Tripo、Fal.ai、Atlas Cloud、Hunyuan3D、JS Depth 和 Local GLB 多种模式。
- 生成后的 GLB 会缓存到本地，方便后续演示和截图。
- 内置 Khronos glTF 辅助参考模型，用于检查 GLB 加载和 PBR 材质表现。
- API Key 只放在服务端 `.env.local`，不会暴露到前端包里。

## 技术栈

- React
- Vite
- Three.js
- React Three Fiber
- Drei
- Framer Motion
- Tripo API 可选后端
- Fal.ai 可选后端
- Hunyuan3D 本地 API 可选后端

## 快速开始

```bash
npm install
npm run dev
```

打开终端里显示的 Vite 地址即可。

## 工作台流程

默认页面会尽量减少干扰：

- 左侧 `Model Library` 固定展示当前激活的生成 / 导入资产。
- 更早生成、导入过的模型会收进 `Saved Assets`，默认折叠。
- 右侧 `Asset Source` 用来选择生成模式或导入本地 `.glb` / `.gltf`。
- 左侧 `Generation Queue` 可以查看上传、生成、导入状态，并对失败任务重试。
- 需要部件说明时，再点击 `Info` 或 `Inspect` 打开详情抽屉。
- 顶部打开 `Library` 可以查看完整资产库：预览、Provider 状态、任务 ID、GLB URL 复制、Provider 对比和删除。
- 顶部点击 `Demo` 进入纯展示模式，适合截图、录屏、演示。
- 录屏前先看主舞台的质量评分；分数低通常说明源图或生成结果还不适合演示。
- Demo 动画会根据模型名称和元数据切换：汽车走低机位推进，飞机走飞行掠过，航母 / 船走侧向巡航，有机 / 标本类资产走工作室环绕。

常用验证命令：

```bash
npm run lint
npm run build
npm run test
npm run test:visual
```

`npm run test:visual` 会运行 Playwright 布局和截图回归，覆盖工作台、Model Library 抽屉和 Demo Mode。只有确认 UI 改动是预期变化时，才运行 `npm run test:visual:update` 更新截图基线。

## 可选 Image-to-3D 后端

创建 `.env.local`：

```bash
cp .env.example .env.local
```

然后设置：

```bash
TRIPO_API_KEY=your_tripo_key
FAL_API_KEY=your_fal_key
ATLASCLOUD_API_KEY=your_atlascloud_key
RODIN_API_KEY=your_rodin_api_key
OPENAI_API_KEY=your_openai_key
API_HOST=127.0.0.1
```

`OPENAI_API_KEY` 会启用可选的图片理解接口 `/api/3d/analyze`。配置后，上传图片会先被视觉模型识别为资产类型、材质重点、检查重点、展示场景、标签，并生成更适合 image-to-3D 的提示词。没配置时，应用继续使用本地文件名和元数据规则，不会影响基础上传和生成。

如需启用 Hunyuan3D 本地备用模式，先启动你的 Hunyuan3D API 服务，再设置：

```bash
HUNYUAN_API_BASE=http://127.0.0.1:8081
HUNYUAN_CREATE_PATH=/send
HUNYUAN_STATUS_PATH=/status
```

3D 生成后端支持这些路径：

```text
Hyper3D  只走 Hyper3D Rodin 云端生成，默认模式
Atlas    只走 Atlas Cloud Hunyuan3D GLB 生成
Tripo    只走 Tripo 云端生成
Fal      只走 Fal.ai 队列生成，具体模型在 Settings 里选择
Auto     先 Hyper3D，再 Tripo、Fal、Hunyuan，最后 JS Depth 兜底
Hunyuan  只走本地 Hunyuan3D
```

上传面板支持这些模式：

```text
Hyper3D     Hyper3D Rodin GLB 生成
Atlas       Atlas Cloud Hunyuan3D GLB 生成
Tripo       Tripo 云端 GLB 生成
Fal         Fal.ai 队列 GLB 生成
Hunyuan     本地 Hunyuan3D GLB 生成
JS Depth    浏览器侧图片深度浮雕，WebGL 不可用时降级到透明 PNG 分层
Auto        Hyper3D -> Tripo -> Fal -> Hunyuan -> JS Depth 依次降级
Local GLB   导入已有 .glb 或自包含 .gltf
```

Tripo 上传使用当前 STS 对象存储流程，然后创建 `image_to_model` 任务。生成后的 GLB 会被 Node 后端缓存到 `.generated-models/`，后续展示优先使用本地副本。
Fal 上传使用官方 `@fal-ai/client` 的 storage 和 queue API。当前支持 Hunyuan3D v2、TRELLIS、TripoSR、Tripo3D v2.5 和 Hyper3D Rodin，具体 Fal 模型在 `Settings` 里选择。
Rodin 上传使用 Hyper3D 的 multipart `/rodin` 任务接口，然后轮询 `/status` 并通过 `/download` 下载和缓存 GLB。
前端模型库会保存到 IndexedDB，所以生成或导入成功的模型记录刷新后仍会恢复。

也可以从 `New Upload` 入口导入本地 `.glb` 或自包含 `.gltf`，导入后会成为自定义工作区模型。

Hunyuan3D 本地 API 预期形式：

```text
POST /send
GET  /status/:uid
```

状态接口可以返回远程模型 URL，也可以返回 `model_base64` / `glb_base64` 这类 base64 GLB 字段。base64 GLB 会被缓存到 `.generated-models/` 并由 Node 后端提供访问。

启动后端：

```bash
npm run dev:api
```

启动前端：

```bash
npm run dev
```

默认情况下，前端会访问本地 Node 后端 `http://127.0.0.1:8787`。

## Demo 模型

仓库内置了一些缓存 GLB：

```text
public/generated-models/
```

这些模型可以让项目在不消耗 API credits 的情况下直接用于演示。

## 参考模型

Library 面板内置了远程 Khronos glTF Sample Models 作为辅助参考，用于检查材质和 GLB 加载：

- Transmission Test，CC0，Adobe via Khronos。
- Transmission Roughness Test，CC-BY 4.0，Ed Mackey / Analytical Graphics via Khronos。
- Mosquito In Amber，CC-BY 4.0，Loic Norgeot / Geoffrey Marchal / Sketchfab via Khronos。

这些模型从 Khronos 已归档样例仓库远程加载，不打包进本仓库。

## 安全

不要把真实 API Key 写进前端代码。密钥只放在 `.env.local`，该文件已被 git 忽略。

## License

MIT
