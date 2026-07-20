const assert = require("node:assert/strict");
const test = require("node:test");
const {
  STORE_VERSION,
  normalizeSettings,
  normalizeStore
} = require("../electron/store.cjs");

test("normalizeStore migrates existing settings with YOLO mode disabled", () => {
  const state = normalizeStore({ version: 3 });

  assert.equal(STORE_VERSION, 4);
  assert.equal(state.version, 4);
  assert.equal(state.settings.yoloMode, false);
});

test("normalizeSettings preserves enabled YOLO mode", () => {
  assert.equal(normalizeSettings({ yoloMode: true }).yoloMode, true);
});
