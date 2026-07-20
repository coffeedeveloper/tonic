import { LoaderCircle, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import { useI18n } from "../i18n";
import type { AppLanguage, AppTheme, EditorOption, Settings } from "../types";
import { errorMessage } from "../utils/format";

function applicationName(appPath: string | null) {
  if (!appPath) {
    return "";
  }

  const filename = appPath.split("/").at(-1) ?? appPath;
  return filename.replace(/\.app$/i, "");
}

export function SettingsModal({
  settings,
  editors,
  onClose,
  onSave,
  onChooseCustomEditor
}: {
  settings: Settings;
  editors: EditorOption[];
  onClose: () => void;
  onSave: (settings: Settings) => Promise<void>;
  onChooseCustomEditor: () => Promise<EditorOption | null>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [choosingCustomEditor, setChoosingCustomEditor] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [draftCustomOption, setDraftCustomOption] = useState<EditorOption | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const availableEditors = useMemo(
    () => editors.filter((editor) => editor.available && editor.id !== "custom"),
    [editors]
  );
  const customOption = draftCustomOption ?? editors.find((editor) => editor.id === "custom");
  const customEditorPath = draft.customEditorPath ?? customOption?.appPath ?? null;
  const customEditorName = customOption?.name ?? applicationName(customEditorPath);
  const editorName = (editor: EditorOption) => {
    if (editor.id === "auto") {
      const detectedName = applicationName(editor.appPath);
      return detectedName
        ? t("settings.autoEditor", { name: detectedName })
        : t("settings.autoDetect");
    }
    return editor.id === "system" ? t("settings.systemEditor") : editor.name;
  };

  useEffect(() => {
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !saving && !choosingCustomEditor) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "Tab") {
        const modal = closeButtonRef.current?.closest<HTMLElement>(".settings-modal");
        const focusable = Array.from(
          modal?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'
          ) ?? []
        ).filter((element) => !element.hasAttribute("hidden"));
        const first = focusable[0];
        const last = focusable.at(-1);

        if (first && last && event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (first && last && !event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [choosingCustomEditor, onClose, saving]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaveError("");

    try {
      await onSave(draft);
      onClose();
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleChooseCustomEditor() {
    setChoosingCustomEditor(true);
    setSaveError("");

    try {
      const editor = await onChooseCustomEditor();
      if (editor?.appPath) {
        setDraftCustomOption(editor);
        setDraft((current) => ({
          ...current,
          editorId: "custom",
          customEditorPath: editor.appPath
        }));
      }
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      setChoosingCustomEditor(false);
    }
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !saving && !choosingCustomEditor) {
      onClose();
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={handleBackdropClick}>
      <form
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onSubmit={handleSubmit}
      >
        <header className="modal-header">
          <div>
            <h2 id="settings-title">{t("settings.title")}</h2>
            <p>{t("settings.description")}</p>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-button"
            type="button"
            aria-label={t("settings.close")}
            disabled={saving || choosingCustomEditor}
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="settings-content">
          <section className="settings-section">
            <div className="settings-heading">
              <h3>{t("settings.general")}</h3>
            </div>

            <div className="settings-general-grid">
              <label className="settings-field">
                <span>{t("settings.language")}</span>
                <select
                  className="settings-select"
                  value={draft.language}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      language: event.target.value as AppLanguage
                    }))
                  }
                >
                  <option value="en">{t("settings.english")}</option>
                  <option value="zh">{t("settings.chinese")}</option>
                </select>
                <small>{t("settings.languageHint")}</small>
              </label>

              <label className="settings-field">
                <span>{t("settings.theme")}</span>
                <select
                  className="settings-select"
                  value={draft.theme}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      theme: event.target.value as AppTheme
                    }))
                  }
                >
                  <option value="system">{t("settings.themeSystem")}</option>
                  <option value="light">{t("settings.themeLight")}</option>
                  <option value="dark">{t("settings.themeDark")}</option>
                </select>
                <small>{t("settings.themeHint")}</small>
              </label>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-heading">
              <h3>{t("settings.editor")}</h3>
              <p>{t("settings.editorHint")}</p>
            </div>

            <div className="editor-choice-group">
              <label className="editor-select-field">
                <span className="sr-only">{t("settings.editorAria")}</span>
                <select
                  className="settings-select"
                  value={draft.editorId}
                  onChange={(event) => {
                    const editorId = event.target.value;
                    setDraft((current) => ({
                      ...current,
                      editorId,
                      customEditorPath:
                        editorId === "custom" ? customEditorPath : current.customEditorPath
                    }));
                  }}
                >
                  {availableEditors.map((editor) => (
                    <option key={editor.id} value={editor.id}>
                      {editorName(editor)}
                    </option>
                  ))}
                  {customEditorPath ? (
                    <option value="custom">
                      {t("settings.customEditor")} · {customEditorName}
                    </option>
                  ) : null}
                </select>
              </label>

              <div className="custom-editor-row">
                <span className="custom-editor-copy">
                  <strong>{customEditorName || t("settings.customEditor")}</strong>
                  <span>{customEditorPath || t("settings.customEditorHint")}</span>
                </span>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={saving || choosingCustomEditor}
                  onClick={() => void handleChooseCustomEditor()}
                >
                  {choosingCustomEditor ? (
                    <LoaderCircle className="spin" size={14} aria-hidden="true" />
                  ) : null}
                  {customEditorPath ? t("settings.changeEditor") : t("settings.chooseEditor")}
                </button>
              </div>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-heading">
              <h3>{t("settings.agentCommands")}</h3>
            </div>

            <label className="toggle-setting">
              <span>
                <strong>{t("settings.yoloMode")}</strong>
                <small>{t("settings.yoloModeHint")}</small>
              </span>
              <input
                type="checkbox"
                checked={draft.yoloMode}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    yoloMode: event.target.checked
                  }))
                }
              />
              <span className="switch" aria-hidden="true" />
            </label>
          </section>

          <section className="settings-section">
            <label className="toggle-setting">
              <span>
                <strong>{t("settings.login")}</strong>
                <small>{t("settings.loginHint")}</small>
              </span>
              <input
                type="checkbox"
                checked={draft.launchAtLogin}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    launchAtLogin: event.target.checked
                  }))
                }
              />
              <span className="switch" aria-hidden="true" />
            </label>
          </section>

          {saveError ? (
            <p className="settings-error" role="alert">
              {saveError}
            </p>
          ) : null}
        </div>

        <footer className="modal-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={saving || choosingCustomEditor}
            onClick={onClose}
          >
            {t("settings.cancel")}
          </button>
          <button className="primary-button" type="submit" disabled={saving || choosingCustomEditor}>
            {saving ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : null}
            {saving ? t("settings.saving") : t("settings.save")}
          </button>
        </footer>
      </form>
    </div>
  );
}
