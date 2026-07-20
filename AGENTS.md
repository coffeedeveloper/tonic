# Repository Guidelines

## Project Structure & Module Organization

This repository is a local-first macOS Electron app built with React, Vite, TypeScript, and pnpm. Renderer code lives in `src/`: `App.tsx` coordinates the main UI, `main.tsx` mounts React, `api.ts` provides the typed desktop bridge plus the browser-development fallback, `types.ts` contains shared renderer contracts, and `i18n.tsx` owns English and Chinese copy. Put reusable UI in `src/components/`, stateful behavior in `src/hooks/`, small pure helpers in `src/utils/`, and styles in `src/styles/`.

Electron runtime code lives in `electron/` and remains CommonJS. `main.cjs` owns application lifecycle, menus, windows, and IPC handlers; `preload.cjs` exposes the narrow renderer API; `store.cjs` persists projects and settings; `session-scanner.cjs` reads Codex and Claude Code metadata; `git-service.cjs` inspects repositories and worktrees; and `editors.cjs` discovers and launches macOS editors. Development tooling is in `scripts/`, app icons are in `assets/`, and root TypeScript/Vite configuration applies to the renderer and build tooling.

`dist/` and `release/` are generated output. Never edit or commit them. Keep renderer-only logic out of Electron modules, and keep filesystem, process, Git, and native macOS access out of the renderer.

## Build, Validation & Development Commands

Use Node.js 22.13 or newer and the pnpm version declared in `package.json`. Run all commands from the repository root.

```bash
pnpm install             # install dependencies from pnpm-lock.yaml
pnpm dev                 # start Vite and the real Electron shell
pnpm test                # run focused Node.js behavior tests
pnpm lint                # type-check all TypeScript projects without output
pnpm check:electron      # syntax-check every Electron CommonJS module
pnpm build               # type-check and create the Vite production build
pnpm package             # build and create macOS dmg/zip artifacts
```

Use `pnpm install --frozen-lockfile` when validating an unchanged dependency graph. When dependency declarations intentionally change, regenerate and commit `pnpm-lock.yaml` with the matching pnpm version. Build-script permissions are an explicit allowlist in `pnpm-workspace.yaml`; approve only the package that actually needs a script, never all pending packages by default.

Focused behavior tests use the built-in Node.js test runner and live in `test/`. Keep them small and close to pure Electron helpers or persistence behavior. Do not claim tests ran when only type, syntax, build, or manual checks were performed.

## Coding Style & Naming Conventions

Follow the existing style: two-space indentation, double quotes, semicolons, and small helpers near their callers. Renderer code uses TypeScript and TSX; Electron code uses CommonJS with `require` and `module.exports`. React components and exported types use PascalCase. Hooks begin with `use`; functions, variables, settings keys, and IPC helper names use camelCase.

Prefer function components, explicit prop types, and derived state over duplicated state. Reuse contracts from `src/types.ts` instead of creating parallel shapes. Keep UI components focused and move reusable interaction logic into hooks. New user-facing renderer text belongs in `src/i18n.tsx` with both English and Chinese values; do not add a string to only one locale.

Treat the desktop API as one contract. Any IPC capability change must be kept consistent across the relevant `TonicApi` types in `src/types.ts`, the renderer/browser fallback in `src/api.ts`, the whitelist and payload mapping in `electron/preload.cjs`, and the validated handler in `electron/main.cjs`. Keep IPC values serializable, validate renderer-controlled input in the main process, and make every event subscription return a cleanup function.

## Validation Guidelines

For every code change, run the smallest relevant checks and report the exact commands used. The normal pre-commit baseline is:

```bash
pnpm test
pnpm lint
pnpm check:electron
pnpm build
git diff --check
```

For visible UI changes, also run `pnpm dev` and manually verify the affected workflow in both light and dark themes and, when copy changes, both languages. Relevant workflows include project add/remove/pin/reorder, sidebar resize/collapse persistence, session filtering/sorting/details, resume-command copying, worktree inspection, editor launching, settings, and keyboard shortcuts.

For scanner changes, exercise both Codex and Claude Code data when fixtures or local data are available, including missing, partial, archived, and actively appended records. For Electron or IPC changes, verify window/menu behavior, renderer cleanup, invalid input paths, and expected failure handling. Run `pnpm package` when changing packaging configuration, icons, Electron startup, preload behavior, native integration, or release-related code. Do not stage generated artifacts after validation.

## Commit, Branch & Pull Request Guidelines

Start feature and fix work from an up-to-date `main` branch and use a short kebab-case branch under the `codex/` prefix. Do not put unrelated feature work directly on `main`.

```bash
git switch main
git pull --ff-only origin main
git switch -c codex/<short-description>
```

The worktree may already contain user changes. Inspect `git status` and the complete diff before editing, preserve unrelated changes, and stage explicit paths only. Keep each commit limited to one logical change. Never commit `dist/`, `release/`, local settings, session data, credentials, tokens, logs, `.env` files, or machine-specific paths.

Use Conventional Commit messages in this form:

```text
type(scope): imperative title
```

Use a lowercase type such as `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`, or `ci`. Keep scopes concise and aligned with the affected area, for example `app`, `electron`, `scanner`, `git`, `settings`, `repo`, `deps`, or `release`. Do not add a trailing period.

Examples:

- `feat(app): add session source filter`
- `fix(scanner): tolerate partial transcript records`
- `docs(repo): document local validation`
- `chore(deps): update electron toolchain`

Pull requests should explain what changed and why, call out privacy, security, IPC, data-compatibility, and packaging impact where relevant, list the exact validation performed, link related issues, and include screenshots or recordings for visible UI changes. Do not merge a draft PR, a PR with failing required checks, or a PR whose merge state is not clean.

## Release & Packaging Rules (Explicit Request Only)

Never prepare or publish a release proactively. A request to edit, commit, push, open a pull request, or finish a feature does not authorize version changes, tags, GitHub Releases, or distribution. Release work requires an explicit request naming the release action or intended version.

Use Semantic Versioning and `vX.Y.Z` tags. Before an authorized release, start from a clean, up-to-date `main`, confirm the intended changes are already present, run the full validation baseline plus `pnpm package`, and inspect the generated DMG and ZIP. Keep release metadata changes separate from feature work. Never stage `release/`, reuse a published tag, or imply that a local package build was published.

## Security, Privacy & Local Data

Tonic reads sensitive local developer metadata from Git repositories, `$CODEX_HOME` (default `~/.codex`), and `$CLAUDE_CONFIG_DIR` (default `~/.claude`). Preserve the local-only design. Do not upload, log, or add telemetry for prompts, summaries, transcripts, repository paths, session identifiers, or settings. Do not persist transcript content merely because it was read for display; changes to `store.cjs` must remain backward-compatible with existing user data.

Keep `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. Expose only narrowly scoped operations through `preload.cjs`; never pass `ipcRenderer`, filesystem primitives, or process execution into the renderer. Keep IPC sender checks and payload validation intact.

Run Git, `open`, SQLite, and other native tools with fixed executables and argument arrays through `execFile`; never interpolate user-controlled values into a shell command. Normalize and validate paths before filesystem or process access, bound file reads and concurrency, and handle files disappearing or changing during a scan. Removing a project from Tonic must only remove its stored registration. Never delete a repository, worktree, session, transcript, or user file unless the user explicitly requests that exact destructive action.
