import { useCallback, useEffect, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent
} from "react";

export const defaultProjectPanelWidth = 248;
export const minProjectPanelWidth = 216;
export const maxProjectPanelWidth = 380;

const storageKey = "tonic.projectPanel";

type StoredProjectPanel = {
  width?: number;
  collapsed?: boolean;
};

function clampWidth(value: number) {
  return Math.min(maxProjectPanelWidth, Math.max(minProjectPanelWidth, value));
}

function readStoredPanel(): Required<StoredProjectPanel> {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      return { width: defaultProjectPanelWidth, collapsed: false };
    }

    const value = JSON.parse(stored) as StoredProjectPanel;
    return {
      width:
        typeof value.width === "number" && Number.isFinite(value.width)
          ? clampWidth(value.width)
          : defaultProjectPanelWidth,
      collapsed: value.collapsed === true
    };
  } catch {
    return { width: defaultProjectPanelWidth, collapsed: false };
  }
}

export function useProjectPanel() {
  const initialPanelRef = useRef<Required<StoredProjectPanel> | null>(null);
  if (!initialPanelRef.current) {
    initialPanelRef.current = readStoredPanel();
  }

  const [width, setWidth] = useState(initialPanelRef.current.width);
  const [collapsed, setCollapsed] = useState(initialPanelRef.current.collapsed);
  const [resizing, setResizing] = useState(false);
  const resizeStartRef = useRef({ x: 0, width: defaultProjectPanelWidth });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ width, collapsed }));
    } catch {
      // The UI should remain usable when storage is unavailable.
    }
  }, [collapsed, width]);

  useEffect(() => {
    if (!resizing) {
      return undefined;
    }

    const originalCursor = document.body.style.cursor;
    const originalUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (event: PointerEvent) => {
      setWidth(
        clampWidth(resizeStartRef.current.width + event.clientX - resizeStartRef.current.x)
      );
    };
    const handlePointerEnd = () => setResizing(false);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd, { once: true });
    window.addEventListener("pointercancel", handlePointerEnd, { once: true });

    return () => {
      document.body.style.cursor = originalCursor;
      document.body.style.userSelect = originalUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [resizing]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => !current);
    setResizing(false);
  }, []);

  const resetWidth = useCallback(() => {
    setWidth(defaultProjectPanelWidth);
    setResizing(false);
  }, []);

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (collapsed || event.button !== 0) {
        return;
      }

      event.preventDefault();
      resizeStartRef.current = { x: event.clientX, width };
      setResizing(true);
    },
    [collapsed, width]
  );

  const handleResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (collapsed) {
        return;
      }

      const step = event.shiftKey ? 32 : 12;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setWidth((current) => clampWidth(current - step));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setWidth((current) => clampWidth(current + step));
      } else if (event.key === "Home") {
        event.preventDefault();
        setWidth(minProjectPanelWidth);
      } else if (event.key === "End") {
        event.preventDefault();
        setWidth(maxProjectPanelWidth);
      }
    },
    [collapsed]
  );

  return {
    width,
    collapsed,
    resizing,
    minWidth: minProjectPanelWidth,
    maxWidth: maxProjectPanelWidth,
    setCollapsed,
    toggleCollapsed,
    resetWidth,
    handleResizePointerDown,
    handleResizeKeyDown
  };
}
