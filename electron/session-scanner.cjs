const { execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { promisify } = require("node:util");
const { estimateTokenCostUsd } = require("./pricing.cjs");

const execFileAsync = promisify(execFile);
const CACHE_TTL_MS = 10_000;
const MAX_SQLITE_BUFFER = 64 * 1024 * 1024;
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;

function finiteNumber(value) {
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    (typeof value === "string" && !value.trim())
  ) {
    return null;
  }
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativeInteger(value) {
  const number = finiteNumber(value);
  return number === null || number < 0 ? null : Math.round(number);
}

function nonNegativeNumber(value) {
  const number = finiteNumber(value);
  return number === null || number < 0 ? null : number;
}

function isoTimestamp(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  let timestamp = value;
  if (typeof timestamp === "string" && /^\d+$/u.test(timestamp)) {
    timestamp = Number(timestamp);
  }
  if (typeof timestamp === "number" && timestamp < 10_000_000_000) {
    timestamp *= 1000;
  }

  const parsed = new Date(timestamp);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

function earlierTimestamp(left, right) {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(left) <= Date.parse(right) ? left : right;
}

function laterTimestamp(left, right) {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function cleanText(value, maxLength = 4_000) {
  if (typeof value !== "string") {
    return "";
  }

  const cleaned = value.replace(/\0/gu, "").trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function normalizeSourceSurface(...values) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const source = cleanText(value, 120);
    if (!source) continue;
    const normalized = source.toLowerCase();

    if (normalized.includes("desktop")) return "desktop";
    if (normalized === "codex_exec" || normalized === "exec") return "exec";
    if (
      normalized === "cli" ||
      normalized.includes("cli_rs") ||
      normalized.includes("tui") ||
      normalized.includes("terminal")
    ) {
      return "cli";
    }
    if (
      normalized.includes("vscode") ||
      normalized.includes("ide") ||
      normalized.includes("zed") ||
      normalized.includes("jetbrains")
    ) {
      return "ide";
    }

    return source;
  }

  return "";
}

function policyName(value) {
  if (typeof value === "string") {
    const text = cleanText(value, 160);
    if (!text) return "";
    if (text.startsWith("{") || text.startsWith("\"") || text.startsWith("[")) {
      try {
        return policyName(JSON.parse(text));
      } catch {
        return text;
      }
    }
    return text;
  }
  if (!value || typeof value !== "object") return "";
  return cleanText(value.type || value.mode || value.profile, 160);
}

function strictTokenBreakdown(value) {
  if (!value || typeof value !== "object") return null;
  const breakdown = {
    input: nonNegativeInteger(value.input),
    output: nonNegativeInteger(value.output),
    cacheRead: nonNegativeInteger(value.cacheRead),
    cacheWrite: nonNegativeInteger(value.cacheWrite),
    reasoning: nonNegativeInteger(value.reasoning)
  };
  return Object.values(breakdown).every((item) => item === null) ? null : breakdown;
}

function addTokenBreakdown(target, breakdown) {
  for (const key of ["input", "output", "cacheRead", "cacheWrite", "reasoning"]) {
    if (breakdown[key] !== null) {
      target[key] = (target[key] || 0) + breakdown[key];
    }
  }
}

function titleFrom(value) {
  const firstLine = cleanText(value, 400).split(/\r?\n/u)[0].trim();
  return firstLine.length > 180 ? `${firstLine.slice(0, 179).trimEnd()}…` : firstLine;
}

function textFromContent(content, allowedTypes = new Set(["text", "input_text", "output_text"])) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter((block) => {
      if (!block || typeof block !== "object") return false;
      return !block.type || allowedTypes.has(block.type);
    })
    .map((block) => {
      if (typeof block.text === "string") return block.text;
      if (typeof block.content === "string") return block.content;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

async function visitJsonLines(filePath, visitor) {
  let input;
  try {
    input = fsSync.createReadStream(filePath, { encoding: "utf8" });
  } catch {
    return;
  }

  input.on("error", () => undefined);
  const lines = readline.createInterface({ input, crlfDelay: Infinity });

  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      try {
        await visitor(JSON.parse(line));
      } catch {
        // Active transcripts can expose a partial final line while being appended.
      }
    }
  } catch {
    // A transcript may be moved or archived during a scan.
  } finally {
    lines.close();
    input.destroy();
  }
}

async function statOrNull(filePath) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

async function listDirectory(directoryPath) {
  try {
    return await fs.readdir(directoryPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function findJsonLines(directoryPath) {
  const files = [];
  const pending = [directoryPath];

  while (pending.length) {
    const currentPath = pending.pop();
    const entries = await listDirectory(currentPath);
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(entryPath);
      }
    }
  }

  return files;
}

async function mapLimit(values, limit, mapper) {
  const results = new Array(values.length);
  let cursor = 0;

  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker())
  );
  return results;
}

function codexHomePath() {
  return path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"));
}

function claudeHomePath() {
  return path.resolve(
    process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude")
  );
}

async function collectSnapshot() {
  const codexHome = codexHomePath();
  const claudeProjectsPath = path.join(claudeHomePath(), "projects");
  const codexEntries = await listDirectory(codexHome);
  const codexDatabases = codexEntries
    .filter((entry) => entry.isFile() && /^state_\d+\.sqlite$/u.test(entry.name))
    .map((entry) => ({
      path: path.join(codexHome, entry.name),
      version: Number(entry.name.match(/^state_(\d+)\.sqlite$/u)?.[1] || 0)
    }))
    .sort((left, right) => right.version - left.version);

  const [activeCodexFiles, archivedCodexFiles] = await Promise.all([
    findJsonLines(path.join(codexHome, "sessions")),
    findJsonLines(path.join(codexHome, "archived_sessions"))
  ]);

  const claudeProjects = [];
  for (const entry of await listDirectory(claudeProjectsPath)) {
    if (!entry.isDirectory()) continue;
    const directoryPath = path.join(claudeProjectsPath, entry.name);
    const directEntries = await listDirectory(directoryPath);
    claudeProjects.push({
      directoryPath,
      indexPath: path.join(directoryPath, "sessions-index.json"),
      jsonlPaths: directEntries
        .filter((item) => item.isFile() && item.name.endsWith(".jsonl"))
        .map((item) => path.join(directoryPath, item.name))
    });
  }

  const codexSessionIndexPath = path.join(codexHome, "session_index.jsonl");
  const signaturePaths = [
    ...activeCodexFiles,
    ...archivedCodexFiles,
    codexSessionIndexPath,
    ...codexDatabases.flatMap((database) => [
      database.path,
      `${database.path}-wal`,
      `${database.path}-shm`
    ]),
    ...claudeProjects.flatMap((project) => [project.indexPath, ...project.jsonlPaths])
  ];
  const signatureParts = [];
  const fileFingerprints = new Map();
  for (const filePath of [...new Set(signaturePaths)].sort()) {
    const stats = await statOrNull(filePath);
    if (stats) {
      const fingerprint = `${stats.mtimeMs}\0${stats.size}`;
      fileFingerprints.set(filePath, fingerprint);
      signatureParts.push(`${filePath}\0${fingerprint}`);
    }
  }

  return {
    codexDatabases,
    codexJsonlPaths: [...new Set([...activeCodexFiles, ...archivedCodexFiles])],
    codexSessionIndexPath,
    claudeProjects,
    fileFingerprints,
    signature: crypto.createHash("sha256").update(signatureParts.join("\n")).digest("hex")
  };
}

async function runSqlite(databasePath, sql) {
  const { stdout } = await execFileAsync(
    "/usr/bin/sqlite3",
    ["-readonly", "-cmd", ".timeout 1000", "-json", databasePath, sql],
    {
      encoding: "utf8",
      maxBuffer: MAX_SQLITE_BUFFER,
      timeout: 15_000,
      windowsHide: true
    }
  );

  if (!stdout.trim()) return [];
  const value = JSON.parse(stdout);
  return Array.isArray(value) ? value : [];
}

async function loadCodexDatabase(databaseCandidates) {
  const desiredColumns = [
    "id",
    "rollout_path",
    "created_at",
    "updated_at",
    "created_at_ms",
    "updated_at_ms",
    "source",
    "model_provider",
    "model",
    "cwd",
    "title",
    "first_user_message",
    "preview",
    "tokens_used",
    "archived",
    "git_branch",
    "agent_path",
    "sandbox_policy",
    "approval_mode",
    "cli_version"
  ];

  for (const database of databaseCandidates) {
    try {
      const tableColumns = await runSqlite(database.path, "PRAGMA table_info(threads);");
      const available = new Set(tableColumns.map((column) => column.name));
      if (!available.has("id")) continue;

      const selections = desiredColumns.map((column) =>
        available.has(column) ? `"${column}"` : `NULL AS "${column}"`
      );
      const rows = await runSqlite(
        database.path,
        `SELECT ${selections.join(", ")} FROM threads;`
      );
      return { databasePath: database.path, rows };
    } catch {
      // Try the next schema generation, then fall back to rollout JSONL.
    }
  }

  return { databasePath: "", rows: [] };
}

function isSubagentSource(source) {
  if (!source) return false;
  if (typeof source === "object") return Boolean(source.subagent);
  if (typeof source !== "string") return false;

  try {
    return Boolean(JSON.parse(source)?.subagent);
  } catch {
    return /"subagent"\s*:/u.test(source);
  }
}

async function loadCodexNames(filePath) {
  const names = new Map();
  await visitJsonLines(filePath, (record) => {
    if (typeof record?.id === "string" && typeof record?.thread_name === "string") {
      names.set(record.id, cleanText(record.thread_name, 400));
    }
  });
  return names;
}

function idFromFilePath(filePath) {
  return path.basename(filePath, path.extname(filePath)).match(UUID_PATTERN)?.[0] || "";
}

function tokenTotalFromCodexUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const explicitTotal = nonNegativeInteger(usage.total_tokens);
  if (explicitTotal !== null) return explicitTotal;

  // Cached input is a subset of input and reasoning is a subset of output.
  const input = nonNegativeInteger(usage.input_tokens);
  const output = nonNegativeInteger(usage.output_tokens);
  if (input !== null || output !== null) {
    return (input || 0) + (output || 0);
  }

  return null;
}

function tokenBreakdownFromCodexUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  return strictTokenBreakdown({
    input: usage.input_tokens,
    output: usage.output_tokens,
    cacheRead: usage.cached_input_tokens,
    cacheWrite: usage.cache_write_input_tokens,
    reasoning: usage.reasoning_output_tokens
  });
}

async function parseCodexTranscript(filePath) {
  const fileId = idFromFilePath(filePath);
  const result = {
    id: fileId,
    cwd: "",
    createdAt: "",
    updatedAt: "",
    model: "",
    branch: "",
    tokenUsage: null,
    tokenBreakdown: null,
    estimatedCostUsd: null,
    summary: "",
    firstPrompt: "",
    source: "",
    permissionMode: "",
    sandboxMode: "",
    cliVersion: "",
    turnCount: null,
    toolCallCount: null,
    agentPath: ""
  };
  let selectedMetaMatchesFile = false;
  let parsedRecordCount = 0;
  let sawEventMessage = false;
  let eventUserMessageCount = 0;
  let responseUserMessageCount = 0;
  let eventFirstPrompt = "";
  let responseFirstPrompt = "";
  let anonymousToolCallCount = 0;
  let accumulatedCostUsd = 0;
  let costUsageSeen = false;
  let costComplete = true;
  let costTrackedTokenTotal = 0;
  let costModelSeen = false;
  const trackedTokenBreakdown = {
    input: null,
    output: null,
    cacheRead: null,
    cacheWrite: null,
    reasoning: null
  };
  const toolCallIds = new Set();

  await visitJsonLines(filePath, (record) => {
    parsedRecordCount += 1;
    const timestamp = isoTimestamp(record?.timestamp);
    if (timestamp) {
      result.createdAt = earlierTimestamp(result.createdAt, timestamp);
      result.updatedAt = laterTimestamp(result.updatedAt, timestamp);
    }

    const payload = record?.payload;
    if (record?.type === "session_meta" && payload && typeof payload === "object") {
      const candidateId =
        typeof payload.id === "string"
          ? payload.id
          : typeof payload.session_id === "string"
            ? payload.session_id
            : "";
      const matchesFile = Boolean(fileId && candidateId === fileId);
      if (!result.id || !selectedMetaMatchesFile || matchesFile) {
        if (candidateId) result.id = candidateId;
        if (typeof payload.cwd === "string") result.cwd = payload.cwd;
        if (payload.git && typeof payload.git === "object") {
          if (typeof payload.git.branch === "string") result.branch = payload.git.branch;
        }
        result.source = normalizeSourceSurface(payload.originator, payload.source);
        if (typeof payload.cli_version === "string") {
          result.cliVersion = payload.cli_version;
        }
        result.agentPath = typeof payload.agent_path === "string" ? payload.agent_path : "";
        selectedMetaMatchesFile = matchesFile;
      }
      return;
    }

    if (record?.type === "turn_context" && payload && typeof payload === "object") {
      if (typeof payload.model === "string") result.model = payload.model;
      if (typeof payload.cwd === "string") result.cwd = payload.cwd;
      if (typeof payload.approval_policy === "string") {
        result.permissionMode = payload.approval_policy;
      }
      const sandboxMode = policyName(payload.sandbox_policy);
      if (sandboxMode) result.sandboxMode = sandboxMode;
      return;
    }

    if (record?.type === "event_msg" && payload && typeof payload === "object") {
      sawEventMessage = true;
      if (payload.type === "user_message") {
        eventUserMessageCount += 1;
        if (!eventFirstPrompt) eventFirstPrompt = cleanText(payload.message, 8_000);
      } else if (payload.type === "agent_message") {
        const message = cleanText(payload.message, 4_000);
        if (message) result.summary = message;
      } else if (payload.type === "task_complete") {
        const message = cleanText(payload.last_agent_message, 4_000);
        if (message) result.summary = message;
      } else if (payload.type === "token_count") {
        const usage = payload.info?.total_token_usage;
        const total = tokenTotalFromCodexUsage(usage);
        if (total !== null) result.tokenUsage = total;
        const breakdown = tokenBreakdownFromCodexUsage(usage);
        if (breakdown) result.tokenBreakdown = breakdown;

        const lastUsage = payload.info?.last_token_usage;
        const lastTotal = tokenTotalFromCodexUsage(lastUsage);
        const lastBreakdown = tokenBreakdownFromCodexUsage(lastUsage);
        if (lastTotal !== null && lastTotal > 0 && lastBreakdown) {
          costUsageSeen = true;
          costTrackedTokenTotal += lastTotal;
          addTokenBreakdown(trackedTokenBreakdown, lastBreakdown);
          if (result.model.trim()) costModelSeen = true;
          const cost = estimateTokenCostUsd(result.model, lastBreakdown);
          if (cost === null) {
            costComplete = false;
          } else {
            accumulatedCostUsd += cost;
          }
        }
      }
      return;
    }

    if (record?.type === "response_item" && payload && typeof payload === "object") {
      if (typeof payload.type === "string" && payload.type.endsWith("_call")) {
        const callId = cleanText(payload.call_id || payload.id, 200);
        if (callId) {
          toolCallIds.add(callId);
        } else {
          anonymousToolCallCount += 1;
          toolCallIds.add(`anonymous:${anonymousToolCallCount}`);
        }
      }

      if (payload.type === "message") {
        const message = cleanText(textFromContent(payload.content), 8_000);
        if (payload.role === "user") {
          responseUserMessageCount += 1;
          if (!responseFirstPrompt && message) responseFirstPrompt = message;
        } else if (payload.role === "assistant" && message) {
          result.summary = cleanText(message, 4_000);
        }
      }
    }
  });

  result.firstPrompt = eventFirstPrompt || responseFirstPrompt;
  result.turnCount =
    parsedRecordCount === 0
      ? null
      : sawEventMessage
      ? eventUserMessageCount
      : responseUserMessageCount;
  result.toolCallCount = parsedRecordCount > 0 ? toolCallIds.size : null;
  if (costTrackedTokenTotal > (result.tokenUsage || 0)) {
    result.tokenUsage = costTrackedTokenTotal;
    result.tokenBreakdown = strictTokenBreakdown(trackedTokenBreakdown);
  }
  result.aggregateCostFallbackAllowed =
    Boolean(result.tokenBreakdown) && (!costUsageSeen || !costModelSeen);
  if (!costUsageSeen && result.tokenBreakdown) {
    const fallbackCost = estimateTokenCostUsd(result.model, result.tokenBreakdown);
    if (fallbackCost !== null) {
      accumulatedCostUsd = fallbackCost;
      costUsageSeen = true;
    }
  }
  if (
    costTrackedTokenTotal > 0 &&
    result.tokenUsage !== null &&
    costTrackedTokenTotal < result.tokenUsage
  ) {
    costComplete = false;
  }
  result.estimatedCostUsd = costUsageSeen && costComplete ? accumulatedCostUsd : null;

  const stats = await statOrNull(filePath);
  if (stats) {
    const createdFallback = isoTimestamp(stats.birthtimeMs || stats.ctimeMs);
    const updatedFallback = isoTimestamp(stats.mtimeMs);
    result.createdAt = result.createdAt || createdFallback;
    result.updatedAt = laterTimestamp(result.updatedAt, updatedFallback);
  }

  return result;
}

