import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useI18n } from "../i18n";
import type { TooltipPropsFactory } from "./ui/Tooltip";

const noop = () => undefined;

export type TitlebarProps = {
  sidebarCollapsed?: boolean;
  tooltipProps?: TooltipPropsFactory;
  onToggleSidebar?: () => void;
};

export function Titlebar({
  sidebarCollapsed = false,
  tooltipProps,
  onToggleSidebar = noop
}: TitlebarProps) {
  const { t } = useI18n();
  const toggleLabel = t(sidebarCollapsed ? "titlebar.showProjects" : "titlebar.hideProjects");
  const toggleTooltipProps = tooltipProps?.(toggleLabel, "bottom") ?? {};

  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <div className="traffic-light-spacer" aria-hidden="true" />
        <button
          className="titlebar-button sidebar-toggle-button"
          type="button"
          aria-label={toggleLabel}
          aria-keyshortcuts="Meta+\\"
          aria-expanded={!sidebarCollapsed}
          {...toggleTooltipProps}
          onClick={onToggleSidebar}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen size={15} aria-hidden="true" />
          ) : (
            <PanelLeftClose size={15} aria-hidden="true" />
          )}
        </button>
      </div>
      <h1>tonic</h1>
      <div aria-hidden="true" />
    </header>
  );
}
