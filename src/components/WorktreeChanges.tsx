import { useI18n } from "../i18n";
import type { WorktreeFileChange, WorktreeFileStatus } from "../types";
import { formatCount } from "../utils/format";
import type { TooltipPropsFactory } from "./ui/Tooltip";

export function WorktreeChanges({
  id,
  name,
  changes,
  tooltipProps
}: {
  id: string;
  name: string;
  changes: WorktreeFileChange[];
  tooltipProps: TooltipPropsFactory;
}) {
  const { language, t } = useI18n();
  const additions = changes.reduce(
    (total, change) => total + (change.additions ?? 0),
    0
  );
  const deletions = changes.reduce(
    (total, change) => total + (change.deletions ?? 0),
    0
  );

  return (
    <section
      className="worktree-change-panel"
      id={id}
      role="region"
      aria-label={t("worktree.detailsFor", { name })}
    >
      <div className="worktree-change-heading">
        <strong>{t("worktree.changedFiles")}</strong>
        <span
          className="worktree-change-summary"
          aria-label={t("worktree.lineSummary", {
            additions: formatCount(additions, language),
            deletions: formatCount(deletions, language)
          })}
        >
          <b className="line-additions">+{formatCount(additions, language)}</b>
          <b className="line-deletions">−{formatCount(deletions, language)}</b>
        </span>
      </div>

      <ul className="worktree-change-list" aria-label={t("worktree.changedFiles")}>
        {changes.map((change) => {
          const displayPath = change.previousPath
            ? `${change.previousPath} → ${change.path}`
            : change.path;
          const statusLabel = fileStatusLabel(change.status);

          return (
            <li className="worktree-change-item" key={`${change.status}:${displayPath}`}>
              <span className={`worktree-file-status status-${change.status}`}>
                {statusLabel}
              </span>
              <code tabIndex={0} {...tooltipProps(displayPath, "top", true)}>
                {displayPath}
              </code>
              {lineStats(change)}
            </li>
          );
        })}
      </ul>
    </section>
  );

  function fileStatusLabel(status: WorktreeFileStatus) {
    if (status === "added") return t("worktree.statusAdded");
    if (status === "deleted") return t("worktree.statusDeleted");
    if (status === "renamed") return t("worktree.statusRenamed");
    if (status === "copied") return t("worktree.statusCopied");
    if (status === "untracked") return t("worktree.statusUntracked");
    if (status === "conflicted") return t("worktree.statusConflicted");
    return t("worktree.statusModified");
  }

  function lineStats(change: WorktreeFileChange) {
    if (change.binary) {
      return <span className="worktree-file-kind">{t("worktree.binary")}</span>;
    }
    if (change.additions === null || change.deletions === null) {
      return <span className="worktree-file-kind">{t("worktree.linesUnavailable")}</span>;
    }

    const formattedAdditions = formatCount(change.additions, language);
    const formattedDeletions = formatCount(change.deletions, language);
    return (
      <span className="worktree-file-lines">
        <span
          className="line-additions"
          aria-label={t("worktree.additions", { count: formattedAdditions })}
        >
          +{formattedAdditions}
        </span>
        <span
          className="line-deletions"
          aria-label={t("worktree.deletions", { count: formattedDeletions })}
        >
          −{formattedDeletions}
        </span>
      </span>
    );
  }
}