async function validatedClaudeIndex(project) {
  let index;
  try {
    index = JSON.parse(await fs.readFile(project.indexPath, "utf8"));
  } catch {
    return { entries: new Map(), originalPath: "" };
  }

  const directFiles = new Map(
    project.jsonlPaths.map((filePath) => [path.resolve(filePath), filePath])
  );
  const entries = new Map();

  for (const entry of Array.isArray(index?.entries) ? index.entries : []) {
    if (
      !entry ||
      typeof entry.sessionId !== "string" ||
      typeof entry.fullPath !== "string" ||
      !Number.isFinite(Number(entry.fileMtime))
    ) {
      continue;
    }

    const fullPath = path.resolve(project.directoryPath, entry.fullPath);
    const directPath = directFiles.get(fullPath);
    if (!directPath || idFromFilePath(directPath) !== entry.sessionId) continue;
    const stats = await statOrNull(directPath);
    if (!stats || Math.abs(stats.mtimeMs - Number(entry.fileMtime)) > 2_000) continue;
    entries.set(entry.sessionId, entry);
  }

  return {
    entries,
    originalPath: typeof index?.originalPath === "string" ? index.originalPath : ""
  };
}

function claudeUsageBreakdown(usage) {
  if (!usage || typeof usage !== "object") return null;
  return strictTokenBreakdown({
    input: usage.input_tokens,
    output: usage.output_tokens,
    cacheRead: usage.cache_read_input_tokens,
    cacheWrite: usage.cache_creation_input_tokens,
    reasoning: null
  });
}

