const { contextBridge, ipcRenderer } = require("electron");

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

function subscribe(channel, callback, mapPayload = (value) => value) {
  if (typeof callback !== "function") {
    throw new TypeError("Event callback must be a function.");
  }

  const listener = (_event, payload) => callback(mapPayload(payload));
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const tonicApi = Object.freeze({
  getBootstrap: () => ipcRenderer.invoke(channels.getBootstrap),
  chooseProject: () => ipcRenderer.invoke(channels.chooseProject),
  scanProjects: () => ipcRenderer.invoke(channels.scanProjects),
  removeProject: (projectId) => ipcRenderer.invoke(channels.removeProject, projectId),
  setProjectPinned: (projectId, pinned) =>
    ipcRenderer.invoke(channels.setProjectPinned, projectId, pinned),
  reorderPinnedProjects: (projectIds) =>
    ipcRenderer.invoke(channels.reorderPinnedProjects, projectIds),
  getProjectDetails: (projectId) =>
    ipcRenderer.invoke(channels.getProjectDetails, projectId),
  openDirectory: (directoryPath, editorId = null) =>
    ipcRenderer.invoke(channels.openDirectory, directoryPath, editorId),
  copyResumeCommand: (session) =>
    ipcRenderer.invoke(channels.copyResumeCommand, {
      agent: session?.agent,
      id: session?.id
    }),
  chooseCustomEditor: () => ipcRenderer.invoke(channels.chooseCustomEditor),
  saveSettings: (settings) =>
    ipcRenderer.invoke(channels.saveSettings, {
      editorId: settings?.editorId,
      customEditorPath: settings?.customEditorPath,
      launchAtLogin: settings?.launchAtLogin,
      language: settings?.language,
      theme: settings?.theme
    }),
  onChooseProject: (callback) => subscribe(channels.menuChooseProject, callback, () => undefined),
  onOpenSettings: (callback) => subscribe(channels.menuOpenSettings, callback, () => undefined),
  onSelectTab: (callback) =>
    subscribe(channels.menuSelectTab, callback, (tab) =>
      tab === "worktrees" ? "worktrees" : "sessions"
    ),
  onToggleProjectPanel: (callback) =>
    subscribe(channels.menuToggleProjectPanel, callback, () => undefined)
});

contextBridge.exposeInMainWorld("tonic", tonicApi);
