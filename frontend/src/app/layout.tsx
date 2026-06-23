import type { Metadata, Viewport } from "next";
import { Inter, Lora } from "next/font/google";
import { getThemePreference } from "@/app/actions/user";
import { ThemeController } from "@/components/ThemeController";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const lora = Lora({
  variable: "--font-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Recipes Repository",
  description: "Your personal recipe collection",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const theme = await getThemePreference();
  // Apply dark class server-side for explicit "dark" to avoid FOUC.
  // "light" and "system" start classless; ThemeController reconciles on the client.
  const initialClass = theme === "dark" ? "dark" : "";

  return (
    <html
      lang="en"
      className={`${inter.variable} ${lora.variable} ${initialClass} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Blocking inline script: runs before first paint to apply the correct
            dark/light class from the theme cookie — eliminates flash of
            unstyled content (FOUC) for "system" preference users on dark OS. */}
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=document.cookie.match(/(?:^|;\\s*)theme=([^;]+)/);var t=c?c[1]:'system';if(t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col font-serif text-lg leading-relaxed">
        <ThemeController theme={theme} />
        {children}
      </body>
    </html>
  );
}