function claudeUsageTotal(usage) {
  const breakdown = claudeUsageBreakdown(usage);
  if (!breakdown) return null;
  return [breakdown.input, breakdown.output, breakdown.cacheRead, breakdown.cacheWrite]
    .reduce((total, value) => total + (value || 0), 0);
}

function isRealClaudePrompt(record) {
  if (record?.type !== "user" || record.isMeta === true) return false;
  if (record.sourceToolUseID || record.sourceToolAssistantUUID || record.toolUseResult) {
    return false;
  }
  const content = record.message?.content;
  if (Array.isArray(content) && content.some((block) => block?.type === "tool_result")) {
    return false;
  }
  return true;
}

async function parseClaudeTranscript(filePath) {
  const fileId = idFromFilePath(filePath);
  const usageByMessageId = new Map();
  const promptIds = new Set();
  const toolCallIds = new Set();
  const result = {
    id: fileId,
    cwd: "",
    initialCwd: "",
    createdAt: "",
    updatedAt: "",
    model: "",
    branch: "",
    tokenUsage: null,
    tokenBreakdown: null,
    estimatedCostUsd: null,
    title: "",
    summary: "",
    firstPrompt: "",
    source: "",
    permissionMode: "",
    sandboxMode: "",
    cliVersion: "",
    turnCount: null,
    toolCallCount: null,
    sawMainRecord: false,
    sawSidechainRecord: false
  };
  let eventPermissionMode = "";
  let recordPermissionMode = "";
  let parsedMainRecordCount = 0;
  let anonymousPromptCount = 0;
  let anonymousToolCallCount = 0;

  await visitJsonLines(filePath, (record) => {
    const recordId = typeof record?.sessionId === "string" ? record.sessionId : "";
    if (!result.id && recordId) result.id = recordId;
    const isCoreRecord = ["user", "assistant", "system", "attachment"].includes(
      record?.type
    );
    if (record.isSidechain === false || (record.isSidechain !== true && isCoreRecord)) {
      result.sawMainRecord = true;
    }
    if (record.isSidechain === true) {
      result.sawSidechainRecord = true;
      return;
    }
    if (isCoreRecord) parsedMainRecordCount += 1;

    const timestamp = isoTimestamp(record?.timestamp);
    if (timestamp) {
      result.createdAt = earlierTimestamp(result.createdAt, timestamp);
      result.updatedAt = laterTimestamp(result.updatedAt, timestamp);
    }
    if (typeof record?.cwd === "string" && record.cwd) {
      if (!result.initialCwd) result.initialCwd = record.cwd;
      result.cwd = record.cwd;
    }
    if (typeof record?.gitBranch === "string") result.branch = record.gitBranch;
    if (typeof record?.entrypoint === "string" && record.entrypoint) {
      result.source = normalizeSourceSurface(record.entrypoint);
    }
    if (typeof record?.version === "string" && record.version) {
      result.cliVersion = record.version;
    }
    if (typeof record?.permissionMode === "string" && record.permissionMode) {
      recordPermissionMode = record.permissionMode;
    }

    if (
      record?.type === "permission-mode" &&
      typeof record.permissionMode === "string" &&
      record.permissionMode
    ) {
      eventPermissionMode = record.permissionMode;
      return;
    }

    if (record?.type === "ai-title" && typeof record.aiTitle === "string") {
      result.title = cleanText(record.aiTitle, 400);
      return;
    }

    if (isRealClaudePrompt(record)) {
      const promptId = cleanText(record.uuid || record.promptId, 200);
      if (promptId) {
        promptIds.add(promptId);
      } else {
        anonymousPromptCount += 1;
        promptIds.add(`anonymous:${anonymousPromptCount}`);
      }
      if (!result.firstPrompt) {
        result.firstPrompt = cleanText(textFromContent(record.message?.content), 8_000);
      }
      return;
    }

    if (record?.type !== "assistant" || !record.message) return;
    if (
      typeof record.message.model === "string" &&
      record.message.model &&
      record.message.model !== "<synthetic>"
    ) {
      result.model = record.message.model;
    }

    const assistantText = cleanText(
      textFromContent(record.message.content, new Set(["text", "output_text"])),
      4_000
    );
    if (assistantText) result.summary = assistantText;

    if (Array.isArray(record.message.content)) {
      record.message.content.forEach((block, index) => {
        if (!block || block.type !== "tool_use") return;
        const callId = cleanText(block.id, 200);
        if (callId) {
          toolCallIds.add(callId);
          return;
        }
        const messageId = cleanText(record.message.id, 200);
        if (messageId) {
          toolCallIds.add(`${messageId}:${index}`);
          return;
        }
        anonymousToolCallCount += 1;
        toolCallIds.add(`anonymous:${anonymousToolCallCount}`);
      });
    }

    if (typeof record.message.id === "string" && record.message.usage) {
      usageByMessageId.set(record.message.id, {
        model: record.message.model,
        usage: record.message.usage
      });
    }
  });

  if (usageByMessageId.size) {
    const totals = {
      input: null,
      output: null,
      cacheRead: null,
      cacheWrite: null,
      reasoning: null
    };
    let recognizedUsage = false;
    let accumulatedCostUsd = 0;
    let costComplete = true;
    const tokenUsage = [...usageByMessageId.values()].reduce((total, entry) => {
      const { model, usage } = entry;
      const breakdown = claudeUsageBreakdown(usage);
      if (breakdown) {
        recognizedUsage = true;
        if (breakdown.input !== null) {
          totals.input = (totals.input || 0) + breakdown.input;
        }
        if (breakdown.output !== null) {
          totals.output = (totals.output || 0) + breakdown.output;
        }
        if (breakdown.cacheRead !== null) {
          totals.cacheRead = (totals.cacheRead || 0) + breakdown.cacheRead;
        }
        if (breakdown.cacheWrite !== null) {
          totals.cacheWrite = (totals.cacheWrite || 0) + breakdown.cacheWrite;
        }

        const speed = typeof usage.speed === "string" ? usage.speed.toLowerCase() : "";
        const inferenceGeo =
          typeof usage.inference_geo === "string"
            ? usage.inference_geo.toLowerCase()
            : "";
        const cost =
          speed && speed !== "standard"
            ? null
            : estimateTokenCostUsd(model, breakdown, {
                cacheWrite5mTokens:
                  usage.cache_creation?.ephemeral_5m_input_tokens,
                cacheWrite1hTokens:
                  usage.cache_creation?.ephemeral_1h_input_tokens,
                multiplier: inferenceGeo.startsWith("us") ? 1.1 : 1
              });
        if (cost === null) {
          costComplete = false;
        } else {
          accumulatedCostUsd += cost;
        }
      }
      return total + (claudeUsageTotal(usage) || 0);
    }, 0);
    if (recognizedUsage) {
      result.tokenUsage = tokenUsage;
      result.tokenBreakdown = strictTokenBreakdown(totals);
      result.estimatedCostUsd = costComplete ? accumulatedCostUsd : null;
    }
  }

  result.permissionMode = eventPermissionMode || recordPermissionMode;
  result.turnCount = parsedMainRecordCount > 0 ? promptIds.size : null;
  result.toolCallCount = parsedMainRecordCount > 0 ? toolCallIds.size : null;

  const stats = await statOrNull(filePath);
  if (stats) {
    result.createdAt = result.createdAt || isoTimestamp(stats.birthtimeMs || stats.ctimeMs);
    result.updatedAt = laterTimestamp(result.updatedAt, isoTimestamp(stats.mtimeMs));
  }

  return result;
}

