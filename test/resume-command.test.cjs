const assert = require("node:assert/strict");
const test = require("node:test");
const { buildResumeCommand } = require("../electron/resume-command.cjs");

test("buildResumeCommand keeps standard resume commands when YOLO mode is disabled", () => {
  assert.equal(
    buildResumeCommand({ agent: "codex", id: "codex-session" }),
    "codex resume codex-session"
  );
  assert.equal(
    buildResumeCommand({ agent: "claude", id: "claude-session" }),
    "claude --resume claude-session"
  );
});

test("buildResumeCommand appends agent-specific flags when YOLO mode is enabled", () => {
  assert.equal(
    buildResumeCommand({ agent: "codex", id: "codex-session" }, true),
    "codex resume codex-session --dangerously-bypass-approvals-and-sandbox"
  );
  assert.equal(
    buildResumeCommand({ agent: "claude", id: "claude-session" }, true),
    "claude --resume claude-session --allow-dangerously-skip-permissions --permission-mode auto"
  );
});
