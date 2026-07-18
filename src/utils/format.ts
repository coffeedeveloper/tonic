import type { AppLanguage } from "../types";

const relativeTime = {
  en: new Intl.RelativeTimeFormat("en", { numeric: "auto" }),
  zh: new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" })
};
const numberFormat = {
  en: new Intl.NumberFormat("en-US"),
  zh: new Intl.NumberFormat("zh-CN")
};

const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["week", 7 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
  ["second", 1]
];

function parsedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatRelativeTime(
  value: string,
  now = Date.now(),
  language: AppLanguage = "en"
) {
  const date = parsedDate(value);
  if (!date) {
    return language === "zh" ? "未知" : "Unknown";
  }

  const seconds = (date.getTime() - now) / 1000;
  const absoluteSeconds = Math.abs(seconds);
  const [unit, unitSeconds] =
    units.find(([, threshold]) => absoluteSeconds >= threshold) ?? units[units.length - 1];

  return relativeTime[language].format(Math.round(seconds / unitSeconds), unit);
}

export function formatAbsoluteTime(value: string, language: AppLanguage = "en") {
  const date = parsedDate(value);
  if (!date) {
    return language === "zh" ? "未知时间" : "Unknown time";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part(
    "minute"
  )}:${part("second")}`;
}

export function formatTokenUsage(value: number | null, language: AppLanguage = "en") {
  return value === null
    ? language === "zh"
      ? "未报告"
      : "Not reported"
    : `${numberFormat[language].format(value)} tokens`;
}

export function formatCount(value: number, language: AppLanguage = "en") {
  return numberFormat[language].format(value);
}

export function shortHash(value: string) {
  return value.slice(0, 8);
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
