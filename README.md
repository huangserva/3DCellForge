# AI 3D 模型工坊

AI 3D 模型工坊是基于 3DCellForge 开源项目进行中文化体验改造的浏览器 3D 模型查看工具。

本阶段只做轻量中文化和产品包装：保留原有 React、Three.js、React Three Fiber 展示能力，保留上传、截图、导出 GLB、图库、结构库、观察笔记、设置和对比等功能，不改变核心渲染和模型加载逻辑。

## 功能

- 在浏览器中交互查看细胞 3D 模型。
- 支持拖动旋转、滚轮缩放和 3D 验证模式。
- 支持细胞器详情、显微图参考、对比面板、观察笔记和图库保存。
- 支持截图和 GLB 导出。
- 支持上传图片生成 3D 任务，或导入本地 `.glb` / 自包含 `.gltf` 模型。
- 仓库内置演示 GLB 模型，便于离线预览和截图演示。

## 技术栈

- React
- Vite
- Three.js
- React Three Fiber
- Drei
- Framer Motion

## 快速开始

```bash
npm install
npm run dev
```

打开终端中显示的 Vite 地址即可访问。

## 可选的图像转 3D 后端

原项目包含可选的本地 Node 后端，用于对接图像转 3D 服务。中文体验版不新增 API，也不新增后端能力。

如需启用原有后端能力，可创建 `.env.local`：

```bash
cp .env.example .env.local
```

然后按需设置：

```bash
TRIPO_API_KEY=your_tripo_key
```

本地 Hunyuan3D 备用模式仍沿用原项目配置：

```bash
HUNYUAN_API_BASE=http://127.0.0.1:8081
HUNYUAN_CREATE_PATH=/send
HUNYUAN_STATUS_PATH=/status
```

启动后端：

```bash
npm run dev:api
```

再启动前端：

```bash
npm run dev
```

前端默认访问 `http://127.0.0.1:8787` 的本地 Node 后端。

## 演示模型

仓库包含缓存的演示 GLB 文件：

```text
public/generated-models/
```

这些模型用于减少重复生成成本，并保证中文体验版可以直接展示 3D 效果。

## 开源来源

本项目基于 3DCellForge 开源项目进行中文化体验改造，保留原项目许可证说明。请勿将其伪装成完全原创项目。

## 安全

不要把真实 API Key 写入前端代码。请将密钥保存在 `.env.local` 中，该文件已被 git 忽略。

## License

MIT
