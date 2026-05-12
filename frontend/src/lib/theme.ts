/**
 * Applies the given theme preference to the document root by toggling the
 * `dark` class on `<html>`. Safe to call on the server (no-ops).
 *
 * "dark"   → add `dark`
 * "light"  → remove `dark`
 * "system" → follow `prefers-color-scheme`
 */
export function applyTheme(theme: string): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "light") {
    root.classList.remove("dark");
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", prefersDark);
  }
}
