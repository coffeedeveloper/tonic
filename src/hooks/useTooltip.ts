import { useCallback, useEffect, useState } from "react";
import type {
  TooltipPlacement,
  TooltipPropsFactory,
  TooltipState
} from "../components/ui/Tooltip";
import { tooltipPosition } from "../components/ui/Tooltip";

export function useTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const hideTooltip = useCallback(() => setTooltip(null), []);

  const getTooltipProps: TooltipPropsFactory = (
    text,
    placement: TooltipPlacement = "top",
    wide = false
  ) => {
    const show = (element: HTMLElement) => {
      setTooltip({
        ...tooltipPosition(element, placement),
        text,
        wide
      });
    };

    return {
      onMouseEnter: (event) => show(event.currentTarget),
      onMouseLeave: hideTooltip,
      onFocus: (event) => {
        if (event.target === event.currentTarget) {
          show(event.currentTarget);
        }
      },
      onBlur: hideTooltip
    };
  };

  useEffect(() => {
    if (!tooltip) {
      return undefined;
    }

    window.addEventListener("resize", hideTooltip);
    window.addEventListener("scroll", hideTooltip, true);
    return () => {
      window.removeEventListener("resize", hideTooltip);
      window.removeEventListener("scroll", hideTooltip, true);
    };
  }, [hideTooltip, tooltip]);

  return { tooltip, getTooltipProps, hideTooltip };
}