async function resolveProjectPath(inputPath, canonicalize, cache) {
  if (typeof inputPath !== "string" || !inputPath.trim()) return "";
  const key = path.resolve(inputPath);
  if (!cache.has(key)) {
    cache.set(
      key,
      Promise.resolve(canonicalize(key)).catch(() => key)
    );
  }
  const value = await cache.get(key);
  return typeof value === "string" && value ? value : key;
}

async function resolveWorktreePath(inputPath, resolveWorktree, cache) {
  if (typeof inputPath !== "string" || !inputPath.trim()) return "";
  const key = path.resolve(inputPath);
  if (!cache.has(key)) {
    cache.set(
      key,
      Promise.resolve(resolveWorktree(key)).catch(() => "")
    );
  }
  const value = await cache.get(key);
  return typeof value === "string" && path.isAbsolute(value) ? value : "";
}

async function resolveSessionPaths(
  inputPath,
  canonicalize,
  resolveWorktree,
  projectPathCache,
  worktreePathCache
) {
  const worktreePath = await resolveWorktreePath(
    inputPath,
    resolveWorktree,
    worktreePathCache
  );
  const projectPath = await resolveProjectPath(
    worktreePath || inputPath,
    canonicalize,
    projectPathCache
  );
  return { projectPath, worktreePath };
}

