import { useEffect } from "react";
import type { AppTheme } from "../types";

const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

export function useAppTheme(theme: AppTheme) {
  useEffect(() => {
    const media = window.matchMedia(DARK_MODE_QUERY);

    const applyTheme = () => {
      const resolvedTheme = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.dataset.themePreference = theme;
      document.documentElement.style.colorScheme = resolvedTheme;
    };

    applyTheme();
    if (theme !== "system") {
      return undefined;
    }

    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);
}
