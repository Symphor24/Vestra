import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Suspense } from "react";
import { AppNav, NavView } from "@/components/layout/app-nav";
import { Onboarding } from "@/components/layout/onboarding";
import { SlipBar } from "@/components/layout/slip-bar";
import { Toaster } from "@/components/layout/toaster";
import { DATA_SOURCE } from "@/lib/data";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Vestra", template: "%s · Vestra" },
  description: "Analyse des matchs de football, mouvements de cotes et combinés expliqués.",
};

export const viewport: Viewport = {
  themeColor: "#0B1220",
  viewportFit: "cover",
};

// Runs before paint: applies the saved theme and hides onboarding for returning visitors.
const HEAD_SCRIPT = `try{var d=document.documentElement,t=JSON.parse(localStorage.getItem("vestra-theme")||'"system"');if(t==="light"||t==="dark")d.dataset.theme=t;if(localStorage.getItem("vestra-onboarded"))d.dataset.onboarded="1"}catch(e){document.documentElement.dataset.onboarded="1"}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  const demo = DATA_SOURCE === "demo";
  return (
    <html lang="fr" className={`${geist.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: HEAD_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-btn focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink">
          Aller au contenu
        </a>
        <Suspense fallback={<NavView demo={demo} path="" />}>
          <AppNav demo={demo} />
        </Suspense>
        <div className="lg:pl-64">
          {demo && (
            <p className="flex items-center justify-center gap-2 border-b border-warn/30 bg-warn/10 px-4 py-2 text-center text-xs font-medium text-warn">
              <span className="size-1.5 rounded-full bg-warn" aria-hidden="true" />
              Démonstration : matchs et cotes fictifs, aucune donnée réelle.
            </p>
          )}
          <main id="main" className="mx-auto w-full max-w-5xl px-4 pt-5 pb-44 sm:px-6 lg:px-10 lg:pt-8 lg:pb-16">
            {children}
          </main>
        </div>
        <Suspense>
          <SlipBar />
        </Suspense>
        <Toaster />
        <Onboarding />
      </body>
    </html>
  );
}
