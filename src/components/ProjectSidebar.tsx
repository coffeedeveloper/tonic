import {
  AlertTriangle,
  Bot,
  GitFork,
  GripVertical,
  LoaderCircle,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  SquareTerminal,
  Trash2
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useI18n } from "../i18n";
import type { ProjectSummary } from "../types";
import type { TooltipPropsFactory } from "./ui/Tooltip";

export type ProjectSidebarProps = {
  projects: ProjectSummary[];
  selectedProjectId: string | null;
  initializing: boolean;
  scanning: boolean;
  choosing: boolean;
  removingProjectId: string | null;
  tooltipProps: TooltipPropsFactory;
  onChooseProject: () => void;
  onScan: () => void;
  onSelectProject: (projectId: string) => void;
  onSetProjectPinned?: (projectId: string, pinned: boolean) => void;
  onReorderPinnedProjects?: (projectIds: string[]) => void;
  onRemoveProject: (projectId: string) => Promise<void>;
  onOpenSettings: () => void;
};

export function ProjectSidebar({
  projects,
  selectedProjectId,
  initializing,
  scanning,
  choosing,
  removingProjectId,
  tooltipProps,
  onChooseProject,
  onScan,
  onSelectProject,
  onSetProjectPinned,
  onReorderPinnedProjects,
  onRemoveProject,
  onOpenSettings
}: ProjectSidebarProps) {
  const { t } = useI18n();
  const [confirmProjectId, setConfirmProjectId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<{
    projectId: string;
    edge: "before" | "after";
  } | null>(null);
  const dragTargetRef = useRef<typeof dragTarget>(null);
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");
  const dragInstructionsId = useId();

  const updateDragTarget = (target: typeof dragTarget) => {
    dragTargetRef.current = target;
    setDragTarget(target);
  };

  const clearDrag = () => {
    setDraggedProjectId(null);
    updateDragTarget(null);
  };

  const reorderPinned = (projectId: string, destinationIndex: number) => {
    const pinnedProjectIds = projects
      .filter((project) => project.pinned)
      .map((project) => project.id);
    const sourceIndex = pinnedProjectIds.indexOf(projectId);
    if (sourceIndex < 0 || pinnedProjectIds.length < 2) {
      return;
    }

    const boundedIndex = Math.max(0, Math.min(destinationIndex, pinnedProjectIds.length - 1));
    if (sourceIndex === boundedIndex) {
      return;
    }

    const nextOrder = [...pinnedProjectIds];
    nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(boundedIndex, 0, projectId);
    onReorderPinnedProjects?.(nextOrder);

    const projectName = projects.find((project) => project.id === projectId)?.name ?? "";
    setReorderAnnouncement(
      t("sidebar.reorderMoved", {
        name: projectName,
        position: boundedIndex + 1,
        count: nextOrder.length
      })
    );
  };

  const handleReorderKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    projectId: string
  ) => {
    const pinnedProjectIds = projects
      .filter((project) => project.pinned)
      .map((project) => project.id);
    const currentIndex = pinnedProjectIds.indexOf(projectId);
    if (currentIndex < 0) {
      return;
    }

    let destinationIndex = currentIndex;
    if (event.key === "ArrowUp") destinationIndex = currentIndex - 1;
    else if (event.key === "ArrowDown") destinationIndex = currentIndex + 1;
    else if (event.key === "Home") destinationIndex = 0;
    else if (event.key === "End") destinationIndex = pinnedProjectIds.length - 1;
    else return;

    event.preventDefault();
    reorderPinned(projectId, destinationIndex);
  };

  const reorderPinnedAtEdge = (
    sourceProjectId: string,
    targetProjectId: string,
    edge: "before" | "after"
  ) => {
    const pinnedProjectIds = projects
      .filter((project) => project.pinned)
      .map((project) => project.id);
    const sourceIndex = pinnedProjectIds.indexOf(sourceProjectId);
    if (sourceIndex < 0 || sourceProjectId === targetProjectId) {
      return;
    }

    const nextOrder = pinnedProjectIds.filter((projectId) => projectId !== sourceProjectId);
    const targetIndex = nextOrder.indexOf(targetProjectId);
    if (targetIndex < 0) {
      return;
    }
    const destinationIndex = targetIndex + (edge === "after" ? 1 : 0);
    nextOrder.splice(destinationIndex, 0, sourceProjectId);
    onReorderPinnedProjects?.(nextOrder);

    const projectName = projects.find((project) => project.id === sourceProjectId)?.name ?? "";
    setReorderAnnouncement(
      t("sidebar.reorderMoved", {
        name: projectName,
        position: destinationIndex + 1,
        count: nextOrder.length
      })
    );
  };

  useEffect(() => {
    if (!draggedProjectId) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const targetCard = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-project-id]");
      const targetProjectId = targetCard?.dataset.projectId;
      const targetProject = projects.find((candidate) => candidate.id === targetProjectId);
      if (!targetCard || !targetProject?.pinned || targetProjectId === draggedProjectId) {
        updateDragTarget(null);
        return;
      }

      const bounds = targetCard.getBoundingClientRect();
      updateDragTarget({
        projectId: targetProject.id,
        edge: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after"
      });
    };

    const handlePointerEnd = () => {
      const target = dragTargetRef.current;
      if (target) {
        reorderPinnedAtEdge(draggedProjectId, target.projectId, target.edge);
      }
      clearDrag();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd, { once: true });
    window.addEventListener("pointercancel", handlePointerEnd, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [draggedProjectId]);

  return (
    <aside className="projects-sidebar">
      <header className="projects-header">
        <h2>{t("sidebar.projects")}</h2>
        <div className="projects-header-actions">
          <button
            className="icon-button"
            type="button"
            aria-label={t("sidebar.scanAria")}
            disabled={initializing || scanning || choosing}
            {...tooltipProps(t("sidebar.scanTooltip"), "bottom")}
            onClick={onScan}
          >
            {scanning ? (
              <LoaderCircle className="spin" size={15} aria-hidden="true" />
            ) : (
              <RefreshCw size={15} aria-hidden="true" />
            )}
          </button>
          <button
            className="icon-button primary-icon-button"
            type="button"
            aria-label={t("sidebar.addAria")}
            aria-keyshortcuts="Meta+O"
            disabled={initializing || scanning || choosing}
            {...tooltipProps(t("sidebar.addTooltip"), "bottom")}
            onClick={onChooseProject}
          >
            {choosing ? (
              <LoaderCircle className="spin" size={15} aria-hidden="true" />
            ) : (
              <Plus size={16} aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      <div className="project-list" aria-label={t("sidebar.projects")}>
        <span className="sr-only" id={dragInstructionsId}>
          {t("sidebar.reorderInstructions")}
        </span>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {reorderAnnouncement}
        </span>
        {projects.length === 0 ? (
          <div className="project-list-empty">
            <span>{t("sidebar.empty")}</span>
            <button type="button" onClick={onChooseProject} disabled={initializing || choosing}>
              <Plus size={14} aria-hidden="true" />
              {t("sidebar.addFolder")}
            </button>
          </div>
        ) : (
          projects.map((project) => {
            const isSelected = project.id === selectedProjectId;
            const isConfirming = project.id === confirmProjectId;
            const isRemoving = project.id === removingProjectId;
            const showsPin = project.pinned || activeProjectId === project.id;
            const pathTooltip = tooltipProps(project.path, "right", true);
            const dropEdge =
              dragTarget?.projectId === project.id ? dragTarget.edge : null;

            return (
              <article
                className={`project-card ${project.pinned ? "pinned" : ""} ${
                  isSelected ? "selected" : ""
                } ${project.missing ? "missing" : ""} ${
                  draggedProjectId === project.id ? "dragging" : ""
                } ${dropEdge ? `drag-over-${dropEdge}` : ""}`}
                key={project.id}
                data-project-id={project.id}
                onMouseEnter={() => setActiveProjectId(project.id)}
                onMouseLeave={(event) => {
                  if (!event.currentTarget.contains(document.activeElement)) {
                    setActiveProjectId(null);
                  }
                }}
                onFocus={() => setActiveProjectId(project.id)}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setActiveProjectId(null);
                  }
                }}
              >
                <button
                  className="project-card-main"
                  type="button"
                  aria-label={`${project.name}, ${project.path}`}
                  aria-current={isSelected ? "page" : undefined}
                  onFocus={pathTooltip.onFocus}
                  onBlur={pathTooltip.onBlur}
                  onClick={() => {
                    setConfirmProjectId(null);
                    onSelectProject(project.id);
                  }}
                >
                  <span className="project-name-line">
                    <strong
                      onMouseEnter={pathTooltip.onMouseEnter}
                      onMouseLeave={pathTooltip.onMouseLeave}
                    >
                      {project.name}
                    </strong>
                    {project.missing ? (
                      <span className="missing-badge">
                        <AlertTriangle size={11} aria-hidden="true" />
                        {t("sidebar.missing")}
                      </span>
                    ) : null}
                  </span>
                  <span className="project-counts">
                    <span
                      className="count-badge codex"
                      aria-label={t("sidebar.codexSessions", { count: project.codexSessionCount })}
                      {...tooltipProps(t("sidebar.codexSessions", { count: project.codexSessionCount }))}
                    >
                      <SquareTerminal size={11} aria-hidden="true" />
                      <span>{project.codexSessionCount}</span>
                    </span>
                    <span
                      className="count-badge claude"
                      aria-label={t("sidebar.claudeSessions", { count: project.claudeSessionCount })}
                      {...tooltipProps(t("sidebar.claudeSessions", { count: project.claudeSessionCount }))}
                    >
                      <Bot size={11} aria-hidden="true" />
                      <span>{project.claudeSessionCount}</span>
                    </span>
                    <span
                      className="count-badge worktrees"
                      aria-label={t("sidebar.worktrees", { count: project.worktreeCount })}
                      {...tooltipProps(t("sidebar.worktrees", { count: project.worktreeCount }))}
                    >
                      <GitFork size={11} aria-hidden="true" />
                      <span>{project.worktreeCount}</span>
                    </span>
                  </span>
                </button>

                <div className="project-card-actions">
                  {project.pinned ? (
                    <button
                      className="project-drag-handle"
                      type="button"
                      disabled={!onReorderPinnedProjects}
                      aria-label={t("sidebar.reorder", { name: project.name })}
                      aria-describedby={dragInstructionsId}
                      {...tooltipProps(t("sidebar.reorderTooltip"), "left")}
                      onKeyDown={(event) => handleReorderKeyDown(event, project.id)}
                      onPointerDown={(event) => {
                        if (event.button !== 0 || !onReorderPinnedProjects) {
                          return;
                        }
                        event.preventDefault();
                        event.currentTarget.focus();
                        setDraggedProjectId(project.id);
                        updateDragTarget(null);
                      }}
                    >
                      <GripVertical size={14} aria-hidden="true" />
                    </button>
                  ) : null}
                  {showsPin ? (
                    <button
                      className={`project-pin-button ${project.pinned ? "pinned" : ""}`}
                      type="button"
                      aria-label={t(project.pinned ? "sidebar.unpin" : "sidebar.pin", {
                        name: project.name
                      })}
                      aria-pressed={project.pinned}
                      {...tooltipProps(
                        t(project.pinned ? "sidebar.unpin" : "sidebar.pin", {
                          name: project.name
                        }),
                        "left"
                      )}
                      onClick={() => onSetProjectPinned?.(project.id, !project.pinned)}
                    >
                      {project.pinned ? (
                        <PinOff size={14} aria-hidden="true" />
                      ) : (
                        <Pin size={14} aria-hidden="true" />
                      )}
                    </button>
                  ) : null}
                  <button
                    className="project-delete-button"
                    type="button"
                    aria-label={t("sidebar.remove", { name: project.name })}
                    {...tooltipProps(t("sidebar.remove", { name: project.name }), "left")}
                    onClick={() => setConfirmProjectId(project.id)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>

                {isConfirming ? (
                  <div
                    className="project-remove-confirm"
                    role="alertdialog"
                    aria-label={t("sidebar.removeDialog")}
                  >
                    <div>
                      <strong>{t("sidebar.removeQuestion")}</strong>
                      <span>{t("sidebar.removeHint")}</span>
                    </div>
                    <div className="project-remove-actions">
                      <button
                        type="button"
                        disabled={isRemoving}
                        onClick={() => setConfirmProjectId(null)}
                      >
                        {t("sidebar.cancel")}
                      </button>
                      <button
                        className="danger-button"
                        type="button"
                        disabled={isRemoving}
                        onClick={() => {
                          void onRemoveProject(project.id).then(() => setConfirmProjectId(null));
                        }}
                      >
                        {isRemoving ? (
                          <LoaderCircle className="spin" size={13} aria-hidden="true" />
                        ) : null}
                        {t("sidebar.removeAction")}
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>

      <footer className="projects-footer">
        <button
          className="settings-button"
          type="button"
          aria-keyshortcuts="Meta+,"
          disabled={initializing}
          {...tooltipProps(t("sidebar.settingsTooltip"))}
          onClick={onOpenSettings}
        >
          <SettingsIcon size={15} aria-hidden="true" />
          {t("sidebar.settings")}
        </button>
      </footer>
    </aside>
  );
}
