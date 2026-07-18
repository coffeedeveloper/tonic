import { ArrowUpDown, ListFilter, Rows3, X } from "lucide-react";
import { useRef } from "react";
import { useI18n } from "../i18n";
import { DEFAULT_SESSION_SORT } from "../types";
import type { AgentFilter, SessionSort } from "../types";
import type { TooltipPropsFactory } from "./ui/Tooltip";

export function SessionListToolbar({
  agentFilter,
  sort,
  totalCount,
  visibleCount,
  tooltipProps,
  onFilterChange,
  onSortChange
}: {
  agentFilter: AgentFilter;
  sort: SessionSort;
  totalCount: number;
  visibleCount: number;
  tooltipProps: TooltipPropsFactory;
  onFilterChange: (filter: AgentFilter) => void;
  onSortChange: (sort: SessionSort) => void;
}) {
  const { t } = useI18n();
  const filterSelectRef = useRef<HTMLSelectElement>(null);
  const clearFilterTooltipProps = tooltipProps(t("toolbar.clearFilter"), "bottom");
  const countLabel =
    agentFilter === "all"
      ? t(totalCount === 1 ? "session.listCountOne" : "session.listCountMany", {
          count: totalCount
        })
      : t("session.listFilteredCount", { visible: visibleCount, total: totalCount });

  return (
    <div className="session-list-toolbar" role="group" aria-label={t("session.listControls")}>
      <div className="session-list-count" aria-live="polite" aria-atomic="true">
        <Rows3 size={15} strokeWidth={1.8} aria-hidden="true" />
        <span>{countLabel}</span>
      </div>

      <div className="session-list-toolbar-controls">
        <div className={`session-agent-filter ${agentFilter !== "all" ? "active" : ""}`}>
          <label className="session-select-control">
            <ListFilter size={14} strokeWidth={1.9} aria-hidden="true" />
            <span className="sr-only">{t("toolbar.filter")}</span>
            <select
              ref={filterSelectRef}
              aria-label={t("toolbar.filter")}
              aria-controls="session-list-results"
              value={agentFilter}
              onChange={(event) => onFilterChange(event.target.value as AgentFilter)}
            >
              <option value="all">{t("toolbar.allAgents")}</option>
              <option value="codex">Codex</option>
              <option value="claude">Claude Code</option>
            </select>
          </label>

          {agentFilter !== "all" ? (
            <button
              className="session-filter-clear"
              type="button"
              aria-label={t("toolbar.clearFilter")}
              {...clearFilterTooltipProps}
              onClick={() => {
                clearFilterTooltipProps.onMouseLeave();
                onFilterChange("all");
                window.requestAnimationFrame(() => filterSelectRef.current?.focus());
              }}
            >
              <X size={13} strokeWidth={2} aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <label className="session-select-control session-sort-control">
          <ArrowUpDown size={14} strokeWidth={1.9} aria-hidden="true" />
          <span className="sr-only">{t("toolbar.sort")}</span>
          <select
            aria-label={t("toolbar.sort")}
            aria-controls="session-list-results"
            value={`${sort.key}:${sort.direction}`}
            onChange={(event) => onSortChange(parseSessionSort(event.target.value))}
          >
            <option value="updatedAt:desc">{t("toolbar.sortUpdatedNewest")}</option>
            <option value="updatedAt:asc">{t("toolbar.sortUpdatedOldest")}</option>
            <option value="createdAt:desc">{t("toolbar.sortCreatedNewest")}</option>
            <option value="createdAt:asc">{t("toolbar.sortCreatedOldest")}</option>
            <option value="tokenUsage:desc">{t("toolbar.sortTokensHighest")}</option>
            <option value="tokenUsage:asc">{t("toolbar.sortTokensLowest")}</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function parseSessionSort(value: string): SessionSort {
  const [key, direction] = value.split(":");
  if (
    (key === "createdAt" || key === "updatedAt" || key === "tokenUsage") &&
    (direction === "asc" || direction === "desc")
  ) {
    return { key, direction };
  }

  return DEFAULT_SESSION_SORT;
}
