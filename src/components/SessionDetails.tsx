import { useI18n } from "../i18n";
import type { SessionRecord } from "../types";
import { formatTokenUsage, formatUsdCost } from "../utils/format";

export function SessionDetails({
  id,
  session,
  title
}: {
  id: string;
  session: SessionRecord;
  title: string;
}) {
  const { language, t } = useI18n();
  const environmentItems = [
    session.workingDirectory
      ? {
          label: t("session.workingDirectory"),
          value: session.workingDirectory,
          technical: true,
          wide: true
        }
      : null,
    session.worktreePath && session.worktreePath !== session.workingDirectory
      ? {
          label: t("session.worktree"),
          value: session.worktreePath,
          technical: true,
          wide: true
        }
      : null,
    session.source
      ? {
          label: t("session.source"),
          value: sourceLabel(session.source),
          technical: false,
          wide: false
        }
      : null,
    session.permissionMode
      ? {
          label: t("session.permissionMode"),
          value: session.permissionMode,
          technical: true,
          wide: false
        }
      : null,
    session.sandboxMode
      ? {
          label: t("session.sandboxMode"),
          value: session.sandboxMode,
          technical: true,
          wide: false
        }
      : null,
    session.cliVersion
      ? {
          label: t("session.cliVersion"),
          value: session.cliVersion,
          technical: true,
          wide: false
        }
      : null
  ].filter((item) => item !== null);
  const breakdown = session.tokenBreakdown;
  const tokenItems = breakdown
    ? [
        { label: t("session.tokenInput"), value: breakdown.input },
        { label: t("session.tokenOutput"), value: breakdown.output },
        { label: t("session.tokenCacheRead"), value: breakdown.cacheRead },
        { label: t("session.tokenCacheWrite"), value: breakdown.cacheWrite },
        { label: t("session.tokenReasoning"), value: breakdown.reasoning }
      ].filter((item) => item.value !== null)
    : [];

  return (
    <section
      className="session-detail-panel"
      id={id}
      role="region"
      aria-label={t("session.detailsFor", { name: title })}
    >
      {environmentItems.length ? (
        <dl className="session-detail-grid">
          {environmentItems.map((item) => (
            <div
              className={`session-detail-item ${item.wide ? "wide" : ""}`}
              key={item.label}
            >
              <dt>{item.label}</dt>
              <dd>{item.technical ? <code>{item.value}</code> : item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {tokenItems.length ? (
        <div className="session-token-details">
          <p className="session-token-heading">{t("session.tokenBreakdown")}</p>
          {session.agent === "codex" ? (
            <p className="session-token-hint">
              {t("session.tokenBreakdownCodexHint")}
            </p>
          ) : null}
          {session.estimatedCostUsd !== null ? (
            <p className="session-token-hint">{t("session.costEstimateHint")}</p>
          ) : null}
          <dl className="session-token-grid">
            {tokenItems.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{formatTokenUsage(item.value, language)}</dd>
              </div>
            ))}
            {session.estimatedCostUsd !== null ? (
              <div>
                <dt>{t("session.estimatedCost")}</dt>
                <dd>{formatUsdCost(session.estimatedCostUsd, language)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}
    </section>
  );

  function sourceLabel(source: string) {
    if (source === "cli") return t("session.sourceCli");
    if (source === "desktop") return t("session.sourceDesktop");
    if (source === "ide") return t("session.sourceIde");
    if (source === "exec") return t("session.sourceExec");
    return source;
  }
}
