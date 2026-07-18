const fs = require("node:fs/promises");
const path = require("node:path");

const STORE_VERSION = 3;
const defaultSettings = Object.freeze({
  editorId: "auto",
  customEditorPath: null,
  launchAtLogin: false,
  language: "en",
  theme: "system"
});

function normalizeSettings(value) {
  let editorId =
    typeof value?.editorId === "string" && value.editorId.trim()
      ? value.editorId.trim().slice(0, 64)
      : defaultSettings.editorId;
  const customEditorPath =
    typeof value?.customEditorPath === "string" &&
    value.customEditorPath.length <= 8_192 &&
    !value.customEditorPath.includes("\0") &&
    path.isAbsolute(value.customEditorPath) &&
    path.extname(value.customEditorPath).toLowerCase() === ".app"
      ? path.normalize(value.customEditorPath)
      : null;

  if (editorId === "custom" && !customEditorPath) {
    editorId = defaultSettings.editorId;
  }

  return {
    editorId,
    customEditorPath,
    launchAtLogin: Boolean(value?.launchAtLogin),
    language: value?.language === "zh" ? "zh" : "en",
    theme:
      value?.theme === "light" || value?.theme === "dark"
        ? value.theme
        : "system"
  };
}

function normalizeProject(value) {
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.path !== "string" ||
    !path.isAbsolute(value.path)
  ) {
    return null;
  }

  return {
    id: value.id.trim().slice(0, 128),
    path: path.normalize(value.path),
    pinned: Boolean(value.pinned),
    pinOrder:
      Boolean(value.pinned) &&
      Number.isSafeInteger(value.pinOrder) &&
      value.pinOrder >= 0
        ? value.pinOrder
        : null,
    addedAt:
      typeof value.addedAt === "string" && Number.isFinite(Date.parse(value.addedAt))
        ? new Date(value.addedAt).toISOString()
        : new Date(0).toISOString()
  };
}

function normalizeStore(value = {}) {
  const projects = [];
  const seenIds = new Set();
  const seenPaths = new Set();

  for (const candidate of Array.isArray(value?.projects) ? value.projects : []) {
    const project = normalizeProject(candidate);
    if (!project || seenIds.has(project.id) || seenPaths.has(project.path)) {
      continue;
    }

    seenIds.add(project.id);
    seenPaths.add(project.path);
    projects.push(project);
  }

  // STORE_VERSION 2 only persisted a boolean `pinned` field. Canonicalizing the
  // rank here migrates those records in their existing array order and also
  // repairs duplicate or sparse ranks without disturbing unpinned projects.
  projects
    .map((project, index) => ({ project, index }))
    .filter(({ project }) => project.pinned)
    .sort((left, right) => {
      const leftOrder = left.project.pinOrder ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.project.pinOrder ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.index - right.index;
    })
    .forEach(({ project }, index) => {
      project.pinOrder = index;
    });

  for (const project of projects) {
    if (!project.pinned) {
      project.pinOrder = null;
    }
  }

  return {
    version: STORE_VERSION,
    projects,
    settings: normalizeSettings(value?.settings)
  };
}

function createJsonStore({ getFilePath, onReadError = console.warn }) {
  if (typeof getFilePath !== "function") {
    throw new TypeError("getFilePath must be a function");
  }

  let mutationQueue = Promise.resolve();
  let temporaryFileCounter = 0;

  async function readFile() {
    const filePath = getFilePath();

    try {
      const contents = await fs.readFile(filePath, "utf8");
      return normalizeStore(JSON.parse(contents));
    } catch (error) {
      if (error?.code !== "ENOENT") {
        onReadError("Failed to read tonic state; using safe defaults.", error);
      }
      return normalizeStore();
    }
  }

  async function writeFile(value) {
    const filePath = getFilePath();
    const directoryPath = path.dirname(filePath);
    const normalized = normalizeStore(value);
    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.${temporaryFileCounter}.tmp`;
    temporaryFileCounter += 1;

    await fs.mkdir(directoryPath, { recursive: true, mode: 0o700 });

    let handle;
    try {
      handle = await fs.open(temporaryPath, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify(normalized, null, 2)}\n`, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await fs.rename(temporaryPath, filePath);
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await fs.unlink(temporaryPath).catch(() => undefined);
      throw error;
    }

    return normalized;
  }

  async function read() {
    await mutationQueue;
    return readFile();
  }

  function update(mutator) {
    if (typeof mutator !== "function") {
      return Promise.reject(new TypeError("mutator must be a function"));
    }

    const operation = mutationQueue.then(async () => {
      const current = await readFile();
      const result = await mutator(current);
      const stored = await writeFile(current);
      return result === undefined ? stored : result;
    });

    mutationQueue = operation.then(
      () => undefined,
      () => undefined
    );

    return operation;
  }

  return { read, update };
}

module.exports = {
  STORE_VERSION,
  createJsonStore,
  defaultSettings,
  normalizeSettings,
  normalizeStore
};
