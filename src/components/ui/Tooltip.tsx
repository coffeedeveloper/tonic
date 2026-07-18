import { useLayoutEffect, useRef } from "react";
import type { CSSProperties, FocusEvent, MouseEvent as ReactMouseEvent } from "react";

export type TooltipPlacement = "top" | "right" | "bottom" | "left";

export type TooltipState = {
  text: string;
  placement: TooltipPlacement;
  x: number;
  y: number;
  wide: boolean;
};

export type TooltipTargetProps = {
  onMouseEnter: (event: ReactMouseEvent<HTMLElement>) => void;
  onMouseLeave: () => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onBlur: (event: FocusEvent<HTMLElement>) => void;
};

export type TooltipPropsFactory = (
  text: string,
  placement?: TooltipPlacement,
  wide?: boolean
) => TooltipTargetProps;

export function tooltipPosition(
  element: HTMLElement,
  placement: TooltipPlacement
): Pick<TooltipState, "placement" | "x" | "y"> {
  const rect = element.getBoundingClientRect();
  const gap = 9;
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  if (placement === "bottom") {
    return { placement, x, y: rect.bottom + gap };
  }

  if (placement === "right") {
    return { placement, x: rect.right + gap, y };
  }

  if (placement === "left") {
    return { placement, x: rect.left - gap, y };
  }

  return { placement, x, y: rect.top - gap };
}

export function TooltipOverlay({ tooltip }: { tooltip: TooltipState | null }) {
  const tooltipRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = tooltipRef.current;
    if (!element) {
      return;
    }

    const viewportMargin = 8;
    element.style.setProperty("--tooltip-offset-x", "0px");
    element.style.setProperty("--tooltip-offset-y", "0px");

    const rect = element.getBoundingClientRect();
    let offsetX = 0;
    let offsetY = 0;

    if (rect.left < viewportMargin) {
      offsetX = viewportMargin - rect.left;
    } else if (rect.right > window.innerWidth - viewportMargin) {
      offsetX = window.innerWidth - viewportMargin - rect.right;
    }

    if (rect.top < viewportMargin) {
      offsetY = viewportMargin - rect.top;
    } else if (rect.bottom > window.innerHeight - viewportMargin) {
      offsetY = window.innerHeight - viewportMargin - rect.bottom;
    }

    element.style.setProperty("--tooltip-offset-x", `${offsetX}px`);
    element.style.setProperty("--tooltip-offset-y", `${offsetY}px`);
  }, [tooltip]);

  if (!tooltip) {
    return null;
  }

  return (
    <div
      ref={tooltipRef}
      className={`app-tooltip ${tooltip.placement} ${tooltip.wide ? "wide" : ""}`}
      style={{ left: tooltip.x, top: tooltip.y } as CSSProperties}
      role="tooltip"
    >
      {tooltip.text}
    </div>
  );
}
