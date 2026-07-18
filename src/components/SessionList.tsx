import { useEffect, useMemo, useState } from "react";
import { useNow } from "../hooks/useNow";
import { useI18n } from "../i18n";
import { DEFAULT_SESSION_SORT } from "../types";
import type { AgentFilter, SessionRecord, SessionSort } from "../types";
import { SessionCard } from "./SessionCard";
import { SessionListToolbar } from "./SessionListToolbar";
import { EmptyState } from "./ui/Feedback";
import type { TooltipPropsFactory } from "./ui/Tooltip";

export function SessionList({
  sessions,
  projectPath,
  agentFilter,
  sort = DEFAULT_SESSION_SORT,
  copiedSessionId,
  copyingSessionId,
  tooltipProps,
  onFilterChange,
  onSortChange,
  onResume
}: {
  sessions: SessionRecord[];
  projectPath: string;
  agentFilter: AgentFilter;
  sort?: SessionSort;
  copiedSessionId: string | null;
  copyingSessionId: string | null;
  tooltipProps: TooltipPropsFactory;
  onFilterChange: (filter: AgentFilter) => void;
  onSortChange: (sort: SessionSort) => void;
  onResume: (session: SessionRecord) => void;
}) {
  const now = useNow();
  const { t } = useI18n();
  const [expandedSessionKey, setExpandedSessionKey] = useState<string | null>(null);
  const visibleSessions = useMemo(
    () =>
      agentFilter === "all"
        ? sessions
        : sessions.filter((session) => session.agent === agentFilter),
    [agentFilter, sessions]
  );
  const sortedSessions = useMemo(
    () => sortSessions(visibleSessions, sort),
    [sort, visibleSessions]
  );

  useEffect(() => {
    setExpandedSessionKey(null);
  }, [projectPath]);

  useEffect(() => {
    setExpandedSessionKey((current) =>
      current && visibleSessions.some((session) => `${session.agent}:${session.id}` === current)
        ? current
        : null
    );
  }, [visibleSessions]);

  if (sessions.length === 0) {
    return (
      <EmptyState
        title={t("session.emptyTitle")}
        description={t("session.emptyDescription")}
      />
    );
  }

  return (
    <div className="session-list-content">
      <SessionListToolbar
        agentFilter={agentFilter}
        sort={sort}
        totalCount={sessions.length}
        visibleCount={visibleSessions.length}
        tooltipProps={tooltipProps}
        onFilterChange={onFilterChange}
        onSortChange={onSortChange}
      />

      <div id="session-list-results">
        {sortedSessions.length > 0 ? (
          <div className="record-list session-list" role="list">
            {sortedSessions.map((session) => {
              const sessionKey = `${session.agent}:${session.id}`;

              return (
                <SessionCard
                  key={sessionKey}
                  session={session}
                  projectPath={projectPath}
                  now={now}
                  expanded={expandedSessionKey === sessionKey}
                  copied={copiedSessionId === session.id}
                  copying={copyingSessionId === session.id}
                  tooltipProps={tooltipProps}
                  onToggleDetails={() =>
                    setExpandedSessionKey((current) =>
                      current === sessionKey ? null : sessionKey
                    )
                  }
                  onResume={() => onResume(session)}
                />
              );
            })}
          </div>
        ) : (
          <div className="session-filter-empty">
            <EmptyState
              title={t("session.emptyTitle")}
              description={t("session.emptyDescription")}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function sortSessions(sessions: SessionRecord[], sort: SessionSort) {
  return sessions
    .map((session, index) => ({ session, index }))
    .sort((left, right) => {
      const leftValue = sortableValue(left.session, sort);
      const rightValue = sortableValue(right.session, sort);

      if (leftValue === null && rightValue === null) {
        return left.index - right.index;
      }
      if (leftValue === null) {
        return 1;
      }
      if (rightValue === null) {
        return -1;
      }

      const result = (leftValue - rightValue) * (sort.direction === "asc" ? 1 : -1);
      return result || left.index - right.index;
    })
    .map(({ session }) => session);
}

function sortableValue(session: SessionRecord, sort: SessionSort) {
  if (sort.key === "tokenUsage") {
    return session.tokenUsage;
  }

  const timestamp = Date.parse(session[sort.key]);
  return Number.isNaN(timestamp) ? null : timestamp;
}
