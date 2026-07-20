const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage
} = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  customEditorOption,
  detectEditors,
  isKnownEditorId,
  openDirectoryWithEditor,
  resolveApplicationBundle
} = require("./editors.cjs");
const { buildResumeCommand } = require("./resume-command.cjs");
const {
  canonicalProjectPath,
  listWorktrees,
  worktreeRootPath
} = require("./git-service.cjs");
const { createSessionScanner } = require("./session-scanner.cjs");
const { createJsonStore } = require("./store.cjs");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const sessionScanner = createSessionScanner({ canonicalProjectPath, worktreeRootPath });
const stateStore = createJsonStore({
  getFilePath: () => path.join(app.getPath("userData"), "state.json")
});

const channels = Object.freeze({
  getBootstrap: "tonic:get-bootstrap",
  chooseProject: "tonic:choose-project",
  scanProjects: "tonic:scan-projects",
  removeProject: "tonic:remove-project",
  setProjectPinned: "tonic:set-project-pinned",
  reorderPinnedProjects: "tonic:reorder-pinned-projects",
  getProjectDetails: "tonic:get-project-details",
  openDirectory: "tonic:open-directory",
  copyResumeCommand: "tonic:copy-resume-command",
  chooseCustomEditor: "tonic:choose-custom-editor",
  saveSettings: "tonic:save-settings",
  menuChooseProject: "tonic:menu-choose-project",
  menuOpenSettings: "tonic:menu-open-settings",
  menuSelectTab: "tonic:menu-select-tab",
  menuToggleProjectPanel: "tonic:menu-toggle-project-panel"
});

class PublicError extends Error {}

let mainWindow = null;
let bootstrapPromise = null;

function projectIdForPath(projectPath) {
  return crypto.createHash("sha256").update(projectPath).digest("hex").slice(0, 32);
}

function normalizedPathKey(value) {
  return path.normalize(value);
}

function isSamePath(left, right) {
  return normalizedPathKey(left) === normalizedPathKey(right);
}

function assertProjectId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new PublicError("Invalid project identifier.");
  }
  return value;
}

function assertPinnedProjectOrder(value) {
  if (!Array.isArray(value) || value.length > 10_000) {
    throw new PublicError("Invalid pinned project order.");
  }

  const projectIds = value.map(assertProjectId);
  if (new Set(projectIds).size !== projectIds.length) {
    throw new PublicError("Invalid pinned project order.");
  }
  return projectIds;
}

function assertDirectoryPath(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 8_192 ||
    value.includes("\0") ||
    !path.isAbsolute(value)
  ) {
    throw new PublicError("Invalid directory path.");
  }
  return value;
}

function assertOptionalEditorId(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string" || !isKnownEditorId(value)) {
    throw new PublicError("Invalid editor selection.");
  }
  return value;
}

function assertResumeSession(value) {
  if (!value || (value.agent !== "codex" && value.agent !== "claude")) {
    throw new PublicError("Invalid coding agent.");
  }
  if (
    typeof value.id !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value.id)
  ) {
    throw new PublicError("Invalid session identifier.");
  }
  return { agent: value.agent, id: value.id };
}

function assertSettings(value) {
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.editorId !== "string" ||
    !isKnownEditorId(value.editorId) ||
    (value.customEditorPath !== null &&
      (typeof value.customEditorPath !== "string" ||
        value.customEditorPath.length === 0 ||
        value.customEditorPath.length > 8_192 ||
        value.customEditorPath.includes("\0") ||
        !path.isAbsolute(value.customEditorPath))) ||
    typeof value.launchAtLogin !== "boolean" ||
    typeof value.yoloMode !== "boolean" ||
    (value.language !== "en" && value.language !== "zh") ||
    (value.theme !== "system" && value.theme !== "light" && value.theme !== "dark")
  ) {
    throw new PublicError("Invalid settings.");
  }

  return {
    editorId: value.editorId,
    customEditorPath:
      typeof value.customEditorPath === "string"
        ? path.normalize(value.customEditorPath)
        : null,
    launchAtLogin: value.launchAtLogin,
    yoloMode: value.yoloMode,
    language: value.language,
    theme: value.theme
  };
}

