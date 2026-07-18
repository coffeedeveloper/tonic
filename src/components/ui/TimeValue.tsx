import type { TooltipPropsFactory } from "./Tooltip";
import { formatAbsoluteTime, formatRelativeTime } from "../../utils/format";
import { useI18n } from "../../i18n";

export function TimeValue({
  value,
  now,
  tooltipProps
}: {
  value: string;
  now: number;
  tooltipProps: TooltipPropsFactory;
}) {
  const { language } = useI18n();
  return (
    <time
      dateTime={value}
      tabIndex={0}
      {...tooltipProps(formatAbsoluteTime(value, language), "top")}
    >
      {formatRelativeTime(value, now, language)}
    </time>
  );
}
