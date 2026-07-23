import { useEffect, useId, useState } from "react";
import { ChevronDown, FolderOpen, GitBranch, LoaderCircle } from "lucide-react";
import { useNow } from "../hooks/useNow";
import { useI18n } from "../i18n";
import type { WorktreeRecord } from "../types";
import { shortHash } from "../utils/format";
import { EmptyState } from "./ui/Feedback";
import { TimeValue } from "./ui/TimeValue";
import type { TooltipPropsFactory } from "./ui/Tooltip";
import { WorktreeChanges } from "./WorktreeChanges";

export function WorktreeList({
  worktrees,
  openingPath,
  tooltipProps,
  onOpen
}: {
  worktrees: WorktreeRecord[];
  openingPath: string | null;
  tooltipProps: TooltipPropsFactory;
  onOpen: (worktree: WorktreeRecord) => void;
}) {
  const now = useNow();
  const { t } = useI18n();
  const detailIdPrefix = `worktree-detail-${useId().replace(/:/gu, "")}`;
  const [expandedPath, setExpandedPath] = useState<string | null>(null);

  useEffect(() => {
    setExpandedPath((current) =>
      current && worktrees.some((worktree) => worktree.path === current) ? current : null
    );
  }, [worktrees]);

  if (worktrees.length === 0) {
    return (
      <EmptyState
        title={t("worktree.emptyTitle")}
        description={t("worktree.emptyDescription")}
      />
    );
  }

  return (
    <div className="record-list worktree-list" role="list">
      {worktrees.map((worktree, index) => {
        const commit = worktree.lastCommit;
        const isOpening = openingPath === worktree.path;
        const branch = worktree.branch.trim() || t("worktree.detached");
        const changes = worktree.changes ?? [];
        const expanded = expandedPath === worktree.path;
        const detailId = `${detailIdPrefix}-${index}`;
        const detailsLabel = expanded
          ? t("worktree.hideDetails")
          : t("worktree.showDetails");
        const detailsTooltipProps = tooltipProps(detailsLabel, "left");

        return (
          <article
            className={`record-card worktree-card ${expanded ? "expanded" : ""}`}
            role="listitem"
            key={worktree.path}
          >
            <div className="record-card-content">
              <div className="worktree-primary-row">
                <div className="worktree-name">
                  <strong tabIndex={0} {...tooltipProps(worktree.path, "top", true)}>
                    {worktree.name}
                  </strong>
                  {worktree.isMain ? <span className="main-badge">{t("worktree.main")}</span> : null}
                </div>
                <div className="worktree-meta">
                  <span className={worktree.changeCount > 0 ? "has-changes" : ""}>
                    {worktree.changeCount === 1
                      ? t("worktree.changeOne")
                      : t("worktree.changeMany", { count: worktree.changeCount })}
                  </span>
                  <span tabIndex={0} {...tooltipProps(branch, "top", true)}>
                    <GitBranch size={13} aria-hidden="true" />
                    {branch}
                  </span>
                </div>
              </div>

              {commit ? (
                <div className="last-commit">
                  <span className="commit-label">{t("worktree.lastCommit")}</span>
                  <TimeValue value={commit.authoredAt} now={now} tooltipProps={tooltipProps} />
                  <code>{shortHash(commit.hash)}</code>
                  <strong
                    tabIndex={0}
                    {...tooltipProps(commit.title || t("worktree.untitledCommit"), "top", true)}
                  >
                    {commit.title || t("worktree.untitledCommit")}
                  </strong>
                  {commit.body.trim() ? (
                    <p tabIndex={0} {...tooltipProps(commit.body, "top", true)}>
                      {commit.body}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="last-commit empty-commit">{t("worktree.noCommits")}</div>
              )}
            </div>

            <div className="worktree-card-actions">
              {changes.length > 0 ? (
                <button
                  className="worktree-details-toggle"
                  type="button"
                  aria-label={t(
                    expanded ? "worktree.hideDetailsFor" : "worktree.showDetailsFor",
                    { name: worktree.name }
                  )}
                  aria-expanded={expanded}
                  aria-controls={detailId}
                  {...detailsTooltipProps}
                  onClick={() => {
                    detailsTooltipProps.onMouseLeave();
                    setExpandedPath((current) =>
                      current === worktree.path ? null : worktree.path
                    );
                  }}
                >
                  <ChevronDown size={15} aria-hidden="true" />
                </button>
              ) : null}
              <button
                className="record-action-button"
                type="button"
                disabled={isOpening}
                aria-label={t("toolbar.openPath", { path: worktree.path })}
                {...tooltipProps(t("toolbar.openPath", { path: worktree.path }), "left")}
                onClick={() => onOpen(worktree)}
              >
                {isOpening ? (
                  <LoaderCircle className="spin" size={15} aria-hidden="true" />
                ) : (
                  <FolderOpen size={15} aria-hidden="true" />
                )}
              </button>
            </div>

            {expanded && changes.length > 0 ? (
              <WorktreeChanges
                id={detailId}
                name={worktree.name}
                changes={changes}
                tooltipProps={tooltipProps}
              />
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
