const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { promisify } = require("node:util");
const {
  canonicalProjectPath,
  worktreeRootPath
} = require("../electron/git-service.cjs");
const { createSessionScanner } = require("../electron/session-scanner.cjs");

const execFileAsync = promisify(execFile);

test("sums per-call usage and cost when cumulative Codex usage resets", async (context) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "tonic-scanner-test-"));
  const previousCodexHome = process.env.CODEX_HOME;
  const previousClaudeHome = process.env.CLAUDE_CONFIG_DIR;
  context.after(async () => {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
    if (previousClaudeHome === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = previousClaudeHome;
    }
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  });

  const sessionId = "12345678-1234-1234-1234-123456789abc";
  const sessionDirectory = path.join(temporaryRoot, "codex", "sessions");
  const projectPath = path.join(temporaryRoot, "project");
  await fs.mkdir(sessionDirectory, { recursive: true });
  await fs.mkdir(path.join(temporaryRoot, "claude", "projects"), { recursive: true });
  const records = [
    {
      timestamp: "2026-07-22T00:00:00.000Z",
      type: "session_meta",
      payload: { id: sessionId, cwd: projectPath }
    },
    {
      timestamp: "2026-07-22T00:00:01.000Z",
      type: "turn_context",
      payload: { model: "gpt-5.3-codex", cwd: projectPath }
    },
    tokenCountRecord(1_000_000),
    tokenCountRecord(2_000_000)
  ];
  await fs.writeFile(
    path.join(sessionDirectory, `rollout-${sessionId}.jsonl`),
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`
  );
  process.env.CODEX_HOME = path.join(temporaryRoot, "codex");
  process.env.CLAUDE_CONFIG_DIR = path.join(temporaryRoot, "claude");

  const scanner = createSessionScanner({
    canonicalProjectPath: async (value) => value,
    worktreeRootPath: async (value) => value
  });
  const sessions = await scanner.scanSessions({ force: true });

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].tokenUsage, 3_000_000);
  assert.equal(sessions[0].tokenBreakdown.input, 3_000_000);
  assert.equal(sessions[0].estimatedCostUsd, 5.25);
});

test("attributes a Codex worktree session to the main project", async (context) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "tonic-scanner-test-"));
  const previousCodexHome = process.env.CODEX_HOME;
  const previousClaudeHome = process.env.CLAUDE_CONFIG_DIR;
  context.after(async () => {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
    if (previousClaudeHome === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = previousClaudeHome;
    }
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  });

  const sessionId = "abcdef12-1234-5678-9abc-def012345678";
  const codexHome = path.join(temporaryRoot, "codex");
  const sessionDirectory = path.join(codexHome, "sessions");
  const projectPath = path.join(temporaryRoot, "Projects", "oolong");
  const worktreePath = path.join(codexHome, "worktrees", "a");
  const workingDirectory = path.join(worktreePath, "packages", "app");
  await fs.mkdir(sessionDirectory, { recursive: true });
  await fs.mkdir(path.join(temporaryRoot, "claude", "projects"), {
    recursive: true
  });
  await fs.mkdir(path.dirname(projectPath), { recursive: true });
  await runGit(["init", "--initial-branch=main", projectPath]);
  await runGit(["-C", projectPath, "commit", "--allow-empty", "-m", "initial"], {
    GIT_AUTHOR_NAME: "Tonic Test",
    GIT_AUTHOR_EMAIL: "tonic@example.com",
    GIT_COMMITTER_NAME: "Tonic Test",
    GIT_COMMITTER_EMAIL: "tonic@example.com"
  });
  await fs.mkdir(path.dirname(worktreePath), { recursive: true });
  await runGit([
    "-C",
    projectPath,
    "worktree",
    "add",
    "-b",
    "codex/test",
    worktreePath
  ]);
  await fs.mkdir(workingDirectory, { recursive: true });
  await fs.writeFile(
    path.join(sessionDirectory, `rollout-${sessionId}.jsonl`),
    `${JSON.stringify({
      timestamp: "2026-07-22T00:00:00.000Z",
      type: "session_meta",
      payload: { id: sessionId, cwd: workingDirectory }
    })}\n`
  );
  process.env.CODEX_HOME = codexHome;
  process.env.CLAUDE_CONFIG_DIR = path.join(temporaryRoot, "claude");

  const scanner = createSessionScanner({ canonicalProjectPath, worktreeRootPath });
  const sessions = await scanner.scanSessions({ force: true });

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].workingDirectory, path.normalize(workingDirectory));
  assert.equal(sessions[0].worktreePath, await fs.realpath(worktreePath));
  assert.equal(sessions[0].projectPath, await fs.realpath(projectPath));
});

async function runGit(args, environment = {}) {
  await execFileAsync("/usr/bin/git", args, {
    env: { ...process.env, ...environment },
    timeout: 15_000,
    windowsHide: true
  });
}

function tokenCountRecord(inputTokens) {
  const usage = {
    input_tokens: inputTokens,
    cached_input_tokens: 0,
    cache_write_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
    total_tokens: inputTokens
  };
  return {
    timestamp: "2026-07-22T00:00:02.000Z",
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        last_token_usage: usage,
        total_token_usage: usage
      }
    }
  };
}
