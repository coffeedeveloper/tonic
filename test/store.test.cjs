const assert = require("node:assert/strict");
const test = require("node:test");
const {
  STORE_VERSION,
  normalizeProjectSummaryCache,
  normalizeSettings,
  normalizeStore
} = require("../electron/store.cjs");

test("normalizeStore migrates existing settings with YOLO mode disabled", () => {
  const state = normalizeStore({ version: 4 });

  assert.equal(STORE_VERSION, 5);
  assert.equal(state.version, 5);
  assert.equal(state.settings.yoloMode, false);
});

test("normalizeSettings preserves enabled YOLO mode", () => {
  assert.equal(normalizeSettings({ yoloMode: true }).yoloMode, true);
});

test("normalizeProjectSummaryCache keeps only bounded project metadata", () => {
  assert.deepEqual(
    normalizeProjectSummaryCache({
      codexSessionCount: 4,
      claudeSessionCount: 2,
      worktreeCount: -1,
      missing: true,
      scannedAt: "2026-07-22T12:00:00.000Z",
      summary: "must not be persisted"
    }),
    {
      codexSessionCount: 4,
      claudeSessionCount: 2,
      worktreeCount: 0,
      missing: true,
      scannedAt: "2026-07-22T12:00:00.000Z"
    }
  );
});

test("normalizeStore preserves project summary caches across restarts", () => {
  const state = normalizeStore({
    projects: [
      {
        id: "project-id",
        path: "/tmp/tonic-project",
        summaryCache: {
          codexSessionCount: 7,
          claudeSessionCount: 3,
          worktreeCount: 2,
          missing: false,
          scannedAt: "2026-07-22T12:00:00.000Z",
          firstPrompt: "must not be persisted"
        }
      }
    ]
  });

  assert.deepEqual(state.projects[0].summaryCache, {
    codexSessionCount: 7,
    claudeSessionCount: 3,
    worktreeCount: 2,
    missing: false,
    scannedAt: "2026-07-22T12:00:00.000Z"
  });
});
