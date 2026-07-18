import { AlertCircle, Check, FolderOpen, LoaderCircle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "../../i18n";

export function LoadingState({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="status-state" role="status">
      <LoaderCircle className="spin" size={20} aria-hidden="true" />
      <span>{label ?? t("feedback.loading")}</span>
    </div>
  );
}

export function ErrorState({
  title,
  message,
  onRetry
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="status-state error-state" role="alert">
      <AlertCircle size={21} aria-hidden="true" />
      <strong>{title ?? t("feedback.error")}</strong>
      <span>{message}</span>
      {onRetry ? (
        <button className="secondary-button" type="button" onClick={onRetry}>
          <RefreshCw size={14} aria-hidden="true" />
          {t("feedback.retry")}
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="status-state empty-state">
      <div className="empty-state-icon" aria-hidden="true">
        <FolderOpen size={20} />
      </div>
      <strong>{title}</strong>
      <span>{description}</span>
      {action}
    </div>
  );
}

export type ToastMessage = {
  id: number;
  tone: "success" | "error" | "info";
  message: string;
};

export function Toast({ toast }: { toast: ToastMessage | null }) {
  if (!toast) {
    return null;
  }

  return (
    <div className={`toast ${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}>
      {toast.tone === "success" ? (
        <Check size={15} aria-hidden="true" />
      ) : toast.tone === "error" ? (
        <AlertCircle size={15} aria-hidden="true" />
      ) : null}
      <span>{toast.message}</span>
    </div>
  );
}
