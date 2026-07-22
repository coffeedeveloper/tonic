import { useId } from "react";
import {
  CalendarPlus,
  Check,
  ChevronDown,
  Copy,
  FolderTree,
  GitBranch,
  History,
  LoaderCircle,
  MessageSquareText,
  Wrench
} from "lucide-react";
import { useI18n } from "../i18n";
import type { SessionRecord } from "../types";
import { formatCount, formatTokenUsage, formatUsdCost } from "../utils/format";
import { SessionDetails } from "./SessionDetails";
import { TimeValue } from "./ui/TimeValue";
import type { TooltipPropsFactory } from "./ui/Tooltip";

export function SessionCard({
  session,
  projectPath,
  now,
  expanded,
  copied,
  copying,
  tooltipProps,
  onToggleDetails,
  onResume
}: {
  session: SessionRecord;
  projectPath: string;
  now: number;
  expanded: boolean;
  copied: boolean;
  copying: boolean;
  tooltipProps: TooltipPropsFactory;
  onToggleDetails: () => void;
  onResume: () => void;
}) {
  const detailId = `session-detail-${useId().replace(/:/gu, "")}`;
  const { language, t } = useI18n();
  const title = session.title.trim() || t("session.untitled");
  const summary = session.summary.trim() || t("session.noSummary");
  const firstPrompt = session.firstPrompt.trim() || t("session.noPrompt");
  const workingDirectoryLabel = compactDirectoryLabel(
    session.workingDirectory,
    session.worktreePath,
    projectPath,
    t("session.projectRoot")
  );
  const hasDetails = Boolean(
    session.workingDirectory ||
      session.worktreePath ||
      session.tokenBreakdown ||
      session.estimatedCostUsd !== null ||
      session.source ||
      session.permissionMode ||
      session.sandboxMode ||
      session.cliVersion
  );
  const detailsLabel = expanded ? t("session.hideDetails") : t("session.showDetails");
  const detailsAriaLabel = t(
    expanded ? "session.hideDetailsFor" : "session.showDetailsFor",
    { name: title }
  );
  const detailsTooltipProps = tooltipProps(detailsLabel, "left");
  const resumeLabel = copied
    ? t("session.copied")
    : t("session.resumeAria", { name: title });
  const resumeTooltipProps = tooltipProps(
    copied ? t("session.copied") : t("session.resume"),
    "left"
  );

  return (
    <article
      className={`record-card session-card ${expanded ? "expanded" : ""}`}
      role="listitem"
    >
      <div className="record-card-content">
        <div className="session-primary-row">
          <div className="session-identity">
            <span className={`agent-badge ${session.agent}`}>
              {session.agent === "claude" ? "Claude Code" : "Codex"}
            </span>
            <strong
              className="session-title"
              tabIndex={0}
              {...tooltipProps(title, "top", true)}
            >
              {title}
            </strong>
          </div>

          <dl className="session-times">
            <div>
              <dt className="sr-only">{t("session.created")}</dt>
              <dd>
                <span
                  className="session-time-icon"
                  role="img"
                  aria-label={t("session.created")}
                  {...tooltipProps(t("session.created"), "top")}
                >
                  <CalendarPlus size={13} aria-hidden="true" />
                </span>
                <TimeValue value={session.createdAt} now={now} tooltipProps={tooltipProps} />
              </dd>
            </div>
            <div>
              <dt className="sr-only">{t("session.updated")}</dt>
              <dd>
                <span
                  className="session-time-icon"
                  role="img"
                  aria-label={t("session.updated")}
                  {...tooltipProps(t("session.updated"), "top")}
                >
                  <History size={13} aria-hidden="true" />
                </span>
                <TimeValue value={session.updatedAt} now={now} tooltipProps={tooltipProps} />
              </dd>
            </div>
          </dl>
        </div>

        <div className="session-meta-row">
          <span>
            <b>{t("session.model")}</b>
            {session.model.trim() || t("session.unknown")}
          </span>
          {session.branch.trim() ? (
            <span>
              <GitBranch size={13} aria-hidden="true" />
              <b>{t("session.branch")}</b>
              {session.branch.trim()}
            </span>
          ) : null}
          {session.tokenUsage !== null ? (
            <span>
              <b>{t("session.usage")}</b>
              {formatTokenUsage(session.tokenUsage, language)}
            </span>
          ) : null}
          {session.estimatedCostUsd !== null ? (
            <span>
              <b>{t("session.estimatedCost")}</b>
              {formatUsdCost(session.estimatedCostUsd, language)}
            </span>
          ) : null}
          {session.workingDirectory ? (
            <span
              className="session-meta-directory"
              tabIndex={0}
              aria-label={`${t("session.workingDirectory")}: ${session.workingDirectory}`}
              {...tooltipProps(session.workingDirectory, "top", true)}
            >
              <FolderTree size={13} aria-hidden="true" />
              <span>{workingDirectoryLabel}</span>
            </span>
          ) : null}
          {session.turnCount !== null ? (
            <span>
              <MessageSquareText size={13} aria-hidden="true" />
              {t(session.turnCount === 1 ? "session.turnOne" : "session.turnMany", {
                count: formatCount(session.turnCount, language)
              })}
            </span>
          ) : null}
          {session.toolCallCount !== null ? (
            <span>
              <Wrench size={13} aria-hidden="true" />
              {t(
                session.toolCallCount === 1
                  ? "session.toolCallOne"
                  : "session.toolCallMany",
                { count: formatCount(session.toolCallCount, language) }
              )}
            </span>
          ) : null}
        </div>

        <p
          className="session-summary"
          tabIndex={0}
          {...tooltipProps(firstPrompt, "top", true)}
        >
          {summary}
        </p>
      </div>

      <div className="session-card-actions">
        {hasDetails ? (
          <button
            className="session-details-toggle"
            type="button"
            aria-label={detailsAriaLabel}
            aria-expanded={expanded}
            aria-controls={detailId}
            {...detailsTooltipProps}
            onClick={() => {
              detailsTooltipProps.onMouseLeave();
              onToggleDetails();
            }}
          >
            <ChevronDown size={15} aria-hidden="true" />
          </button>
        ) : null}
        <button
          className={`record-action-button ${copied ? "copied" : ""}`}
          type="button"
          disabled={copying}
          aria-label={resumeLabel}
          {...resumeTooltipProps}
          onClick={() => {
            resumeTooltipProps.onMouseLeave();
            onResume();
          }}
        >
          {copying ? (
            <LoaderCircle className="spin" size={15} aria-hidden="true" />
          ) : copied ? (
            <Check size={15} aria-hidden="true" />
          ) : (
            <Copy size={15} aria-hidden="true" />
          )}
        </button>
      </div>

      {expanded && hasDetails ? (
        <SessionDetails id={detailId} session={session} title={title} />
      ) : null}
    </article>
  );
}

function compactDirectoryLabel(
  directory: string,
  worktreePath: string,
  projectPath: string,
  rootLabel: string
) {
  if (!directory) return "";
  const normalizedDirectory = directory.replace(/\/+$/u, "");
  const normalizedProject = projectPath.replace(/\/+$/u, "");
  const normalizedWorktree = worktreePath.replace(/\/+$/u, "");
  if (normalizedWorktree && normalizedWorktree !== normalizedProject) {
    const worktreeName = normalizedWorktree.split("/").filter(Boolean).at(-1) || normalizedWorktree;
    if (normalizedDirectory === normalizedWorktree) return worktreeName;
    if (normalizedDirectory.startsWith(`${normalizedWorktree}/`)) {
      return `${worktreeName}/${normalizedDirectory.slice(normalizedWorktree.length + 1)}`;
    }
  }
  if (normalizedDirectory === normalizedProject) return rootLabel;
  if (normalizedProject && normalizedDirectory.startsWith(`${normalizedProject}/`)) {
    return normalizedDirectory.slice(normalizedProject.length + 1);
  }
  const segments = normalizedDirectory.split("/").filter(Boolean);
  return segments.slice(-2).join("/") || normalizedDirectory;
}
