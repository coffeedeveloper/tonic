export type AgentType = "codex" | "claude";
export type DetailTab = "sessions" | "worktrees";
export type AgentFilter = "all" | AgentType;
export type SessionSortKey = "createdAt" | "updatedAt" | "tokenUsage";
export type SessionSortDirection = "asc" | "desc";
export type AppLanguage = "en" | "zh";
export type AppTheme = "system" | "light" | "dark";

export interface SessionSort {
  key: SessionSortKey;
  direction: SessionSortDirection;
}

export const DEFAULT_SESSION_SORT: SessionSort = {
  key: "updatedAt",
  direction: "desc"
};

export interface ProjectSummary {
  id: string;
  name: string;
  path: string;
  codexSessionCount: number;
  claudeSessionCount: number;
  worktreeCount: number;
  missing: boolean;
  pinned: boolean;
}

export interface ProjectPinState {
  id: string;
  pinned: boolean;
}

export interface SessionTokenBreakdown {
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  reasoning: number | null;
}

export interface SessionRecord {
  id: string;
  agent: AgentType;
  title: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  branch: string;
  tokenUsage: number | null;
  estimatedCostUsd: number | null;
  summary: string;
  firstPrompt: string;
  workingDirectory: string;
  worktreePath: string;
  turnCount: number | null;
  toolCallCount: number | null;
  tokenBreakdown: SessionTokenBreakdown | null;
  source: string;
  permissionMode: string;
  sandboxMode: string;
  cliVersion: string;
}

export interface CommitInfo {
  hash: string;
  title: string;
  body: string;
  authoredAt: string;
}

export type WorktreeFileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "conflicted";

export interface WorktreeFileChange {
  path: string;
  previousPath: string | null;
  status: WorktreeFileStatus;
  additions: number | null;
  deletions: number | null;
  binary: boolean;
}

export interface WorktreeRecord {
  path: string;
  name: string;
  branch: string;
  changeCount: number;
  changes: WorktreeFileChange[];
  isMain: boolean;
  lastCommit: CommitInfo | null;
}

export interface ProjectDetails {
  project: ProjectSummary;
  sessions: SessionRecord[];
  worktrees: WorktreeRecord[];
  scannedAt: string;
}

export interface EditorOption {
  id: string;
  name: string;
  appPath: string | null;
  iconDataUrl: string | null;
  available: boolean;
}

export interface Settings {
  editorId: string;
  customEditorPath: string | null;
  launchAtLogin: boolean;
  yoloMode: boolean;
  language: AppLanguage;
  theme: AppTheme;
}

export interface BootstrapData {
  projects: ProjectSummary[];
  settings: Settings;
  editors: EditorOption[];
}

export interface ScanResult {
  projects: ProjectSummary[];
  addedCount: number;
  discoveredSessionCount: number;
}

export interface TonicApi {
  getBootstrap: () => Promise<BootstrapData>;
  chooseProject: () => Promise<ProjectSummary | null>;
  scanProjects: () => Promise<ScanResult>;
  removeProject: (projectId: string) => Promise<ProjectSummary[]>;
  setProjectPinned: (projectId: string, pinned: boolean) => Promise<ProjectPinState[]>;
  reorderPinnedProjects: (projectIds: string[]) => Promise<ProjectPinState[]>;
  getProjectDetails: (projectId: string) => Promise<ProjectDetails>;
  openDirectory: (directoryPath: string, editorId?: string | null) => Promise<void>;
  copyResumeCommand: (session: Pick<SessionRecord, "agent" | "id">) => Promise<string>;
  chooseCustomEditor: () => Promise<EditorOption | null>;
  saveSettings: (settings: Settings) => Promise<Settings>;
  onBootstrapUpdated: (callback: (data: BootstrapData) => void) => () => void;
  onChooseProject: (callback: () => void) => () => void;
  onOpenSettings: (callback: () => void) => () => void;
  onSelectTab: (callback: (tab: DetailTab) => void) => () => void;
  onToggleProjectPanel: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    tonic?: TonicApi;
  }
}
