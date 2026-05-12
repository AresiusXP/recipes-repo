"use client";

import { useEffect } from "react";
import { applyTheme } from "@/lib/theme";

interface ThemeControllerProps {
  /** The saved preference from the database: "light" | "dark" | "system" */
  theme: string;
}

export function ThemeController({ theme }: ThemeControllerProps) {
  useEffect(() => {
    applyTheme(theme);

    // When in system mode, react to OS theme changes in real time
    if (theme !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle("dark", e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  // Renders nothing — purely a side-effect component
  return null;
}
