import { Navbar } from "@/components/Navbar";

type MaxWidth = "4xl" | "6xl";

const MAX_WIDTH_CLASS: Record<MaxWidth, string> = {
  "4xl": "max-w-4xl",
  "6xl": "max-w-6xl",
};

interface SectionShellProps {
  children: React.ReactNode;
  /** Container max-width. Defaults to 4xl (used by recipes/settings/notifications). */
  maxWidth?: MaxWidth;
}

/**
 * Shared section layout: Navbar + a centered <main>. Used by every
 * authenticated section (recipes, settings, notifications, admin) so padding
 * and structure stay consistent in one place instead of being duplicated
 * across near-identical layout.tsx files.
 */
export function SectionShell({ children, maxWidth = "4xl" }: SectionShellProps) {
  return (
    <>
      <Navbar />
      <main
        id="main-content"
        className={`mx-auto w-full ${MAX_WIDTH_CLASS[maxWidth]} flex-1 px-4 py-8 sm:py-12`}
      >
        {children}
      </main>
    </>
  );
}
