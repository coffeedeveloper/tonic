import type {
  BootstrapData,
  ProjectDetails,
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
  async setProjectPinned(): Promise<ProjectSummary[]> {
    return fallbackBootstrap.projects;
  },
  async reorderPinnedProjects(): Promise<ProjectSummary[]> {
    return fallbackBootstrap.projects;
  },
  async getProjectDetails(): Promise<ProjectDetails> {
    throw new Error("Project details are only available in the tonic desktop app.");
  },
  async openDirectory() {},
  async copyResumeCommand(session) {
    return session.agent === "claude"
      ? `claude --resume ${session.id}`
      : `codex resume ${session.id}`;
  },
  async chooseCustomEditor() {
    return null;
  },
  async saveSettings(settings: Settings) {
    return settings;
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