function strictSession(session) {
  const workingDirectory =
    typeof session.workingDirectory === "string" && session.workingDirectory.trim()
      ? path.normalize(session.workingDirectory.trim())
      : "";
  return {
    id: String(session.id || ""),
    agent: session.agent === "claude" ? "claude" : "codex",
    title: cleanText(session.title, 400),
    createdAt: isoTimestamp(session.createdAt),
    updatedAt: isoTimestamp(session.updatedAt),
    model: cleanText(session.model, 200),
    branch: cleanText(session.branch, 500),
    tokenUsage:
      session.tokenUsage === null || finiteNumber(session.tokenUsage) === null
        ? null
        : Math.max(0, Math.round(finiteNumber(session.tokenUsage))),
    summary: cleanText(session.summary, 4_000),
    firstPrompt: cleanText(session.firstPrompt, 8_000),
    workingDirectory,
    worktreePath:
      typeof session.worktreePath === "string" && path.isAbsolute(session.worktreePath)
        ? path.normalize(session.worktreePath)
        : "",
    turnCount: nonNegativeInteger(session.turnCount),
    toolCallCount: nonNegativeInteger(session.toolCallCount),
    tokenBreakdown: strictTokenBreakdown(session.tokenBreakdown),
    estimatedCostUsd: nonNegativeNumber(session.estimatedCostUsd),
    source: cleanText(session.source, 120),
    permissionMode: cleanText(session.permissionMode, 160),
    sandboxMode: cleanText(session.sandboxMode, 160),
    cliVersion: cleanText(session.cliVersion, 120),
    projectPath: typeof session.projectPath === "string" ? session.projectPath : ""
  };
}

function cloneSessions(sessions) {
  return sessions.map((session) => ({
    ...session,
    tokenBreakdown: session.tokenBreakdown ? { ...session.tokenBreakdown } : null
  }));
}

