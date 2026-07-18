import type { KeyboardEventHandler, PointerEventHandler } from "react";
import { useI18n } from "../i18n";

export type SidebarResizerProps = {
  width: number;
  minWidth: number;
  maxWidth: number;
  resizing?: boolean;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
  onReset: () => void;
};

export function SidebarResizer({
  width,
  minWidth,
  maxWidth,
  resizing = false,
  onPointerDown,
  onKeyDown,
  onReset
}: SidebarResizerProps) {
  const { t } = useI18n();
  return (
    <div
      className={`sidebar-resizer ${resizing ? "resizing" : ""}`}
      role="separator"
      aria-label={t("resizer.label")}
      aria-description={t("resizer.description")}
      aria-orientation="vertical"
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
    />
  );
}
