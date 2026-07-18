# tonic

tonic 是一个本地优先的 macOS 桌面端工具，用项目视角统一浏览 Codex / Claude Code session 与 Git worktree。

## 功能

- 从本地目录添加项目，或从已有 coding-agent session 反查项目根目录
- 在项目侧栏通过图标查看 Codex、Claude Code session 和 worktree 数量；常用项目可置顶并拖拽或用键盘排序
- 项目面板支持拖拽调整宽度、折叠和状态记忆；路径只在项目名 hover / focus 时显示
- 按 agent 类型筛选 session，按创建时间、更新时间或 token 用量排序，并查看模型、分支、摘要与时间信息
- 展开 session 可查看实际工作目录、所属 worktree、对话轮数、工具调用数、Token 明细、来源、权限/沙箱模式和 CLI 版本
- 一键复制 `codex resume <id>` / `claude --resume <id>` 恢复命令
- 查看 worktree 的未提交文件数、分支和最后一次 commit，并用指定编辑器打开
- 只展示当前可用的 macOS 编辑器，也可选择任意 `.app` 作为自定义编辑器
- 支持中英文界面、跟随系统/浅色/深色主题，以及设置开机启动
- 支持 `⌘O` 添加项目、`⌘1` / `⌘2` 切换列表、`⌘\` 折叠项目面板、`⌘,` 打开设置

## 本地开发

需要 Node.js 20+、pnpm，以及 macOS 自带的 Git。Codex 的快速索引读取还会优先使用系统 `sqlite3`，不可用时自动回退到 JSONL。

```bash
pnpm install
pnpm dev
```

常用检查：

```bash
pnpm lint
pnpm check:electron
pnpm build
pnpm package
```

## 数据来源与隐私

tonic 只读取本机数据：

- Codex：`$CODEX_HOME`，默认 `~/.codex`
- Claude Code：`$CLAUDE_CONFIG_DIR`，默认 `~/.claude`
- Git：已登记项目中的 repository / worktree 元数据

项目清单和设置保存在 Electron 的 `userData` 目录中。session 的 prompt、摘要和 transcript 不会被复制进 tonic 的持久化存储，也不会上传到网络。删除项目只会移除 tonic 内的登记记录，不会删除目录、session 或 worktree。

## 工程结构

```text
electron/       Electron 主进程、IPC、本地扫描与 Git/编辑器服务
src/            React 渲染层、组件、样式和共享类型
scripts/        本地开发启动脚本
dist/           Vite 生产构建产物（生成）
release/        electron-builder 打包产物（生成）
```

窗口采用 `contextIsolation` + sandbox preload，渲染层只能调用白名单 IPC；Git、编辑器和 SQLite 命令均通过参数数组执行，不拼接 shell 命令。