function createSessionScanner({ canonicalProjectPath, worktreeRootPath } = {}) {
  if (typeof canonicalProjectPath !== "function") {
    throw new TypeError("createSessionScanner requires canonicalProjectPath.");
  }
  if (typeof worktreeRootPath !== "function") {
    throw new TypeError("createSessionScanner requires worktreeRootPath.");
  }

  let cache = null;
  let scanPromise = null;
  const codexTranscriptCache = new Map();
  const claudeTranscriptCache = new Map();

  async function cachedTranscript(filePath, snapshot, transcriptCache, parser) {
    const fingerprint = snapshot.fileFingerprints.get(filePath) || "";
    const cached = transcriptCache.get(filePath);
    if (fingerprint && cached?.fingerprint === fingerprint) {
      return cached.transcript;
    }

    const transcript = await parser(filePath);
    if (fingerprint) {
      transcriptCache.set(filePath, { fingerprint, transcript });
    }
    return transcript;
  }

  function pruneTranscriptCache(transcriptCache, currentPaths) {
    const current = new Set(currentPaths);
    for (const filePath of transcriptCache.keys()) {
      if (!current.has(filePath)) {
        transcriptCache.delete(filePath);
      }
    }
  }

  async function scanCodex(snapshot, projectPathCache, worktreePathCache) {
    const [database, names, transcripts] = await Promise.all([
      loadCodexDatabase(snapshot.codexDatabases),
      loadCodexNames(snapshot.codexSessionIndexPath),
      mapLimit(snapshot.codexJsonlPaths, 8, (filePath) =>
        cachedTranscript(
          filePath,
          snapshot,
          codexTranscriptCache,
          parseCodexTranscript
        )
      )
    ]);
    const transcriptById = new Map();
    for (const transcript of transcripts) {
      if (transcript?.id) transcriptById.set(transcript.id, transcript);
    }

    const sessions = [];
    const databaseIds = new Set();
    for (const row of database.rows) {
      if (typeof row?.id !== "string" || !row.id) continue;
      if (cleanText(row.agent_path, 500) || isSubagentSource(row.source)) continue;
      databaseIds.add(row.id);

      const transcript = transcriptById.get(row.id) || {};
      const cwd = transcript.cwd || (typeof row.cwd === "string" ? row.cwd : "");
      const { projectPath, worktreePath } = await resolveSessionPaths(
        cwd,
        canonicalProjectPath,
        worktreeRootPath,
        projectPathCache,
        worktreePathCache
      );
      const firstPrompt = cleanText(row.first_user_message, 8_000) || transcript.firstPrompt || "";
      const databaseTokenUsage = nonNegativeInteger(row.tokens_used);
      const databaseTokenFallback =
        databaseTokenUsage !== null && databaseTokenUsage > 0
          ? databaseTokenUsage
          : null;

      sessions.push(
        strictSession({
          id: row.id,
          agent: "codex",
          title: names.get(row.id) || cleanText(row.title, 400) || titleFrom(firstPrompt),
          createdAt:
            isoTimestamp(row.created_at_ms) ||
            isoTimestamp(row.created_at) ||
            transcript.createdAt,
          updatedAt:
            isoTimestamp(row.updated_at_ms) ||
            isoTimestamp(row.updated_at) ||
            transcript.updatedAt,
          model: row.model || transcript.model || "",
          branch: row.git_branch || transcript.branch || "",
          tokenUsage: transcript.tokenUsage ?? databaseTokenFallback,
          tokenBreakdown: transcript.tokenBreakdown,
          estimatedCostUsd:
            transcript.estimatedCostUsd ??
            (transcript.aggregateCostFallbackAllowed
              ? estimateTokenCostUsd(
                  row.model || transcript.model,
                  transcript.tokenBreakdown
                )
              : null),
          summary: transcript.summary || "",
          firstPrompt,
          workingDirectory: cwd,
          worktreePath,
          turnCount: transcript.turnCount,
          toolCallCount: transcript.toolCallCount,
          source: transcript.source || normalizeSourceSurface(row.source),
          permissionMode:
            transcript.permissionMode || cleanText(row.approval_mode, 160),
          sandboxMode: transcript.sandboxMode || policyName(row.sandbox_policy),
          cliVersion: transcript.cliVersion || cleanText(row.cli_version, 120),
          projectPath
        })
      );
    }

    for (const transcript of transcripts) {
      if (
        !transcript?.id ||
        databaseIds.has(transcript.id) ||
        transcript.agentPath ||
        isSubagentSource(transcript.source)
      ) {
        continue;
      }
      const { projectPath, worktreePath } = await resolveSessionPaths(
        transcript.cwd,
        canonicalProjectPath,
        worktreeRootPath,
        projectPathCache,
        worktreePathCache
      );
      sessions.push(
        strictSession({
          id: transcript.id,
          agent: "codex",
          title: names.get(transcript.id) || titleFrom(transcript.firstPrompt),
          createdAt: transcript.createdAt,
          updatedAt: transcript.updatedAt,
          model: transcript.model,
          branch: transcript.branch,
          tokenUsage: transcript.tokenUsage,
          tokenBreakdown: transcript.tokenBreakdown,
          estimatedCostUsd: transcript.estimatedCostUsd,
          summary: transcript.summary,
          firstPrompt: transcript.firstPrompt,
          workingDirectory: transcript.cwd,
          worktreePath,
          turnCount: transcript.turnCount,
          toolCallCount: transcript.toolCallCount,
          source: transcript.source,
          permissionMode: transcript.permissionMode,
          sandboxMode: transcript.sandboxMode,
          cliVersion: transcript.cliVersion,
          projectPath
        })
      );
    }

    return sessions;
  }

  async function scanClaude(snapshot, projectPathCache, worktreePathCache) {
    const sessions = [];
    for (const project of snapshot.claudeProjects) {
      const validatedIndex = await validatedClaudeIndex(project);
      const transcripts = await mapLimit(project.jsonlPaths, 8, (filePath) =>
        cachedTranscript(
          filePath,
          snapshot,
          claudeTranscriptCache,
          parseClaudeTranscript
        )
      );

      for (const transcript of transcripts) {
        if (!transcript?.id) continue;
        const indexEntry = validatedIndex.entries.get(transcript.id);
        if (
          indexEntry?.isSidechain === true ||
          (!transcript.sawMainRecord && transcript.sawSidechainRecord)
        ) {
          continue;
        }

        const workingDirectory =
          transcript.cwd ||
          (typeof indexEntry?.projectPath === "string" ? indexEntry.projectPath : "") ||
          validatedIndex.originalPath ||
          transcript.initialCwd;
        const { projectPath, worktreePath } = await resolveSessionPaths(
          workingDirectory,
          canonicalProjectPath,
          worktreeRootPath,
          projectPathCache,
          worktreePathCache
        );
        const firstPrompt =
          (typeof indexEntry?.firstPrompt === "string"
            ? cleanText(indexEntry.firstPrompt, 8_000)
            : "") || transcript.firstPrompt;
        const indexSummary =
          typeof indexEntry?.summary === "string"
            ? cleanText(indexEntry.summary, 4_000)
            : "";

        sessions.push(
          strictSession({
            id: transcript.id,
            agent: "claude",
            title: transcript.title || indexSummary || titleFrom(firstPrompt),
            createdAt: isoTimestamp(indexEntry?.created) || transcript.createdAt,
            updatedAt: isoTimestamp(indexEntry?.modified) || transcript.updatedAt,
            model: transcript.model,
            branch: transcript.branch || indexEntry?.gitBranch || "",
            tokenUsage: transcript.tokenUsage,
            tokenBreakdown: transcript.tokenBreakdown,
            estimatedCostUsd: transcript.estimatedCostUsd,
            summary: transcript.summary || indexSummary,
            firstPrompt,
            workingDirectory,
            worktreePath,
            turnCount: transcript.turnCount,
            toolCallCount: transcript.toolCallCount,
            source: transcript.source,
            permissionMode: transcript.permissionMode,
            sandboxMode: transcript.sandboxMode,
            cliVersion: transcript.cliVersion,
            projectPath
          })
        );
      }
    }

    return sessions;
  }

  async function performScan({ force = false } = {}) {
    const now = Date.now();
    if (!force && cache && now - cache.checkedAt < CACHE_TTL_MS) {
      return cache.sessions;
    }

    const snapshot = await collectSnapshot();
    if (!force && cache && cache.signature === snapshot.signature) {
      cache.checkedAt = Date.now();
      return cache.sessions;
    }

    pruneTranscriptCache(codexTranscriptCache, snapshot.codexJsonlPaths);
    pruneTranscriptCache(
      claudeTranscriptCache,
      snapshot.claudeProjects.flatMap((project) => project.jsonlPaths)
    );

    const projectPathCache = new Map();
    const worktreePathCache = new Map();
    const [codexSessions, claudeSessions] = await Promise.all([
      scanCodex(snapshot, projectPathCache, worktreePathCache),
      scanClaude(snapshot, projectPathCache, worktreePathCache)
    ]);

    const byAgentAndId = new Map();
    for (const session of [...codexSessions, ...claudeSessions]) {
      if (!session.id) continue;
      const key = `${session.agent}:${session.id}`;
      const current = byAgentAndId.get(key);
      if (!current || Date.parse(session.updatedAt || 0) >= Date.parse(current.updatedAt || 0)) {
        byAgentAndId.set(key, session);
      }
    }

    const sessions = [...byAgentAndId.values()].sort((left, right) => {
      return Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0);
    });
    cache = { checkedAt: Date.now(), signature: snapshot.signature, sessions };
    return sessions;
  }

  async function scanSessions(options = {}) {
    if (!scanPromise) {
      scanPromise = performScan(options).finally(() => {
        scanPromise = null;
      });
    }
    return cloneSessions(await scanPromise);
  }

  return { scanSessions };
}

module.exports = {
  createSessionScanner
};
