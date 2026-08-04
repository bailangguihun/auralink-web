# 画音智链前端

本仓库是跨模态内容生成平台 **画音智链** 的前端项目，基于 Next.js 与 React 开发。
项目已部署在 [https://auralinks.top](https://auralinks.top)，也可在 release 页面下载打包好的前端服务器直接使用。

## 快速开始

1. 安装依赖
   ```bash
   npm install
   ```
2. 启动开发环境
   ```bash
   npm run dev
   ```
3. 构建生产版本
   ```bash
   npm run build
   npm start
   ```

## 主要功能

- **首页展示**：介绍平台概念及特色动画效果。
- **登录 / 注册**：基础的用户身份验证逻辑。
- **音画创作空间（generate 页面）**：通过节点式工作流组合文本、图像、音乐任务，支持图生文、图生音、文生图、文生音等多种模式，并已接入真实后端模型。
- **高级设置**：针对支持的模型提供温度、Top-k 等参数调节，可在界面中按需配置。
- **用户中心**：查看个人信息、生成记录及运行日志。

## 功能拓展指南

详细的第三方模型接入示例请参见 [docs/extension-guide.md](docs/extension-guide.md)。

### 配置修改
后端接口地址等统一放在 `src/config/index.js`，若部署到其他环境只需修改此处。

### 新增任务类型与模型
`src/app/generate/page.js` 中定义了 `TASK_TYPES` 与 `MODELS` 常量，按需增加即可在界面选择新的模型。

### 高级设置配置
支持高级设置的模型在 `src/config/advancedSettings.js` 中定义。可在此文件中调整各参数的默认值、范围及 UI 分类，前端会自动读取并生成对应的设置面板。

### 接入真实模型
实际的模型调用逻辑位于 `src/app/models` 目录，每个文件导出一个异步函数并返回后端结果。以 `MusicGenSmall` 为例：

```javascript
import MusicGenSmall from '@/app/models/MusicGenSmall';

const audioUrl = await MusicGenSmall('A relaxing piano piece', { duration: 30 });
```

在 generate 页面中引入对应函数即可完成真实推理，如需扩展新模型，可在该目录中新建文件实现自己的 API 调用。

## 贡献
⚠️ **注意：请勿随意向 `release` 分支提交代码！**  
`release` 分支每次检测到 push 时会**自动部署到服务器**，请务必只将**经过充分测试、无明显 bug 的代码**合并到 `main` 分支。  
如需更新功能，请先在 `main` 分支开发和调试，确认无误后**通过 PR 合并到 `release`**，**不要直接向 `release` 分支推送代码**。  

