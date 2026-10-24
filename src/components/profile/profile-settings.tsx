"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import { BookOpen, ChevronRight, Database, HeartHandshake, Lock, Monitor, Moon, Sun } from "lucide-react";
import { clearLocalData, toast, useFavoriteCompetitions, useIsClient, useTheme, useTimeZone, type Theme } from "@/lib/store";
import type { Competition } from "@/lib/types";
import { card } from "@/components/ui/bits";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { replayOnboarding } from "@/components/layout/onboarding";

const LINKS: [string, string, LucideIcon][] = [
  ["/about#sources", "Sources des données", Database],
  ["/about#methodologie", "Méthodologie des analyses", BookOpen],
  ["/about#confidentialite", "Confidentialité", Lock],
  ["/about#jeu-responsable", "Jeu responsable", HeartHandshake],
];

const THEMES: [Theme, string, LucideIcon][] = [["system", "Système", Monitor], ["light", "Clair", Sun], ["dark", "Sombre", Moon]];

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`${card} p-4 sm:p-5`}>
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function ProfileSettings({ competitions }: { competitions: Competition[] }) {
  const [theme, setTheme] = useTheme();
  const [tz, setTz] = useTimeZone();
  const [comps, setComps] = useFavoriteCompetitions();
  const isClient = useIsClient();
  const zones = useMemo(() => (isClient ? Intl.supportedValuesOf("timeZone") : []), [isClient]);
  const browserTz = isClient ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";

  useEffect(() => {
    const d = document.documentElement;
    if (theme === "system") delete d.dataset.theme;
    else d.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <div className="space-y-4">
        <Group title="Affichage">
          <div role="radiogroup" aria-label="Thème" className="grid grid-cols-3 gap-2">
            {THEMES.map(([v, l, Icon]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={theme === v}
                onClick={() => setTheme(v)}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-[14px] border text-sm font-medium transition-colors duration-150 ${
                  theme === v ? "border-text bg-surface-2" : "border-line text-muted hover:text-text"
                }`}
              >
                <Icon className="size-[18px]" aria-hidden="true" />
                {l}
              </button>
            ))}
          </div>
          <label htmlFor="tz" className="mt-4 mb-1.5 block text-sm font-medium">Fuseau horaire</label>
          <select id="tz" value={tz} onChange={(e) => setTz(e.target.value)} className="min-h-11 w-full rounded-[12px] border border-line bg-surface-2 px-3 text-sm">
            <option value="">Celui de l&apos;appareil{browserTz ? ` (${browserTz})` : ""}</option>
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </Group>

        <Group title="Compétitions favorites">
          <p className="-mt-1 mb-3 text-sm text-muted">Elles apparaissent comme filtre rapide sur la page Matchs.</p>
          <div className="flex flex-wrap gap-2">
            {competitions.map((c) => {
              const on = comps.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setComps((xs) => (on ? xs.filter((x) => x !== c.id) : [...xs, c.id]))}
                  className={`min-h-10 rounded-full border px-4 text-sm font-medium transition-colors duration-150 ${on ? "border-transparent bg-text text-bg" : "border-line text-muted hover:text-text"}`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </Group>

        <Group title="Notifications et compte">
          <p className="text-sm text-muted">
            Les notifications ne sont pas encore disponibles. Aucun compte n&apos;est nécessaire : vos favoris et votre ticket restent dans ce navigateur et ne sont jamais envoyés à nos serveurs.
          </p>
        </Group>
      </div>

      <div className="space-y-4">
        <nav className={`${card} divide-y divide-line overflow-hidden`} aria-label="Informations">
          {LINKS.map(([href, label, Icon]) => (
            <Link key={href} href={href} className="flex min-h-14 items-center gap-3 px-4 text-sm font-medium hover:bg-surface-2">
              <Icon className="size-[18px] text-muted" aria-hidden="true" />
              <span className="flex-1">{label}</span>
              <ChevronRight className="size-4 text-muted" aria-hidden="true" />
            </Link>
          ))}
        </nav>

        <Group title="Cet appareil">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { replayOnboarding(); window.scrollTo(0, 0); }}
              className="min-h-11 rounded-btn bg-surface-2 px-4 text-sm font-semibold hover:bg-line"
            >
              Revoir l&apos;introduction
            </button>
            <ConfirmButton onConfirm={() => { clearLocalData(); toast("Données locales effacées"); }} confirmLabel="Tout effacer ?">
              Effacer mes données locales
            </ConfirmButton>
          </div>
        </Group>
      </div>
    </div>
  );
}
