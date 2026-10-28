import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft, Info } from "lucide-react";
import { getMatch } from "@/lib/data";
import { consensusDeviationPct, RULES } from "@/lib/combos/generate";
import { favoriteIndex, marketMargin, normalizedProbabilities, selectionSignal } from "@/lib/odds/calc";
import { bookmakerName, fmtOdds, fmtPct, MARKET_LABEL, matchLabel, outcomeCode, outcomeLabel } from "@/lib/formatting";
import { OUTCOMES } from "@/lib/types";
import { card, Freshness, OddsDelta, TeamBadge } from "@/components/ui/bits";
import { Field } from "@/components/ui/pitch";
import { Time } from "@/components/ui/time";
import { DetailSkeleton } from "@/components/ui/skeletons";
import { AddToSlip, FollowMatch, FollowTeam } from "@/components/odds/slip-buttons";
import { OddsHistory } from "@/components/matches/odds-history";

export const metadata: Metadata = { title: "Analyse du match" };

export default function MatchPage({ params }: PageProps<"/match/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <Detail params={params} />
    </Suspense>
  );
}

const STATUS = { scheduled: "À venir", live: "En direct", finished: "Terminé" };

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { match: m, now } = await getMatch(id);
  if (!m) notFound();

  const nowD = new Date(now);
  const signals = OUTCOMES.map((o) => selectionSignal(m.h2h[o], nowD, m.confirmedAt));
  const current = signals.map((s) => s.current?.odds ?? NaN);
  const margin = marketMargin(current);
  const probs = normalizedProbabilities(current);
  const latest = signals.find((s) => s.checkedAt);
  const fav = favoriteIndex(signals.map((s) => s.current?.odds));
  const open = m.status === "scheduled";

  return (
    <article className="-mx-4 -mt-5 sm:mx-0 sm:mt-0">
      {/* Immersive header (reference A): field backdrop, floating controls, type over image */}
      <Field className="px-4 pt-4 pb-12 sm:rounded-card sm:px-6">
        <div className="flex items-center justify-between">
          <Link href="/matches" aria-label="Retour aux matchs" className="grid size-11 place-items-center rounded-full bg-white/10 backdrop-blur hover:bg-white/15">
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Link>
          <span className="text-sm font-medium">{m.competition.name}</span>
          <FollowMatch match={m} className="bg-white/10 backdrop-blur hover:bg-white/15" />
        </div>
        <div className="mt-10 text-center">
          <p className="flex items-center justify-center gap-3">
            <Time iso={m.kickoffAt} mode="time" className="text-[44px] leading-none font-semibold tracking-[-0.04em] tabular-nums" />
            <span className="h-9 w-px bg-white/25" aria-hidden="true" />
            <span className="text-left text-xs leading-tight text-hero-muted first-letter:uppercase">
              <Time iso={m.kickoffAt} mode="day" />
              <br />
              {STATUS[m.status]}
            </span>
          </p>
          <h1 className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xl font-semibold tracking-tight sm:text-2xl">
            <span className="flex flex-col items-center gap-2">
              <TeamBadge team={m.home} size="lg" onHero />
              {m.home.name}
            </span>
            {m.status === "finished" && m.homeScore != null && m.awayScore != null ? (
              <span className="text-[34px] font-semibold tabular-nums" aria-label={`Score final ${m.homeScore} à ${m.awayScore}`}>
                {m.homeScore} – {m.awayScore}
              </span>
            ) : (
              <span className="text-hero-muted" aria-label="contre">–</span>
            )}
            <span className="flex flex-col items-center gap-2">
              <TeamBadge team={m.away} size="lg" onHero />
              {m.away.name}
            </span>
          </h1>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <FollowTeam team={{ id: m.home.id, name: m.home.name }} />
            <FollowTeam team={{ id: m.away.id, name: m.away.name }} />
          </div>
        </div>
      </Field>

      {/* Content sheet overlapping the header (reference B detail screen) */}
      <div className="relative -mt-6 space-y-4 rounded-t-card bg-bg px-4 pt-5 sm:px-0">
        <section className={`${card} night p-4 sm:p-5`} aria-labelledby="odds-title">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h2 id="odds-title" className="font-semibold">Cotes observées</h2>
            <span className="text-xs text-muted">{bookmakerName(m.bookmaker)}</span>
          </div>
          <p className="mb-4 text-xs text-muted">{MARKET_LABEL}. Faits observés, sans interprétation.</p>
          <ul className="grid gap-2 sm:grid-cols-3">
            {OUTCOMES.map((o, i) => {
              const s = signals[i];
              return (
                <li key={o} className="flex items-center gap-3 rounded-[16px] border border-line bg-bg p-3 sm:flex-col sm:items-stretch">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <span className={`grid size-5 shrink-0 place-items-center rounded-md text-[11px] font-bold ${i === fav ? "bg-accent text-accent-ink" : "bg-surface-2"}`}>
                        {outcomeCode[o]}
                      </span>
                      <span className="truncate">{outcomeLabel(m, o)}</span>
                      {i === fav && (
                        <span title="Cote la plus basse : l'issue que le marché juge la plus probable" className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-accent-ink">
                          Favori
                        </span>
                      )}
                    </p>
                    <p className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-semibold tabular-nums">{s.current ? fmtOdds(s.current.odds) : "–"}</span>
                      <OddsDelta changePct={s.changePct} />
                    </p>
                    <p className="mt-1 text-xs text-muted tabular-nums">
                      Implicite {s.current ? fmtPct(100 / s.current.odds) : "–"}
                      {probs && <>, sans marge {fmtPct(probs[i] * 100)}</>}
                    </p>
                  </div>
                  {open && s.current && (
                    <span className="sm:hidden">
                    <AddToSlip
                      compact
                      leg={{ matchId: m.id, market: "h2h", outcome: o, odds: s.current.odds, observedAt: s.current.observedAt, label: outcomeLabel(m, o), matchLabel: matchLabel(m) }}
                    />
                    </span>
                  )}
                  {open && s.current && (
                    <span className="hidden sm:block">
                    <AddToSlip
                      className="w-full"
                      leg={{ matchId: m.id, market: "h2h", outcome: o, odds: s.current.odds, observedAt: s.current.observedAt, label: outcomeLabel(m, o), matchLabel: matchLabel(m) }}
                    />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            {latest && <Freshness iso={latest.checkedAt!} ageHours={latest.ageHours} />}
            {margin !== null && <span className="tabular-nums">Marge du bookmaker {fmtPct(margin * 100)}</span>}
          </div>
          <p className="mt-3 flex gap-2 text-xs leading-relaxed text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            La probabilité implicite (1/cote) inclut la marge du bookmaker. La version « sans marge » la répartit proportionnellement : c&apos;est une lecture du marché, pas la probabilité réelle.
          </p>
        </section>

        <section className={`${card} night p-4 sm:p-5`} aria-labelledby="hist-title">
          <h2 id="hist-title" className="font-semibold">Évolution de la cote</h2>
          <p className="mb-4 text-xs text-muted">
            Depuis la première observation Vestra, qui n&apos;est pas la cote d&apos;ouverture du marché.
          </p>
          <OddsHistory match={m} />
        </section>

        <section className="rounded-card border border-dashed border-line p-4 sm:p-5" aria-labelledby="algo-title">
          <h2 id="algo-title" className="font-semibold">Lecture algorithmique</h2>
          <p className="mb-3 text-xs text-muted">Interprétation automatique, à distinguer des faits ci-dessus.</p>
          <ul className="space-y-2 text-sm leading-relaxed">
            {OUTCOMES.map((o, i) => {
              const s = signals[i];
              if (s.dropPct === null) return <li key={o}>{outcomeLabel(m, o)} : historique insuffisant pour mesurer un mouvement.</li>;
              const dev = s.current ? consensusDeviationPct(m, o, s.current.odds) : null;
              const offMarket = dev !== null && dev > RULES.maxConsensusDeviationPct;
              const passes = s.dropPct >= RULES.minDropPct && s.dropPct <= RULES.maxDropPct && !s.stale && !offMarket && open;
              return (
                <li key={o}>
                  {outcomeLabel(m, o)} : {s.dropPct > 0 ? `baisse de ${fmtPct(s.dropPct)}` : `hausse de ${fmtPct(-s.dropPct)}`} sur {s.observations} observations.{" "}
                  {passes
                    ? `Au-dessus du seuil de ${RULES.minDropPct} % : admissible pour les combinés.`
                    : s.stale
                      ? "Données trop anciennes pour être utilisées."
                      : offMarket
                        ? `Écart de ${fmtPct(dev!)} avec la cote médiane des bookmakers : non retenue.`
                        : s.dropPct > RULES.maxDropPct
                          ? "Variation trop forte pour être fiable : non retenue."
                      : `Sous le seuil de ${RULES.minDropPct} % : non retenue.`}
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Une baisse de cote peut venir de nouvelles informations, d&apos;un ajustement du modèle du bookmaker, d&apos;une faible liquidité ou d&apos;un changement de marge. Elle ne prouve pas l&apos;existence d&apos;« argent avisé ». Probabilité modèle et score de confiance : non calculés, aucun modèle n&apos;est encore validé.
          </p>
        </section>

        <section className={`${card} night p-4 sm:p-5`} aria-labelledby="stats-title">
          <h2 id="stats-title" className="font-semibold">Statistiques</h2>
          <p className="mt-1 text-sm text-muted">
            Aucune statistique d&apos;équipe n&apos;est encore connectée. Le classement et la forme récente viendront de football-data.org.
          </p>
        </section>

        <p className="pb-2 text-center text-xs text-muted">
          Dernière synchronisation <Time iso={m.lastSyncedAt} mode="relative" />
        </p>
      </div>
    </article>
  );
}
