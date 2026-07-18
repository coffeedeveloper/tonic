import { FolderOpen, GitBranch, LoaderCircle } from "lucide-react";
import { useNow } from "../hooks/useNow";
import { useI18n } from "../i18n";
import type { WorktreeRecord } from "../types";
import { shortHash } from "../utils/format";
import { EmptyState } from "./ui/Feedback";
import { TimeValue } from "./ui/TimeValue";
import type { TooltipPropsFactory } from "./ui/Tooltip";

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
      {worktrees.map((worktree) => {
        const commit = worktree.lastCommit;
        const isOpening = openingPath === worktree.path;
        const branch = worktree.branch.trim() || t("worktree.detached");

        return (
          <article className="record-card worktree-card" role="listitem" key={worktree.path}>
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

            <button
              className="record-action-button"
              type="button"
              disabled={isOpening}
              {...tooltipProps(t("toolbar.openPath", { path: worktree.path }), "left")}
              onClick={() => onOpen(worktree)}
            >
              {isOpening ? (
                <LoaderCircle className="spin" size={15} aria-hidden="true" />
              ) : (
                <FolderOpen size={15} aria-hidden="true" />
              )}
              {t("toolbar.open")}
            </button>
          </article>
        );
      })}
    </div>
  );
}
