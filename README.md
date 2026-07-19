# tonic

tonic 是一款本地优先的 macOS 桌面应用，按项目统一整理 Codex、Claude Code 会话与 Git worktree，让并行开发上下文更容易查找、比较和恢复。

> 所有项目、会话和 Git 信息均从本机读取。tonic 不上传 prompt、摘要或 transcript。

## 主要功能

### 项目管理

- 添加本地目录，或从已有 coding-agent 会话自动发现项目
- 查看每个项目的 Codex 会话、Claude Code 会话和 worktree 数量
- 置顶、拖拽或使用键盘调整常用项目顺序
- 调整或折叠项目侧栏，并保留界面状态

### 会话浏览

- 按 agent 类型筛选，按创建时间、更新时间或 Token 用量排序
- 查看模型、分支、摘要、工作目录、所属 worktree 和时间信息
- 展开查看对话轮数、工具调用数、Token 明细、来源、权限/沙箱模式和 CLI 版本
- 一键复制 `codex resume <id>` 或 `claude --resume <id>` 恢复命令

### Worktree 与桌面体验

- 查看 worktree 的分支、未提交文件数和最后一次 commit
- 使用已安装的编辑器打开项目，也可选择任意 macOS `.app`
- 支持中英文、跟随系统/浅色/深色主题和开机启动
- 支持常用快捷键：

| 快捷键 | 操作 |
| --- | --- |
| `⌘O` | 添加项目 |
| `⌘1` | 切换到会话列表 |
| `⌘2` | 切换到 worktree 列表 |
| `⌘\` | 展开或折叠项目侧栏 |
| `⌘,` | 打开设置 |

## 本地运行

### 环境要求

- macOS
- Node.js 22.13 或更高版本
- pnpm 11.15.0（以 `package.json` 中的 `packageManager` 为准）
- macOS 自带的 Git

Codex 会话扫描会优先使用系统 `/usr/bin/sqlite3` 加速索引读取；不可用时自动回退到 JSONL 数据。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

应用启动后，可以手动添加项目，也可以扫描现有 Codex / Claude Code 会话并自动发现对应项目。

## 开发命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 启动 Vite 开发服务器和 Electron 应用 |
| `pnpm lint` | 对所有 TypeScript 项目执行类型检查 |
| `pnpm check:electron` | 检查 Electron CommonJS 模块语法 |
| `pnpm build` | 类型检查并生成 Vite 生产构建 |
| `pnpm package` | 构建并生成 macOS DMG / ZIP 安装包 |

提交前建议运行：

```bash
pnpm lint
pnpm check:electron
pnpm build
git diff --check
```

仓库目前没有自动化测试套件或 `pnpm test` 命令。

## 数据与隐私

tonic 仅处理以下本机数据：

| 来源 | 默认位置或范围 | 用途 |
| --- | --- | --- |
| Codex | `$CODEX_HOME`，默认 `~/.codex` | 读取本地会话元数据 |
| Claude Code | `$CLAUDE_CONFIG_DIR`，默认 `~/.claude` | 读取本地会话元数据 |
| Git | 已登记项目的 repository / worktree | 读取分支、状态和 commit 信息 |
| tonic | Electron `userData` 目录 | 保存项目清单与应用设置 |

- prompt、摘要和 transcript 不会被复制到 tonic 的持久化存储，也不会上传到网络
- 移除项目只会删除 tonic 中的登记记录，不会删除本地目录、会话或 worktree
- tonic 不包含遥测或远程数据同步

## 技术架构

tonic 使用 Electron、React、Vite 和 TypeScript 构建。渲染层负责界面与交互；文件系统、Git、SQLite 和 macOS 原生能力均保留在 Electron 主进程中。

```text
electron/       Electron 主进程、preload、IPC、本地扫描与原生服务
src/            React 渲染层、组件、hooks、样式与共享类型
scripts/        本地开发脚本
assets/         应用图标
dist/           Vite 构建产物（生成，不提交）
release/        electron-builder 打包产物（生成，不提交）
```

应用保持 `contextIsolation: true`、`nodeIntegration: false` 和 `sandbox: true`。渲染层只能调用 preload 暴露的白名单 API；主进程会验证 IPC 输入，并通过固定可执行文件与参数数组调用 Git、编辑器和 SQLite，避免拼接 shell 命令。
