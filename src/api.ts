import type {
  BootstrapData,
  ProjectDetails,
  ProjectPinState,
  ProjectSummary,
  ScanResult,
  Settings,
  TonicApi
} from "./types";

const fallbackBootstrap: BootstrapData = {
  projects: [],
  settings: {
    editorId: "auto",
    customEditorPath: null,
    launchAtLogin: false,
    yoloMode: false,
    language: "en",
    theme: "system"
  },
  editors: [
    {
      id: "auto",
      name: "Auto-detect",
      appPath: null,
      iconDataUrl: null,
      available: true
    },
    {
      id: "system",
      name: "Finder / system default",
      appPath: null,
      iconDataUrl: null,
      available: true
    }
  ]
};

const browserFallback: TonicApi = {
  async getBootstrap() {
    return fallbackBootstrap;
  },
  async chooseProject() {
    return null;
  },
  async scanProjects(): Promise<ScanResult> {
    return {
      projects: fallbackBootstrap.projects,
      addedCount: 0,
      discoveredSessionCount: 0
    };
  },
  async removeProject(): Promise<ProjectSummary[]> {
    return fallbackBootstrap.projects;
  },
  async setProjectPinned(): Promise<ProjectPinState[]> {
    return [];
  },
  async reorderPinnedProjects(): Promise<ProjectPinState[]> {
    return [];
  },
  async getProjectDetails(): Promise<ProjectDetails> {
    throw new Error("Project details are only available in the tonic desktop app.");
  },
  async openDirectory() {},
  async copyResumeCommand(session) {
    const command = session.agent === "claude"
      ? `claude --resume ${session.id}`
      : `codex resume ${session.id}`;
    if (!fallbackBootstrap.settings.yoloMode) {
      return command;
    }
    return session.agent === "claude"
      ? `${command} --allow-dangerously-skip-permissions --permission-mode auto`
      : `${command} --dangerously-bypass-approvals-and-sandbox`;
  },
  async chooseCustomEditor() {
    return null;
  },
  async saveSettings(settings: Settings) {
    const savedSettings = { ...settings };
    fallbackBootstrap.settings = savedSettings;
    return savedSettings;
  },
  onChooseProject() {
    return () => undefined;
  },
  onOpenSettings() {
    return () => undefined;
  },
  onSelectTab() {
    return () => undefined;
  },
  onToggleProjectPanel() {
    return () => undefined;
  }
};

export const api: TonicApi = window.tonic ?? browserFallback;
