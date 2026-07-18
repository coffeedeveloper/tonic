import {
  AppWindow,
  Check,
  ChevronDown,
  Code2,
  FolderOpen,
  LoaderCircle,
  SquareTerminal
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useI18n } from "../i18n";
import type { EditorOption, ProjectSummary, Settings } from "../types";
import type { TooltipPropsFactory } from "./ui/Tooltip";

export function OpenProjectControl({
  project,
  editors,
  settings,
  opening,
  tooltipProps,
  onOpenDefault,
  onOpenWithEditor
}: {
  project: ProjectSummary | null;
  editors: EditorOption[];
  settings: Settings;
  opening: boolean;
  tooltipProps: TooltipPropsFactory;
  onOpenDefault: () => void;
  onOpenWithEditor: (editorId: string) => void;
}) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const disabled = !project || project.missing || opening;
  const defaultEditor = useMemo(
    () => resolveDefaultEditor(editors, settings),
    [editors, settings]
  );
  const targets = useMemo(
    () => openTargets(editors, defaultEditor),
    [defaultEditor, editors]
  );
  const defaultLabel = editorLabel(defaultEditor, t("toolbar.defaultEditor"), t("toolbar.finder"));

  const closeMenu = useCallback((restoreFocus = false) => {
    setMenuOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => toggleRef.current?.focus());
    }
  }, []);

  const openMenu = useCallback(
    (position: "first" | "last" = "first") => {
      if (disabled || targets.length === 0) {
        return;
      }
      setMenuOpen(true);
      window.requestAnimationFrame(() => {
        const index = position === "last" ? targets.length - 1 : 0;
        itemRefs.current[index]?.focus();
      });
    },
    [disabled, targets.length]
  );

  useEffect(() => {
    closeMenu();
  }, [closeMenu, project?.id]);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        closeMenu();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
      }
    };
    const handleWindowChange = () => closeMenu();

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleWindowChange);
    window.addEventListener("resize", handleWindowChange);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleWindowChange);
      window.removeEventListener("resize", handleWindowChange);
    };
  }, [closeMenu, menuOpen]);

  const focusMenuItem = (index: number) => {
    const normalizedIndex = (index + targets.length) % targets.length;
    itemRefs.current[normalizedIndex]?.focus();
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const currentIndex = itemRefs.current.findIndex((element) => element === document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusMenuItem(currentIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusMenuItem(currentIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusMenuItem(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusMenuItem(targets.length - 1);
    } else if (event.key === "Tab") {
      closeMenu();
    }
  };

  const unavailableTooltip = project?.missing
    ? t("toolbar.missing")
    : project
      ? t("toolbar.openWith", { path: project.path, application: defaultLabel })
      : t("toolbar.selectFirst");

  return (
    <div className={`open-project-control ${menuOpen ? "menu-open" : ""}`} ref={rootRef}>
      <div className="open-project-split">
        <button
          className="open-project-main"
          type="button"
          disabled={disabled}
          aria-label={
            project
              ? t("toolbar.openProjectWith", {
                  name: project.name,
                  application: defaultLabel
                })
              : t("toolbar.selectFirst")
          }
          {...tooltipProps(unavailableTooltip, "bottom")}
          onClick={onOpenDefault}
        >
          {opening ? (
            <LoaderCircle className="spin" size={15} aria-hidden="true" />
          ) : (
            <EditorIcon editor={defaultEditor} compact />
          )}
          <span>{t("toolbar.open")}</span>
        </button>

        <button
          ref={toggleRef}
          className="open-project-toggle"
          type="button"
          disabled={disabled || targets.length === 0}
          aria-label={
            project
              ? t("toolbar.chooseApplication", { name: project.name })
              : t("toolbar.selectFirst")
          }
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => (menuOpen ? closeMenu() : openMenu())}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              openMenu(event.key === "ArrowUp" ? "last" : "first");
            }
          }}
        >
          <ChevronDown size={15} aria-hidden="true" />
        </button>
      </div>

      {menuOpen ? (
        <div
          className="open-project-menu"
          id={menuId}
          role="menu"
          aria-label={t("toolbar.openMenu")}
          onKeyDown={handleMenuKeyDown}
        >
          {targets.map((editor, index) => {
            const isDefault = sameEditor(editor, defaultEditor);
            const label = editorLabel(editor, t("toolbar.defaultEditor"), t("toolbar.finder"));

            return (
              <button
                key={`${editor.id}:${editor.appPath ?? "system"}`}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                className="open-project-menu-item"
                type="button"
                role="menuitem"
                aria-label={
                  isDefault
                    ? t("toolbar.openInDefault", { application: label })
                    : t("toolbar.openIn", { application: label })
                }
                onClick={() => {
                  closeMenu();
                  onOpenWithEditor(editor.id);
                }}
              >
                <EditorIcon editor={editor} />
                <span>{label}</span>
                {isDefault ? <Check className="open-project-default-check" size={15} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function EditorIcon({ editor, compact = false }: { editor: EditorOption | null; compact?: boolean }) {
  const iconClass = `open-project-app-icon ${compact ? "compact" : ""}`;
  if (editor?.iconDataUrl) {
    return (
      <span className={iconClass} aria-hidden="true">
        <img src={editor.iconDataUrl} alt="" />
      </span>
    );
  }

  const FallbackIcon =
    editor?.id === "system"
      ? FolderOpen
      : editor?.id === "terminal" || editor?.id === "warp"
        ? SquareTerminal
        : editor?.id === "custom"
          ? AppWindow
          : Code2;
  return (
    <span className={iconClass} data-editor-id={editor?.id ?? "auto"} aria-hidden="true">
      <FallbackIcon size={compact ? 14 : 17} />
    </span>
  );
}

function resolveDefaultEditor(editors: EditorOption[], settings: Settings) {
  const configured = editors.find(
    (editor) => editor.available && editor.id === settings.editorId
  );
  if (settings.editorId !== "auto") {
    return configured ?? editors.find((editor) => editor.id === "system") ?? null;
  }

  const automatic = configured ?? editors.find((editor) => editor.id === "auto") ?? null;
  return (
    editors.find(
      (editor) =>
        editor.available &&
        editor.id !== "auto" &&
        Boolean(editor.appPath) &&
        editor.appPath === automatic?.appPath
    ) ?? automatic
  );
}

function openTargets(editors: EditorOption[], defaultEditor: EditorOption | null) {
  const priority = (editor: EditorOption) => {
    if (sameEditor(editor, defaultEditor)) return 0;
    if (editor.id === "system") return 10;
    if (editor.id === "terminal") return 20;
    if (editor.id === "warp") return 30;
    if (editor.id === "custom") return 50;
    return 40;
  };
  const seen = new Set<string>();

  return editors
    .map((editor, index) => ({ editor, index }))
    .filter(({ editor }) => editor.available && editor.id !== "auto")
    .sort(
      (left, right) =>
        priority(left.editor) - priority(right.editor) || left.index - right.index
    )
    .map(({ editor }) => editor)
    .filter((editor) => {
      const key = editor.appPath ?? editor.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function sameEditor(left: EditorOption | null, right: EditorOption | null) {
  if (!left || !right) return false;
  return left.id === right.id || Boolean(left.appPath && left.appPath === right.appPath);
}

function editorLabel(editor: EditorOption | null, defaultLabel: string, finderLabel: string) {
  if (!editor || editor.id === "auto") return defaultLabel;
  if (editor.id === "system") return finderLabel;
  return editor.name;
}
