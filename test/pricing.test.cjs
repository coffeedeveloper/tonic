const assert = require("node:assert/strict");
const test = require("node:test");
const { estimateTokenCostUsd, pricingForModel } = require("../electron/pricing.cjs");

test("prices cached OpenAI input separately without double-counting reasoning", () => {
  const cost = estimateTokenCostUsd("gpt-5.3-codex", {
    input: 1_000_000,
    output: 100_000,
    cacheRead: 200_000,
    cacheWrite: 0,
    reasoning: 50_000
  });

  assert.equal(cost, 2.835);
});

test("prices OpenAI cache writes as a subset of input", () => {
  const cost = estimateTokenCostUsd("gpt-5.6-sol", {
    input: 1_000_000,
    output: 0,
    cacheRead: 0,
    cacheWrite: 100_000,
    reasoning: 0
  });

  assert.equal(cost, 5.125);
});

test("uses Claude one-hour cache-write usage when available", () => {
  const cost = estimateTokenCostUsd(
    "claude-haiku-4-5-20251001",
    {
      input: 100_000,
      output: 100_000,
      cacheRead: 100_000,
      cacheWrite: 100_000,
      reasoning: null
    },
    {
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 100_000
    }
  );

  assert.equal(cost, 0.81);
});

test("supports current snapshot and alias model names", () => {
  assert.ok(pricingForModel("gpt-5.6"));
  assert.ok(pricingForModel("gpt-5.4-2026-03-05"));
  assert.ok(pricingForModel("claude-3-5-sonnet-20241022"));
  assert.ok(pricingForModel("claude-opus-4-6"));
});

test("does not invent a price for an unknown model or missing usage", () => {
  assert.equal(estimateTokenCostUsd("future-model", { input: 1 }), null);
  assert.equal(estimateTokenCostUsd("gpt-5.2-pro", { input: 1 }), null);
  assert.equal(estimateTokenCostUsd("gpt-5.6-sol", null), null);
});
