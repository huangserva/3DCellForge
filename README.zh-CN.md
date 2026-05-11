# 3DCellForge

[English](README.md) | [中文](README.zh-CN.md)

AI 驱动的交互式 3D 细胞生成与探索工作台。

3DCellForge 是一个 React + Three.js 原型，用于在浏览器里展示高质感的细胞 3D 场景。它支持 WebGL 拖拽旋转、滚轮缩放、细胞器信息面板、截图、GLB 导出，以及通过 Tripo / Hyper3D Rodin / Hunyuan3D / 本地模型导入生成或加载真实 3D 模型。

## 演示视频

[![3DCellForge 演示视频](docs/demo/3DCellForge-demo-cover.jpg)](docs/demo/3DCellForge-demo-2026-05-10.mp4)

打开视频文件：[3DCellForge-demo-2026-05-10.mp4](docs/demo/3DCellForge-demo-2026-05-10.mp4)

## 功能

- 基于 React Three Fiber 的交互式细胞查看器。
- 支持拖拽旋转、滚轮缩放、3D Proof 模式切换。
- 细胞器详情卡、显微镜参考图、对比面板、生物学笔记和图库操作。
- 通过本地 Node 后端调用 Tripo 或 Hyper3D Rodin 云端 image-to-3D。
- 支持 Hunyuan3D 本地服务作为备用生成路径。
- 支持导入本地 `.glb` / 自包含 `.gltf` 模型。
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
- Hyper3D Rodin API 可选后端
- Hunyuan3D 本地 API 可选后端

## 快速开始

```bash
npm install
npm run dev
```

打开终端里显示的 Vite 地址即可。

## 可选 Image-to-3D 后端

创建 `.env.local`：

```bash
cp .env.example .env.local
```

然后设置：

```bash
TRIPO_API_KEY=your_tripo_key
RODIN_API_KEY=vibecoding
```

如需启用 Hunyuan3D 本地备用模式，先启动你的 Hunyuan3D API 服务，再设置：

```bash
HUNYUAN_API_BASE=http://127.0.0.1:8081
HUNYUAN_CREATE_PATH=/send
HUNYUAN_STATUS_PATH=/status
```

3D 生成后端支持这些路径：

```text
Tripo   只走 Tripo 云端生成，默认模式
Rodin   只走 Hyper3D Rodin 云端生成
Auto    先 Tripo，再 Rodin，失败后 Hunyuan
Hunyuan 只走本地 Hunyuan3D
```

上传面板支持这些模式：

```text
Tripo       Tripo 云端 GLB 生成
Rodin       Hyper3D Rodin 云端 GLB 生成
Hunyuan     本地 Hunyuan3D GLB 生成
Cinematic   从图片生成透明 PNG 分层视觉效果，适合高质感演示
Auto        Tripo -> Rodin -> Hunyuan -> Cinematic 依次降级
Local GLB   导入已有 .glb 或自包含 .gltf
```

Tripo 上传使用当前 STS 对象存储流程，然后创建 `image_to_model` 任务。生成后的 GLB 会被 Node 后端缓存到 `.generated-models/`，后续展示优先使用本地副本。
Rodin 上传使用 Hyper3D `multipart/form-data` 任务接口，然后通过 status/download 接口轮询并缓存 GLB。

也可以从 Microscope View 的 Add Image 入口导入本地 `.glb` 或自包含 `.gltf`，导入后会成为自定义 Cell Type。

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
