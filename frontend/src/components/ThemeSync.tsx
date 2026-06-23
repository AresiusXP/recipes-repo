import { getThemePreference } from "@/app/actions/user";
import { ThemeController } from "@/components/ThemeController";

/**
 * Dynamic, request-time theme reconciliation.
 *
 * Reads the user's saved theme preference from the backend (request-time,
 * cookie-dependent) and hands it to the client `ThemeController`, which applies
 * it and refreshes the `theme` cookie.
 *
 * This is intentionally isolated in its own async server component so it can be
 * wrapped in <Suspense> by the root layout. Under Cache Components, request-time
 * data access (cookies/headers) must live inside a Suspense boundary; keeping it
 * here lets the rest of the layout shell stay static. First-paint theming is
 * already handled by the blocking inline script in <head> (reads the cookie),
 * so this component contributes no visible UI and renders nothing.
 */
export async function ThemeSync() {
  const theme = await getThemePreference();
  return <ThemeController theme={theme} />;
}
