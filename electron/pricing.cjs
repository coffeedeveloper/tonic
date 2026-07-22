const TOKENS_PER_MILLION = 1_000_000;

// Standard API token rates in USD per million tokens, reviewed 2026-07-22.
// OpenAI: https://developers.openai.com/api/docs/models
// Anthropic: https://platform.claude.com/docs/en/about-claude/pricing
function openAiPricing(input, cachedInput, output) {
  return {
    provider: "openai",
    input,
    cachedInput,
    cacheWrite5m: input * 1.25,
    cacheWrite1h: input * 2,
    output
  };
}

function claudePricing(input, cachedInput, cacheWrite5m, cacheWrite1h, output) {
  return {
    provider: "claude",
    input,
    cachedInput,
    cacheWrite5m,
    cacheWrite1h,
    output
  };
}

function pricingForModel(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const model = value.trim().toLowerCase();

  if (/^gpt-5\.6-terra(?:-|$)/u.test(model)) {
    return openAiPricing(2.5, 0.25, 15);
  }
  if (/^gpt-5\.6-luna(?:-|$)/u.test(model)) {
    return openAiPricing(1, 0.1, 6);
  }
  if (
    model === "gpt-5.6" ||
    /^gpt-5\.6-sol(?:-|$)/u.test(model) ||
    /^gpt-5\.6-\d{4}/u.test(model)
  ) {
    return openAiPricing(5, 0.5, 30);
  }
  if (/^gpt-5\.5(?:-\d{4}|$)/u.test(model)) {
    return openAiPricing(5, 0.5, 30);
  }
  if (/^gpt-5\.4-mini(?:-|$)/u.test(model)) {
    return openAiPricing(0.75, 0.075, 4.5);
  }
  if (/^gpt-5\.4-nano(?:-|$)/u.test(model)) {
    return openAiPricing(0.2, 0.02, 1.25);
  }
  if (/^gpt-5\.4(?:-\d{4}|$)/u.test(model)) {
    return openAiPricing(2.5, 0.25, 15);
  }
  if (/^gpt-5\.3-codex(?:-|$)/u.test(model)) {
    return openAiPricing(1.75, 0.175, 14);
  }
  if (
    /^gpt-5\.2-codex(?:-|$)/u.test(model) ||
    /^gpt-5\.2(?:-\d{4}|$)/u.test(model)
  ) {
    return openAiPricing(1.75, 0.175, 14);
  }
  if (
    /^gpt-5\.1-codex(?:-max)?(?:-|$)/u.test(model) ||
    /^gpt-5\.1(?:-\d{4}|$)/u.test(model)
  ) {
    return openAiPricing(1.25, 0.125, 10);
  }
  if (/^gpt-5-mini(?:-|$)/u.test(model)) {
    return openAiPricing(0.25, 0.025, 2);
  }
  if (/^gpt-5-nano(?:-|$)/u.test(model)) {
    return openAiPricing(0.05, 0.005, 0.4);
  }
  if (/^gpt-5-codex(?:-|$)/u.test(model) || /^gpt-5(?:-\d{4}|$)/u.test(model)) {
    return openAiPricing(1.25, 0.125, 10);
  }
  if (model === "codex-mini-latest") {
    return openAiPricing(1.5, 0.375, 6);
  }
  if (/^o4-mini(?:-|$)/u.test(model)) {
    return openAiPricing(1.1, 0.275, 4.4);
  }

  if (/claude-(?:opus-4-(?:5|6|7|8)|4-(?:5|6|7|8)-opus)(?:-|$)/u.test(model)) {
    return claudePricing(5, 0.5, 6.25, 10, 25);
  }
  if (/claude-(?:opus-(?:3|4(?:-1)?)|3-opus)(?:-|$)/u.test(model)) {
    return claudePricing(15, 1.5, 18.75, 30, 75);
  }
  if (
    /claude-(?:sonnet-(?:3-(?:5|7)|4(?:-(?:5|6))?)|(?:3-(?:5|7)|4(?:-(?:5|6))?)-sonnet)(?:-|$)/u.test(
      model
    )
  ) {
    return claudePricing(3, 0.3, 3.75, 6, 15);
  }
  if (/claude-(?:haiku-4-5|4-5-haiku)(?:-|$)/u.test(model)) {
    return claudePricing(1, 0.1, 1.25, 2, 5);
  }
  if (/claude-(?:haiku-3-5|3-5-haiku)(?:-|$)/u.test(model)) {
    return claudePricing(0.8, 0.08, 1, 1.6, 4);
  }
  if (/claude-(?:haiku-3|3-haiku)(?:-|$)/u.test(model)) {
    return claudePricing(0.25, 0.03, 0.3, 0.5, 1.25);
  }

  return null;
}

function tokenCount(value) {
  return Number.isFinite(value) && value >= 0 ? Number(value) : null;
}

function estimateTokenCostUsd(model, usage, options = {}) {
  const pricing = pricingForModel(model);
  if (!pricing || !usage || typeof usage !== "object") return null;

  const input = tokenCount(usage.input);
  const output = tokenCount(usage.output);
  const cacheRead = tokenCount(usage.cacheRead);
  const cacheWrite = tokenCount(usage.cacheWrite);
  const reported = [input, output, cacheRead, cacheWrite].some((value) => value !== null);
  if (!reported) return null;

  const multiplier = options.multiplier === undefined ? 1 : Number(options.multiplier);
  if (!Number.isFinite(multiplier) || multiplier <= 0) return null;

  let costPerMillion;
  if (pricing.provider === "openai") {
    // OpenAI reports cached and cache-write input as subsets of input tokens.
    const regularInput = Math.max(0, (input || 0) - (cacheRead || 0) - (cacheWrite || 0));
    costPerMillion =
      regularInput * pricing.input +
      (cacheRead || 0) * pricing.cachedInput +
      (cacheWrite || 0) * pricing.cacheWrite5m +
      (output || 0) * pricing.output;
  } else {
    // Anthropic reports regular input and both cache categories separately.
    const explicit5m = tokenCount(options.cacheWrite5mTokens);
    const explicit1h = tokenCount(options.cacheWrite1hTokens);
    const explicitWrites = (explicit5m || 0) + (explicit1h || 0);
    const unclassifiedWrites = Math.max(0, (cacheWrite || 0) - explicitWrites);
    costPerMillion =
      (input || 0) * pricing.input +
      (cacheRead || 0) * pricing.cachedInput +
      ((explicit5m || 0) + unclassifiedWrites) * pricing.cacheWrite5m +
      (explicit1h || 0) * pricing.cacheWrite1h +
      (output || 0) * pricing.output;
  }

  return (costPerMillion / TOKENS_PER_MILLION) * multiplier;
}

module.exports = {
  estimateTokenCostUsd,
  pricingForModel
};
