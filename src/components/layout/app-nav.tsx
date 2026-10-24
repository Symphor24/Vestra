"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, House, Layers, Star, UserRound } from "lucide-react";
import { Logo } from "@/components/ui/logo";

const ITEMS = [
  { href: "/", label: "Accueil", icon: House },
  { href: "/matches", label: "Matchs", icon: CalendarDays },
  { href: "/combos", label: "Combinés", icon: Layers },
  { href: "/favorites", label: "Favoris", icon: Star },
  { href: "/profile", label: "Profil", icon: UserRound },
];

const isActive = (path: string, href: string) =>
  href === "/" ? path === "/" : path.startsWith(href) || (href === "/matches" && path.startsWith("/match/"));

export function AppNav({ demo }: { demo: boolean }) {
  return <NavView demo={demo} path={usePathname()} />;
}

/** Pure view so the layout can render it as the Suspense fallback (no active tab) during prerender. */
export function NavView({ demo, path }: { demo: boolean; path: string }) {
  return (
    <>
      {/* Mobile / tablet: floating bottom bar */}
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto max-w-md rounded-[26px] border border-line bg-surface/95 p-1.5 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.45)] backdrop-blur lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(path, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-[20px] text-[11px] font-medium transition-colors duration-200 ${
                    active ? "bg-accent text-accent-ink" : "text-muted hover:text-text"
                  }`}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.3 : 1.8} aria-hidden="true" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Desktop: sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
        <Link href="/" className="mb-8 px-2" aria-label="Vestra, accueil">
          <Logo />
        </Link>
        <nav aria-label="Navigation principale">
          <ul className="space-y-1">
            {ITEMS.map(({ href, label, icon: Icon }) => {
              const active = isActive(path, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-btn px-3 text-sm font-medium transition-colors duration-150 ${
                      active ? "bg-accent text-accent-ink" : "text-muted hover:bg-surface-2 hover:text-text"
                    }`}
                  >
                    <Icon className="size-[18px]" aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <p className="mt-auto px-2 text-xs leading-relaxed text-muted">
          {demo ? "Prototype : données fictives." : "Cotes actualisées plusieurs fois par jour, pas en temps réel."}{" "}
          <Link href="/about" className="underline underline-offset-2 hover:text-text">
            Méthodologie
          </Link>
        </p>
      </aside>
    </>
  );
}
