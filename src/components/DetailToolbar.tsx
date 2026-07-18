import { useI18n } from "../i18n";
import type { DetailTab, EditorOption, ProjectSummary, Settings } from "../types";
import { OpenProjectControl } from "./OpenProjectControl";
import type { TooltipPropsFactory } from "./ui/Tooltip";

export function DetailToolbar({
  project,
  activeTab,
  editors,
  settings,
  opening,
  tooltipProps,
  onSelectTab,
  onOpenProject,
  onOpenProjectWithEditor
}: {
  project: ProjectSummary | null;
  activeTab: DetailTab;
  editors: EditorOption[];
  settings: Settings;
  opening: boolean;
  tooltipProps: TooltipPropsFactory;
  onSelectTab: (tab: DetailTab) => void;
  onOpenProject: () => void;
  onOpenProjectWithEditor: (editorId: string) => void;
}) {
  const { t } = useI18n();
  return (
    <header className="detail-toolbar">
      <div className="segmented-tabs" role="tablist" aria-label={t("toolbar.details")}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "sessions"}
          aria-keyshortcuts="Meta+1"
          className={activeTab === "sessions" ? "active" : ""}
          onClick={() => onSelectTab("sessions")}
        >
          {t("toolbar.sessions")}
          {project ? (
            <span>{project.codexSessionCount + project.claudeSessionCount}</span>
          ) : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "worktrees"}
          aria-keyshortcuts="Meta+2"
          className={activeTab === "worktrees" ? "active" : ""}
          onClick={() => onSelectTab("worktrees")}
        >
          {t("toolbar.worktrees")}
          {project ? <span>{project.worktreeCount}</span> : null}
        </button>
      </div>

      <div className="toolbar-actions">
        <OpenProjectControl
          project={project}
          editors={editors}
          settings={settings}
          opening={opening}
          tooltipProps={tooltipProps}
          onOpenDefault={onOpenProject}
          onOpenWithEditor={onOpenProjectWithEditor}
        />
      </div>
    </header>
  );
}
