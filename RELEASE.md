# tonic v0.1.0

发布日期：2026-07-19

首个公开版本，面向本地 Codex / Claude Code session 与 Git worktree 管理。

## 主要功能

- 集中浏览、筛选和查看本地项目、session 与 worktree。
- 从本地目录添加项目，或从已有 coding-agent session 反查项目根目录。
- 查看 session 的模型、分支、摘要、时间、Token 明细、来源和恢复命令。
- 查看 worktree 状态，并使用已安装的 macOS 编辑器或自定义 `.app` 打开项目。
- 支持中英文界面、系统/浅色/深色主题和默认编辑器设置。
- 本地优先读取 Codex、Claude Code 与 Git 元数据，不上传 prompt、摘要或 transcript。
- 使用沙箱化渲染进程、受控 IPC 和参数数组执行本地命令。

## 下载

- [tonic-0.1.0-arm64.dmg](https://github.com/coffeedeveloper/tonic/releases/download/v0.1.0/tonic-0.1.0-arm64.dmg)：Apple Silicon macOS 安装镜像。
- [tonic-0.1.0-arm64-mac.zip](https://github.com/coffeedeveloper/tonic/releases/download/v0.1.0/tonic-0.1.0-arm64-mac.zip)：Apple Silicon macOS 压缩包。

## SHA-256

```text
1ffbd21ccd4ac2aa9174c1695c761c4d8158f3d4d1b18cbe5970241862daa24b  tonic-0.1.0-arm64.dmg
4d4b1c5e04ace1cb7d677929573fcee5baae9efee1cb5c15ad967d42258e98dc  tonic-0.1.0-arm64-mac.zip
```

> 当前构建未使用 Apple Developer ID 签名或公证。首次启动时，macOS 可能要求在“系统设置 → 隐私与安全性”中确认打开。

完整发布信息与构建产物见 [GitHub Release v0.1.0](https://github.com/coffeedeveloper/tonic/releases/tag/v0.1.0)。
