import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter, Lora } from "next/font/google";
import { ThemeSync } from "@/components/ThemeSync";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${lora.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Blocking inline script: runs before first paint to apply the correct
            dark/light class from the theme cookie — eliminates flash of
            unstyled content (FOUC) for "system" preference users on dark OS.
            This is the sole driver of first-paint theming; the server layout no
            longer reads the preference (which would force the whole tree to be
            request-time/dynamic under Cache Components). */}
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=document.cookie.match(/(?:^|;\\s*)theme=([^;]+)/);var t=c?c[1]:'system';if(t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col font-serif text-lg leading-relaxed">
        {/* Request-time theme reconciliation, isolated behind Suspense so the
            static shell can prerender. Renders no visible UI. */}
        <Suspense fallback={null}>
          <ThemeSync />
        </Suspense>
        {children}
      </body>
    </html>
  );
}