async function existingDirectoryRealPath(inputPath) {
  const realPath = await fs.realpath(assertDirectoryPath(inputPath));
  const stats = await fs.stat(realPath);
  if (!stats.isDirectory()) {
    throw new PublicError("The selected item is not a directory.");
  }
  return path.normalize(realPath);
}

async function resolveProjectPath(inputPath) {
  const realPath = await existingDirectoryRealPath(inputPath);
  try {
    const canonicalPath = await canonicalProjectPath(realPath);
    return existingDirectoryRealPath(canonicalPath);
  } catch {
    return realPath;
  }
}

async function directoryExists(directoryPath) {
  try {
    const stats = await fs.stat(directoryPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

function safeIsoDate(value, fallback = new Date(0).toISOString()) {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : fallback;
}

function safeNonNegativeInteger(value) {
  return Number.isFinite(value) && value >= 0 ? Math.round(Number(value)) : null;
}

function safeTokenBreakdown(value) {
  if (!value || typeof value !== "object") return null;
  const breakdown = {
    input: safeNonNegativeInteger(value.input),
    output: safeNonNegativeInteger(value.output),
    cacheRead: safeNonNegativeInteger(value.cacheRead),
    cacheWrite: safeNonNegativeInteger(value.cacheWrite),
    reasoning: safeNonNegativeInteger(value.reasoning)
  };
  return Object.values(breakdown).every((item) => item === null) ? null : breakdown;
}

function toSessionRecord(session) {
  const createdAt = safeIsoDate(session?.createdAt);
  return {
    id: typeof session?.id === "string" ? session.id : "",
    agent: session?.agent === "claude" ? "claude" : "codex",
    title:
      typeof session?.title === "string" && session.title.trim()
        ? session.title.trim()
        : "Untitled session",
    createdAt,
    updatedAt: safeIsoDate(session?.updatedAt, createdAt),
    model: typeof session?.model === "string" ? session.model : "",
    branch: typeof session?.branch === "string" ? session.branch : "",
    tokenUsage:
      Number.isFinite(session?.tokenUsage) && session.tokenUsage >= 0
        ? Number(session.tokenUsage)
        : null,
    summary: typeof session?.summary === "string" ? session.summary : "",
    firstPrompt: typeof session?.firstPrompt === "string" ? session.firstPrompt : "",
    workingDirectory:
      typeof session?.workingDirectory === "string" &&
      path.isAbsolute(session.workingDirectory)
        ? path.normalize(session.workingDirectory)
        : "",
    worktreePath:
      typeof session?.worktreePath === "string" && path.isAbsolute(session.worktreePath)
        ? path.normalize(session.worktreePath)
        : "",
    turnCount: safeNonNegativeInteger(session?.turnCount),
    toolCallCount: safeNonNegativeInteger(session?.toolCallCount),
    tokenBreakdown: safeTokenBreakdown(session?.tokenBreakdown),
    source: typeof session?.source === "string" ? session.source : "",
    permissionMode:
      typeof session?.permissionMode === "string" ? session.permissionMode : "",
    sandboxMode: typeof session?.sandboxMode === "string" ? session.sandboxMode : "",
    cliVersion: typeof session?.cliVersion === "string" ? session.cliVersion : ""
  };
}

function sessionBelongsToProject(session, projectPath) {
  return (
    typeof session?.projectPath === "string" &&
    path.isAbsolute(session.projectPath) &&
    isSamePath(session.projectPath, projectPath)
  );
}

async function loadSessions({ force = false, tolerateFailure = false } = {}) {
  try {
    const sessions = await sessionScanner.scanSessions({ force });
    return Array.isArray(sessions) ? sessions : [];
  } catch (error) {
    console.warn("Unable to scan coding-agent sessions:", error?.message ?? error);
    if (tolerateFailure) {
      return [];
    }
    throw new PublicError("Could not scan coding-agent sessions.");
  }
}

async function worktreesForProject(projectPath) {
  try {
    const worktrees = await listWorktrees(projectPath);
    return Array.isArray(worktrees) ? worktrees : [];
  } catch (error) {
    console.warn("Unable to inspect Git worktrees:", error?.message ?? error);
    return [];
  }
}

async function makeProjectSummary(project, sessions, knownWorktrees) {
  const missing = !(await directoryExists(project.path));
  const projectSessions = sessions.filter((session) =>
    sessionBelongsToProject(session, project.path)
  );
  const worktrees = missing
    ? []
    : knownWorktrees ?? (await worktreesForProject(project.path));

  return {
    id: project.id,
    name: path.basename(project.path) || project.path,
    path: project.path,
    codexSessionCount: projectSessions.filter((session) => session.agent === "codex").length,
    claudeSessionCount: projectSessions.filter((session) => session.agent === "claude").length,
    worktreeCount: worktrees.length,
    missing,
    pinned: Boolean(project.pinned)
  };
}

function orderedProjects(state) {
  return state.projects
    .map((project, index) => ({ project, index }))
    .sort((left, right) => {
      if (left.project.pinned !== right.project.pinned) {
        return Number(right.project.pinned) - Number(left.project.pinned);
      }
      if (left.project.pinned) {
        return (
          (left.project.pinOrder ?? Number.MAX_SAFE_INTEGER) -
            (right.project.pinOrder ?? Number.MAX_SAFE_INTEGER) ||
          left.index - right.index
        );
      }

      const addedDifference =
        Date.parse(left.project.addedAt) - Date.parse(right.project.addedAt);
      return addedDifference || left.index - right.index;
    })
    .map(({ project }) => project);
}

function makeProjectPinStates(state) {
  return orderedProjects(state).map((project) => ({
    id: project.id,
    pinned: Boolean(project.pinned)
  }));
}

async function makeProjectSummaries(state, sessions) {
  const summaries = [];
  for (const project of orderedProjects(state)) {
    summaries.push(await makeProjectSummary(project, sessions));
  }
  return summaries;
}

function addProjectRecord(state, projectPath, addedAt = new Date().toISOString()) {
  if (state.projects.some((project) => isSamePath(project.path, projectPath))) {
    return false;
  }

  let id = projectIdForPath(projectPath);
  if (state.projects.some((project) => project.id === id && project.path !== projectPath)) {
    id = crypto.randomUUID().replaceAll("-", "");
  }

  state.projects.push({ id, path: projectPath, pinned: false, pinOrder: null, addedAt });
  return true;
}

async function chooseProject() {
  const currentState = await stateStore.read();
  const isChinese = currentState.settings.language === "zh";
  const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: isChinese ? "打开项目" : "Open Project",
    buttonLabel: isChinese ? "打开" : "Open",
    properties: ["openDirectory"]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  let projectPath;
  try {
    projectPath = await resolveProjectPath(result.filePaths[0]);
  } catch {
    throw new PublicError("The selected project directory is unavailable.");
  }

  const state = await stateStore.update((current) => {
    addProjectRecord(current, projectPath);
  });
  const sessions = await loadSessions({ tolerateFailure: true });
  const project = state.projects.find((candidate) => isSamePath(candidate.path, projectPath));
  return makeProjectSummary(project, sessions);
}

async function scanProjects() {
  const sessions = await loadSessions({ force: true });
  const rawPaths = new Set(
    sessions
      .map((session) => session?.projectPath)
      .filter((value) => typeof value === "string" && path.isAbsolute(value))
      .map(normalizedPathKey)
  );
  const discoveredPaths = [];

  for (const rawPath of rawPaths) {
    try {
      const projectPath = await resolveProjectPath(rawPath);
      if (!discoveredPaths.some((candidate) => isSamePath(candidate, projectPath))) {
        discoveredPaths.push(projectPath);
      }
    } catch {
      // Sessions may point at a deleted worktree. They should not create a broken project entry.
    }
  }

  let addedCount = 0;
  const state = await stateStore.update((current) => {
    for (const projectPath of discoveredPaths) {
      if (addProjectRecord(current, projectPath)) {
        addedCount += 1;
      }
    }
  });

  return {
    projects: await makeProjectSummaries(state, sessions),
    addedCount,
    discoveredSessionCount: sessions.length
  };
}

async function removeProject(projectId) {
  const id = assertProjectId(projectId);
  const state = await stateStore.update((current) => {
    current.projects = current.projects.filter((project) => project.id !== id);
  });
  const sessions = await loadSessions({ tolerateFailure: true });
  return makeProjectSummaries(state, sessions);
}

async function setProjectPinned(projectId, pinned) {
  const id = assertProjectId(projectId);
  if (typeof pinned !== "boolean") {
    throw new PublicError("Invalid pinned state.");
  }

  let found = false;
  const state = await stateStore.update((current) => {
    const project = current.projects.find((candidate) => candidate.id === id);
    if (!project) {
      throw new PublicError("Project not found.");
    }
    if (project.pinned === pinned) {
      found = true;
      return;
    }
    project.pinned = pinned;
    project.pinOrder = pinned
      ? current.projects.reduce(
          (maximum, candidate) =>
            candidate.pinned && Number.isSafeInteger(candidate.pinOrder)
              ? Math.max(maximum, candidate.pinOrder)
              : maximum,
          -1
        ) + 1
      : null;
    found = true;
  });

  if (!found) {
    throw new PublicError("Project not found.");
  }

  return makeProjectPinStates(state);
}

async function reorderPinnedProjects(value) {
  const projectIds = assertPinnedProjectOrder(value);
  const state = await stateStore.update((current) => {
    const pinnedProjects = current.projects.filter((project) => project.pinned);
    const currentIds = new Set(pinnedProjects.map((project) => project.id));

    if (
      currentIds.size !== projectIds.length ||
      projectIds.some((projectId) => !currentIds.has(projectId))
    ) {
      throw new PublicError("Pinned projects changed. Refresh and try again.");
    }

    const orderById = new Map(projectIds.map((projectId, index) => [projectId, index]));
    for (const project of pinnedProjects) {
      project.pinOrder = orderById.get(project.id);
    }
  });

  return makeProjectPinStates(state);
}

async function getProjectDetails(projectId) {
  const id = assertProjectId(projectId);
  const state = await stateStore.read();
  const project = state.projects.find((candidate) => candidate.id === id);
  if (!project) {
    throw new PublicError("Project not found.");
  }

  const sessions = await loadSessions({ tolerateFailure: true });
  const projectSessions = sessions
    .filter((session) => sessionBelongsToProject(session, project.path))
    .map(toSessionRecord)
    .filter((session) => session.id);
  const missing = !(await directoryExists(project.path));
  const worktrees = missing ? [] : await worktreesForProject(project.path);

  return {
    project: await makeProjectSummary(project, sessions, worktrees),
    sessions: projectSessions,
    worktrees,
    scannedAt: new Date().toISOString()
  };
}

async function allowedDirectoryPaths(state) {
  const allowed = new Set();

  for (const project of state.projects) {
    try {
      allowed.add(await existingDirectoryRealPath(project.path));
    } catch {
      continue;
    }

    for (const worktree of await worktreesForProject(project.path)) {
      try {
        allowed.add(await existingDirectoryRealPath(worktree.path));
      } catch {
        // Ignore prunable or concurrently deleted worktrees.
      }
    }
  }

  return allowed;
}

async function openDirectory(directoryPath, editorId = null) {
  let requestedPath;
  try {
    requestedPath = await existingDirectoryRealPath(directoryPath);
  } catch {
    throw new PublicError("The directory is unavailable.");
  }

  const state = await stateStore.read();
  const requestedEditorId = assertOptionalEditorId(editorId);
  const allowedPaths = await allowedDirectoryPaths(state);
  if (!allowedPaths.has(requestedPath)) {
    throw new PublicError("This directory is not registered with tonic.");
  }

  try {
    await openDirectoryWithEditor(state.settings, requestedPath, requestedEditorId);
  } catch (error) {
    console.warn("Unable to open editor:", error?.message ?? error);
    throw new PublicError("Could not open the selected editor.");
  }
}

async function copyResumeCommand(value) {
  const session = assertResumeSession(value);
  const [sessions, state] = await Promise.all([
    loadSessions({ tolerateFailure: false }),
    stateStore.read()
  ]);
  const exists = sessions.some(
    (candidate) => candidate?.agent === session.agent && candidate?.id === session.id
  );
  if (!exists) {
    throw new PublicError("Session not found.");
  }

  const command = buildResumeCommand(session, state.settings.yoloMode);
  clipboard.writeText(command);
  return command;
}

function settingsWithSystemState(settings) {
  if (process.platform !== "darwin" || !app.isPackaged) {
    return { ...settings };
  }

  try {
    return {
      ...settings,
      launchAtLogin: app.getLoginItemSettings().openAtLogin
    };
  } catch {
    return { ...settings };
  }
}

async function saveSettings(value) {
  const settings = assertSettings(value);
  let customEditorPath = null;
  if (settings.customEditorPath) {
    customEditorPath = await resolveApplicationBundle(settings.customEditorPath);
    if (!customEditorPath) {
      throw new PublicError("The selected custom editor is unavailable.");
    }
  }
  if (settings.editorId === "custom" && !customEditorPath) {
    throw new PublicError("Choose a custom editor before selecting it.");
  }

  let nextSettings = { ...settings, customEditorPath };

  if (process.platform === "darwin" && app.isPackaged) {
    try {
      app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin });
      nextSettings = settingsWithSystemState(nextSettings);
    } catch (error) {
      console.warn("Unable to update login item:", error?.message ?? error);
      throw new PublicError("Could not update the login item setting.");
    }
  }

  await stateStore.update((state) => {
    state.settings = nextSettings;
  });
  configureApplicationMenu(nextSettings.language);
  return nextSettings;
}

async function chooseCustomEditor() {
  const state = await stateStore.read();
  const isChinese = state.settings.language === "zh";
  const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: isChinese ? "选择自定义编辑器" : "Choose Custom Editor",
    buttonLabel: isChinese ? "选择" : "Choose",
    defaultPath: "/Applications",
    properties: ["openFile"],
    filters: [{ name: isChinese ? "macOS 应用" : "macOS applications", extensions: ["app"] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const appPath = await resolveApplicationBundle(result.filePaths[0]);
  if (!appPath) {
    throw new PublicError("Please choose a valid macOS application.");
  }

  const [editor] = await editorOptionsWithIcons([customEditorOption(appPath)]);
  return editor;
}

async function settingsWithAvailableCustomEditor(settings) {
  if (!settings.customEditorPath) {
    return settings.editorId === "custom"
      ? { ...settings, editorId: "auto", customEditorPath: null }
      : settings;
  }

  const appPath = await resolveApplicationBundle(settings.customEditorPath);
  if (appPath) {
    return { ...settings, customEditorPath: appPath };
  }

  return {
    ...settings,
    editorId: settings.editorId === "custom" ? "auto" : settings.editorId,
    customEditorPath: null
  };
}

async function editorOptionsWithIcons(editors) {
  return Promise.all(
    editors.map(async (editor) => {
      if (!editor.appPath) {
        return { ...editor, iconDataUrl: null };
      }

      try {
        const icon = process.platform === "darwin"
          ? await nativeImage.createThumbnailFromPath(editor.appPath, {
              width: 64,
              height: 64
            })
          : await app.getFileIcon(editor.appPath, { size: "normal" });
        return {
          ...editor,
          iconDataUrl: icon.isEmpty() ? null : icon.toDataURL()
        };
      } catch {
        return { ...editor, iconDataUrl: null };
      }
    })
  );
}

async function getBootstrap() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const state = await stateStore.read();
      let availableSettings = await settingsWithAvailableCustomEditor(state.settings);
      if (
        availableSettings.editorId !== state.settings.editorId ||
        availableSettings.customEditorPath !== state.settings.customEditorPath
      ) {
        await stateStore.update((current) => {
          current.settings = availableSettings;
        });
        state.settings = availableSettings;
      }
      const [sessions, detectedEditors] = await Promise.all([
        loadSessions({ tolerateFailure: true }),
        detectEditors(state.settings.customEditorPath)
      ]);
      const editors = await editorOptionsWithIcons(detectedEditors);

      if (!editors.some((editor) => editor.id === availableSettings.editorId)) {
        availableSettings = { ...availableSettings, editorId: "auto" };
        await stateStore.update((current) => {
          current.settings = availableSettings;
        });
        state.settings = availableSettings;
      }

      return {
        projects: await makeProjectSummaries(state, sessions),
        settings: settingsWithSystemState(state.settings),
        editors
      };
    })();
  }

  const currentBootstrap = bootstrapPromise;
  try {
    return await currentBootstrap;
  } finally {
    if (bootstrapPromise === currentBootstrap) {
      bootstrapPromise = null;
    }
  }
}

