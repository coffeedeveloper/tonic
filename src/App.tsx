import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "./api";
import { DetailToolbar } from "./components/DetailToolbar";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { SessionList } from "./components/SessionList";
import { SettingsModal } from "./components/SettingsModal";
import { SidebarResizer } from "./components/SidebarResizer";
import { Titlebar } from "./components/Titlebar";
import { WorktreeList } from "./components/WorktreeList";
import { EmptyState, ErrorState, LoadingState, Toast } from "./components/ui/Feedback";
import type { ToastMessage } from "./components/ui/Feedback";
import { TooltipOverlay } from "./components/ui/Tooltip";
import { useTooltip } from "./hooks/useTooltip";
import { useAppTheme } from "./hooks/useAppTheme";
import { useProjectPanel } from "./hooks/useProjectPanel";
import { useI18n } from "./i18n";
import { DEFAULT_SESSION_SORT } from "./types";
import type {
  AgentFilter,
  DetailTab,
  EditorOption,
  ProjectDetails,
  ProjectPinState,
  ProjectSummary,
  SessionRecord,
  SessionSort,
  Settings,
  WorktreeRecord
} from "./types";
import { errorMessage } from "./utils/format";

type LoadStatus = "loading" | "ready" | "error";

const initialSettings: Settings = {
  editorId: "auto",
  customEditorPath: null,
  launchAtLogin: false,
  language: "en",
  theme: "system"
};

function mergeProject(projects: ProjectSummary[], project: ProjectSummary) {
  const existingIndex = projects.findIndex((item) => item.id === project.id);
  if (existingIndex < 0) {
    return [...projects, project];
  }

  return projects.map((item) =>
    item.id === project.id ? { ...project, pinned: item.pinned } : item
  );
}

function setProjectPinnedOptimistically(
  projects: ProjectSummary[],
  projectId: string,
  pinned: boolean
) {
  const nextProjects = projects.map((project) =>
    project.id === projectId ? { ...project, pinned } : project
  );
  return [
    ...nextProjects.filter((project) => project.pinned),
    ...nextProjects.filter((project) => !project.pinned)
  ];
}

function applyProjectPinStates(projects: ProjectSummary[], pinStates: ProjectPinState[]) {
  const stateById = new Map(pinStates.map((state) => [state.id, state]));
  const orderById = new Map(pinStates.map((state, index) => [state.id, index]));

  return projects
    .map((project, index) => ({
      project: stateById.has(project.id)
        ? { ...project, pinned: stateById.get(project.id)?.pinned ?? project.pinned }
        : project,
      index
    }))
    .sort((left, right) => {
      const leftOrder = orderById.get(left.project.id);
      const rightOrder = orderById.get(right.project.id);
      if (leftOrder !== undefined && rightOrder !== undefined) {
        return leftOrder - rightOrder;
      }
      if (leftOrder !== undefined) {
        return -1;
      }
      if (rightOrder !== undefined) {
        return 1;
      }
      return left.index - right.index;
    })
    .map(({ project }) => project);
}

function reorderPinnedProjects(projects: ProjectSummary[], projectIds: string[]) {
  const orderById = new Map(projectIds.map((projectId, index) => [projectId, index]));
  return projects
    .map((project, index) => ({ project, index }))
    .sort((left, right) => {
      if (left.project.pinned !== right.project.pinned) {
        return Number(right.project.pinned) - Number(left.project.pinned);
      }
      if (left.project.pinned) {
        return (
          (orderById.get(left.project.id) ?? Number.MAX_SAFE_INTEGER) -
            (orderById.get(right.project.id) ?? Number.MAX_SAFE_INTEGER) ||
          left.index - right.index
        );
      }
      return left.index - right.index;
    })
    .map(({ project }) => project);
}