function assertTrustedSender(event) {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    event.sender.id !== mainWindow.webContents.id
  ) {
    throw new PublicError("Untrusted IPC sender.");
  }
}

function registerHandler(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedSender(event);
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof PublicError) {
        throw new Error(error.message);
      }
      console.error(`IPC ${channel} failed:`, error);
      throw new Error("The operation could not be completed.");
    }
  });
}

function registerIpcHandlers() {
  registerHandler(channels.getBootstrap, getBootstrap);
  registerHandler(channels.chooseProject, chooseProject);
  registerHandler(channels.scanProjects, scanProjects);
  registerHandler(channels.removeProject, removeProject);
  registerHandler(channels.setProjectPinned, setProjectPinned);
  registerHandler(channels.reorderPinnedProjects, reorderPinnedProjects);
  registerHandler(channels.getProjectDetails, getProjectDetails);
  registerHandler(channels.openDirectory, openDirectory);
  registerHandler(channels.copyResumeCommand, copyResumeCommand);
  registerHandler(channels.chooseCustomEditor, chooseCustomEditor);
  registerHandler(channels.saveSettings, saveSettings);
}

function safeDevelopmentUrl() {
  const url = new URL(process.env.VITE_DEV_SERVER_URL);
  if (
    url.protocol !== "http:" ||
    (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")
  ) {
    throw new Error("VITE_DEV_SERVER_URL must point at the local development server.");
  }
  return url.toString();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 880,
    minHeight: 600,
    show: false,
    title: "tonic",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 17 },
    backgroundColor: "#f7f5ef",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: isDev
    }
  });

  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.webContents.on("will-attach-webview", (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  if (isDev) {
    void mainWindow.loadURL(safeDevelopmentUrl());
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function sendMenuEvent(channel, payload) {
  showMainWindow();
  const deliver = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  };

  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once("did-finish-load", deliver);
  } else {
    deliver();
  }
}

function configureApplicationMenu(language = "en") {
  const isMac = process.platform === "darwin";
  const labels =
    language === "zh"
      ? {
          preferences: "设置…",
          file: "文件",
          openProject: "打开项目…",
          edit: "编辑",
          view: "视图",
          sessions: "会话",
          worktrees: "工作树",
          toggleProjectPanel: "显示或隐藏项目面板",
          window: "窗口"
        }
      : {
          preferences: "Settings…",
          file: "File",
          openProject: "Open Project…",
          edit: "Edit",
          view: "View",
          sessions: "Sessions",
          worktrees: "Worktrees",
          toggleProjectPanel: "Toggle Project Panel",
          window: "Window"
        };
  const settingsItem = {
    label: labels.preferences,
    accelerator: "CommandOrControl+,",
    click: () => sendMenuEvent(channels.menuOpenSettings)
  };
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              settingsItem,
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" }
            ]
          }
        ]
      : []),
    {
      label: labels.file,
      submenu: [
        {
          label: labels.openProject,
          accelerator: "CommandOrControl+O",
          click: () => sendMenuEvent(channels.menuChooseProject)
        },
        ...(!isMac ? [{ type: "separator" }, settingsItem, { role: "quit" }] : [])
      ]
    },
    {
      label: labels.edit,
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: labels.view,
      submenu: [
        {
          label: labels.sessions,
          accelerator: "CommandOrControl+1",
          click: () => sendMenuEvent(channels.menuSelectTab, "sessions")
        },
        {
          label: labels.worktrees,
          accelerator: "CommandOrControl+2",
          click: () => sendMenuEvent(channels.menuSelectTab, "worktrees")
        },
        {
          label: labels.toggleProjectPanel,
          accelerator: "CommandOrControl+\\",
          click: () => sendMenuEvent(channels.menuToggleProjectPanel)
        },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: labels.window,
      submenu: [{ role: "minimize" }, { role: "zoom" }, ...(isMac ? [{ role: "front" }] : [])]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  if (isDev && process.platform === "darwin") {
    app.dock.setIcon(path.join(__dirname, "..", "assets", "icon.png"));
  }
  registerIpcHandlers();
  const state = await stateStore.read();
  configureApplicationMenu(state.settings.language);
  createWindow();

  app.on("activate", () => {
    showMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