export function App() {
  const { setLanguage, t } = useI18n();
  const projectPanel = useProjectPanel();
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [loadError, setLoadError] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [editors, setEditors] = useState<EditorOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [details, setDetails] = useState<ProjectDetails | null>(null);
  const [detailStatus, setDetailStatus] = useState<LoadStatus>("ready");
  const [detailError, setDetailError] = useState("");
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<DetailTab>("sessions");
  const [agentFilter, setAgentFilter] = useState<AgentFilter>("all");
  const [sessionSort, setSessionSort] = useState<SessionSort>(DEFAULT_SESSION_SORT);
  const [scanning, setScanning] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [removingProjectId, setRemovingProjectId] = useState<string | null>(null);
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [copyingSessionId, setCopyingSessionId] = useState<string | null>(null);
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastIdRef = useRef(0);
  const copyResetTimerRef = useRef<number | null>(null);
  const projectPinMutationRef = useRef(0);
  const { tooltip, getTooltipProps, hideTooltip } = useTooltip();

  useAppTheme(settings.theme);

  useEffect(() => {
    setLanguage(settings.language);
    document.documentElement.lang = settings.language === "zh" ? "zh-CN" : "en";
  }, [setLanguage, settings.language]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );
  const showToast = useCallback((tone: ToastMessage["tone"], message: string) => {
    toastIdRef.current += 1;
    setToast({ id: toastIdRef.current, tone, message });
  }, []);

  const loadBootstrap = useCallback(async () => {
    setLoadStatus("loading");
    setLoadError("");

    try {
      const data = await api.getBootstrap();
      setProjects(data.projects);
      setSettings(data.settings);
      setEditors(data.editors);
      setSelectedProjectId((current) =>
        current && data.projects.some((project) => project.id === current)
          ? current
          : data.projects[0]?.id ?? null
      );
      setLoadStatus("ready");
    } catch (error) {
      setLoadError(errorMessage(error));
      setLoadStatus("error");
    }
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    if (!selectedProjectId) {
      setDetails(null);
      setDetailError("");
      setDetailStatus("ready");
      return undefined;
    }

    let cancelled = false;
    setDetails(null);
    setDetailError("");
    setDetailStatus("loading");

    void api
      .getProjectDetails(selectedProjectId)
      .then((nextDetails) => {
        if (cancelled) {
          return;
        }
        setDetails(nextDetails);
        setProjects((current) => mergeProject(current, nextDetails.project));
        setDetailStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setDetailError(errorMessage(error));
        setDetailStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [detailRefreshKey, selectedProjectId]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = window.setTimeout(() => setToast(null), toast.tone === "error" ? 4200 : 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(
    () => () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    },
    []
  );

  const handleChooseProject = useCallback(async () => {
    if (loadStatus !== "ready" || choosing) {
      return;
    }

    setChoosing(true);
    try {
      const project = await api.chooseProject();
      if (!project) {
        return;
      }

      setProjects((current) => mergeProject(current, project));
      setSelectedProjectId(project.id);
      setDetailRefreshKey((current) => current + 1);
      showToast("success", t("app.projectReady", { name: project.name }));
    } catch (error) {
      showToast("error", errorMessage(error));
    } finally {
      setChoosing(false);
    }
  }, [choosing, loadStatus, showToast, t]);

  const handleScan = useCallback(async () => {
    if (loadStatus !== "ready" || scanning) {
      return;
    }

    setScanning(true);
    try {
      const result = await api.scanProjects();
      setProjects(result.projects);
      setSelectedProjectId((current) =>
        current && result.projects.some((project) => project.id === current)
          ? current
          : result.projects[0]?.id ?? null
      );
      setDetailRefreshKey((current) => current + 1);

      if (result.addedCount === 0) {
        showToast("info", t("app.scanComplete", { count: result.discoveredSessionCount }));
      } else {
        showToast(
          "success",
          t(result.addedCount === 1 ? "app.scanAddedOne" : "app.scanAddedMany", {
            added: result.addedCount,
            count: result.discoveredSessionCount
          })
        );
      }
    } catch (error) {
      showToast("error", errorMessage(error));
    } finally {
      setScanning(false);
    }
  }, [loadStatus, scanning, showToast, t]);

  const handleSelectProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
  }, []);

  const handleRemoveProject = useCallback(
    async (projectId: string) => {
      const removedProject = projects.find((project) => project.id === projectId);
      const removedIndex = projects.findIndex((project) => project.id === projectId);
      setRemovingProjectId(projectId);

      try {
        const nextProjects = await api.removeProject(projectId);
        setProjects(nextProjects);
        setSelectedProjectId((current) => {
          if (current !== projectId) {
            return current && nextProjects.some((project) => project.id === current)
              ? current
              : nextProjects[0]?.id ?? null;
          }

          return (
            nextProjects[Math.min(Math.max(removedIndex, 0), nextProjects.length - 1)]?.id ??
            nextProjects.at(-1)?.id ??
            null
          );
        });
        showToast(
          "success",
          t("app.projectRemoved", { name: removedProject?.name ?? t("sidebar.projects") })
        );
      } catch (error) {
        showToast("error", errorMessage(error));
      } finally {
        setRemovingProjectId(null);
      }
    },
    [projects, showToast, t]
  );

  const handleSetProjectPinned = useCallback(
    async (projectId: string, pinned: boolean) => {
      const mutationId = projectPinMutationRef.current + 1;
      projectPinMutationRef.current = mutationId;
      setProjects((current) => setProjectPinnedOptimistically(current, projectId, pinned));

      try {
        const pinStates = await api.setProjectPinned(projectId, pinned);
        if (projectPinMutationRef.current === mutationId) {
          setProjects((current) => applyProjectPinStates(current, pinStates));
        }
      } catch (error) {
        if (projectPinMutationRef.current === mutationId) {
          setProjects((current) =>
            setProjectPinnedOptimistically(current, projectId, !pinned)
          );
          showToast("error", errorMessage(error));
        }
      }
    },
    [showToast]
  );

  const handleReorderPinnedProjects = useCallback(
    async (projectIds: string[]) => {
      const previousProjectIds = projects
        .filter((project) => project.pinned)
        .map((project) => project.id);
      const mutationId = projectPinMutationRef.current + 1;
      projectPinMutationRef.current = mutationId;
      setProjects((current) => reorderPinnedProjects(current, projectIds));

      try {
        const pinStates = await api.reorderPinnedProjects(projectIds);
        if (projectPinMutationRef.current === mutationId) {
          setProjects((current) => applyProjectPinStates(current, pinStates));
        }
      } catch (error) {
        if (projectPinMutationRef.current === mutationId) {
          setProjects((current) => reorderPinnedProjects(current, previousProjectIds));
          showToast("error", errorMessage(error));
        }
      }
    },
    [projects, showToast]
  );

  const handleOpenDirectory = useCallback(
    async (directoryPath: string, editorId: string | null = null) => {
      if (openingPath) {
        return;
      }

      hideTooltip();
      setOpeningPath(directoryPath);
      try {
        await api.openDirectory(directoryPath, editorId);
      } catch (error) {
        showToast("error", errorMessage(error));
      } finally {
        setOpeningPath(null);
      }
    },
    [hideTooltip, openingPath, showToast]
  );

  const handleResume = useCallback(
    async (session: SessionRecord) => {
      setCopyingSessionId(session.id);
      try {
        const command = await api.copyResumeCommand(session);
        setCopiedSessionId(session.id);
        showToast("success", t("app.copied", { command }));

        if (copyResetTimerRef.current !== null) {
          window.clearTimeout(copyResetTimerRef.current);
        }
        copyResetTimerRef.current = window.setTimeout(() => {
          setCopiedSessionId(null);
          copyResetTimerRef.current = null;
        }, 1600);
      } catch (error) {
        showToast("error", errorMessage(error));
      } finally {
        setCopyingSessionId(null);
      }
    },
    [showToast, t]
  );

  const openSettings = useCallback(() => {
    if (loadStatus !== "ready") {
      return;
    }
    hideTooltip();
    setSettingsOpen(true);
  }, [hideTooltip, loadStatus]);
  const toggleProjectPanel = useCallback(() => {
    hideTooltip();
    projectPanel.toggleCollapsed();
  }, [hideTooltip, projectPanel.toggleCollapsed]);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const handleSaveSettings = useCallback(
    async (nextSettings: Settings) => {
      const savedSettings = await api.saveSettings(nextSettings);
      setSettings(savedSettings);
      setEditors((current) => {
        const withoutCustom = current.filter((editor) => editor.id !== "custom");
        if (!savedSettings.customEditorPath) {
          return withoutCustom;
        }

        const existingCustom = current.find(
          (editor) =>
            editor.id === "custom" && editor.appPath === savedSettings.customEditorPath
        );
        if (existingCustom) {
          return [...withoutCustom, existingCustom];
        }

        const appName = savedSettings.customEditorPath
          .split("/")
          .filter(Boolean)
          .at(-1)
          ?.replace(/\.app$/i, "");
        return [
          ...withoutCustom,
          {
            id: "custom",
            name: appName || "Custom editor",
            appPath: savedSettings.customEditorPath,
            iconDataUrl: null,
            available: true
          }
        ];
      });
      showToast("success", savedSettings.language === "zh" ? "设置已保存。" : "Settings saved.");
    },
    [showToast]
  );

  const handleChooseCustomEditor = useCallback(async () => {
    return api.chooseCustomEditor();
  }, []);

  const handleSelectTab = useCallback((tab: DetailTab) => {
    setActiveTab(tab);
  }, []);

  useEffect(() => {
    const disposeChooseProject = api.onChooseProject(() => {
      void handleChooseProject();
    });
    const disposeOpenSettings = api.onOpenSettings(openSettings);
    const disposeSelectTab = api.onSelectTab(handleSelectTab);
    const disposeToggleProjectPanel = api.onToggleProjectPanel(toggleProjectPanel);

    return () => {
      disposeChooseProject();
      disposeOpenSettings();
      disposeSelectTab();
      disposeToggleProjectPanel();
    };
  }, [handleChooseProject, handleSelectTab, openSettings, toggleProjectPanel]);

  function renderDetailContent() {
    if (loadStatus === "loading") {
      return <LoadingState label={t("app.loadingProjects")} />;
    }

    if (loadStatus === "error") {
      return <ErrorState message={loadError} onRetry={() => void loadBootstrap()} />;
    }

    if (!selectedProject) {
      return (
        <EmptyState
          title={t("app.firstProjectTitle")}
          description={t("app.firstProjectDescription")}
          action={
            <button className="primary-button" type="button" onClick={() => void handleChooseProject()}>
              <Plus size={15} aria-hidden="true" />
              {t("app.addProject")}
            </button>
          }
        />
      );
    }

    if (detailStatus === "loading") {
      return <LoadingState label={t("app.loadingProject", { name: selectedProject.name })} />;
    }

    if (detailStatus === "error") {
      return (
        <ErrorState
          title={t("app.loadProjectFailed", { name: selectedProject.name })}
          message={detailError}
          onRetry={() => setDetailRefreshKey((current) => current + 1)}
        />
      );
    }

    if (!details) {
      return <LoadingState label={t("app.loadingDetails")} />;
    }

    return activeTab === "sessions" ? (
      <SessionList
        sessions={details.sessions}
        projectPath={details.project.path}
        agentFilter={agentFilter}
        sort={sessionSort}
        copiedSessionId={copiedSessionId}
        copyingSessionId={copyingSessionId}
        tooltipProps={getTooltipProps}
        onFilterChange={setAgentFilter}
        onSortChange={setSessionSort}
        onResume={(session) => void handleResume(session)}
      />
    ) : (
      <WorktreeList
        worktrees={details.worktrees}
        openingPath={openingPath}
        tooltipProps={getTooltipProps}
        onOpen={(worktree: WorktreeRecord) => void handleOpenDirectory(worktree.path)}
      />
    );
  }

  return (
    <div className="app-shell">
      <Titlebar
        sidebarCollapsed={projectPanel.collapsed}
        tooltipProps={getTooltipProps}
        onToggleSidebar={toggleProjectPanel}
      />

      <div
        className={`workspace ${projectPanel.collapsed ? "sidebar-collapsed" : ""}`}
        style={{
          gridTemplateColumns: projectPanel.collapsed
            ? "minmax(0, 1fr)"
            : `${projectPanel.width}px 1px minmax(0, 1fr)`
        }}
      >
        {!projectPanel.collapsed ? (
          <>
            <ProjectSidebar
              projects={projects}
              selectedProjectId={selectedProjectId}
              initializing={loadStatus !== "ready"}
              scanning={scanning}
              choosing={choosing}
              removingProjectId={removingProjectId}
              tooltipProps={getTooltipProps}
              onChooseProject={() => void handleChooseProject()}
              onScan={() => void handleScan()}
              onSelectProject={handleSelectProject}
              onSetProjectPinned={(projectId, pinned) => {
                void handleSetProjectPinned(projectId, pinned);
              }}
              onReorderPinnedProjects={(projectIds) => {
                void handleReorderPinnedProjects(projectIds);
              }}
              onRemoveProject={handleRemoveProject}
              onOpenSettings={openSettings}
            />
            <SidebarResizer
              width={projectPanel.width}
              minWidth={projectPanel.minWidth}
              maxWidth={projectPanel.maxWidth}
              resizing={projectPanel.resizing}
              onPointerDown={projectPanel.handleResizePointerDown}
              onKeyDown={projectPanel.handleResizeKeyDown}
              onReset={projectPanel.resetWidth}
            />
          </>
        ) : null}

        <main className="detail-pane">
          <DetailToolbar
            project={selectedProject}
            activeTab={activeTab}
            editors={editors}
            settings={settings}
            opening={Boolean(selectedProject && openingPath === selectedProject.path)}
            tooltipProps={getTooltipProps}
            onSelectTab={handleSelectTab}
            onOpenProject={() => {
              if (selectedProject) {
                void handleOpenDirectory(selectedProject.path);
              }
            }}
            onOpenProjectWithEditor={(editorId) => {
              if (selectedProject) {
                void handleOpenDirectory(selectedProject.path, editorId);
              }
            }}
          />
          <div className="detail-scroll" role="tabpanel">
            {renderDetailContent()}
          </div>
        </main>
      </div>

      {settingsOpen ? (
        <SettingsModal
          settings={settings}
          editors={editors}
          onClose={closeSettings}
          onSave={handleSaveSettings}
          onChooseCustomEditor={handleChooseCustomEditor}
        />
      ) : null}

      <TooltipOverlay tooltip={tooltip} />
      <Toast toast={toast} />
    </div>
  );
}
