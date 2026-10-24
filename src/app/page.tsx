import Link from "next/link";
import { Suspense } from "react";
import { ArrowUpRight, Layers, SearchX } from "lucide-react";
import { getDashboard } from "@/lib/data";
import { ageHours, STALE_AFTER_HOURS } from "@/lib/odds/calc";
import { PickCard } from "@/components/dashboard/pick-card";
import { TicketCard } from "@/components/combos/ticket-card";
import { card, EmptyState, SectionTitle, TeamBadge } from "@/components/ui/bits";
import { Logo } from "@/components/ui/logo";
import { Field } from "@/components/ui/pitch";
import { Time } from "@/components/ui/time";
import { DashboardSkeleton } from "@/components/ui/skeletons";

export default function Home() {
  return (
    <>
      <header className="mb-6 flex items-center justify-between lg:hidden">
        <Logo />
        <Link href="/profile" aria-label="Profil et paramètres" className="grid size-11 place-items-center rounded-full border border-line bg-surface text-sm font-semibold">
          V
        </Link>
      </header>
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </>
  );
}

async function Dashboard() {
  const { now, matches, stats, tickets, picks } = await getDashboard();
  const next = matches
    .filter((m) => m.status === "scheduled" && m.kickoffAt > now)
    .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt))[0];

  return (
    <div className="space-y-9">
      <section>
        <p className="text-sm text-muted first-letter:uppercase">
          <Time iso={now} mode="day" />
        </p>
        <h1 className="mt-1 text-[28px] leading-tight font-semibold tracking-[-0.03em] lg:text-[32px]">Votre analyse du jour</h1>
        <p className="mt-1.5 text-[15px] text-muted">
          {stats.analysed} matchs à venir suivis, {picks.length} sélection{picks.length > 1 ? "s" : ""} répond{picks.length > 1 ? "ent" : ""} à nos critères.
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-[1.15fr_1fr]">
        {next && (
          <Link href={`/match/${next.id}`} className="group block overflow-hidden rounded-card">
            <Field className="flex h-full min-h-44 flex-col justify-between p-5">
              <div className="flex items-center justify-between text-xs text-hero-muted">
                <span>Prochain coup d&apos;envoi suivi</span>
                <ArrowUpRight className="size-5 text-hero-text transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <Time iso={next.kickoffAt} mode="time" className="text-[40px] leading-none font-semibold tracking-[-0.04em] tabular-nums" />
                  <span className="h-8 w-px bg-white/20" aria-hidden="true" />
                  <span className="text-xs leading-tight text-hero-muted">
                    {next.competition.name}
                    <br />
                    <Time iso={next.kickoffAt} mode="day" />
                  </span>
                </div>
                <p className="mt-3 flex items-center gap-2 text-lg font-semibold">
                  <TeamBadge team={next.home} size="sm" onHero /> {next.home.name}
                  <span className="text-hero-muted">–</span>
                  {next.away.name} <TeamBadge team={next.away} size="sm" onHero />
                </p>
              </div>
            </Field>
          </Link>
        )}
        <dl className={`${card} grid grid-cols-2 gap-px overflow-hidden bg-line p-0`}>
          {[
            ["Matchs analysés", stats.analysed],
            ["Mouvements ≥ 5 %", stats.movements],
            ["Combinés proposés", tickets.length],
          ].map(([label, value]) => (
            <div key={label} className="bg-surface p-4">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
          <div className="bg-surface p-4">
            <dt className="text-xs text-muted">Dernière mise à jour</dt>
            <dd className="mt-1.5 text-sm font-semibold">
              {stats.lastSync ? <Time iso={stats.lastSync} mode="relative" /> : "Aucune"}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="picks-title">
        <SectionTitle action={<Link href="/matches" className="text-sm font-medium text-muted hover:text-text">Tous les matchs</Link>}>
          <span id="picks-title">Sélection du jour</span>
        </SectionTitle>
        <p className="-mt-1 mb-4 max-w-prose text-sm text-muted">
          Cotes en baisse d&apos;au moins 10 % depuis notre première observation. C&apos;est un signal descriptif du marché, pas une prédiction.
        </p>
        {picks.length ? (
          <div className="no-scrollbar relative -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-3">
            {picks.map((p) => (
              <PickCard key={p.match.id} pick={p} now={now} />
            ))}
          </div>
        ) : (
          <EmptyState icon={SearchX} title="Aucune sélection ne répond actuellement à nos critères.">
            Revenez lors de la prochaine actualisation.
          </EmptyState>
        )}
      </section>

      <section aria-labelledby="combos-title">
        <SectionTitle action={<Link href="/combos" className="text-sm font-medium text-muted hover:text-text">Détails et méthode</Link>}>
          <span id="combos-title">Combinés proposés</span>
        </SectionTitle>
        {tickets.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tickets.map((t) => (
              <TicketCard key={t.id} ticket={t} stale={t.legs.some((l) => ageHours(l.observedAt, new Date(now)) > STALE_AFTER_HOURS)} />
            ))}
          </div>
        ) : (
          <EmptyState icon={Layers} title="Aucun combiné ne peut être construit avec les données actuelles.">
            Nous préférons ne rien proposer plutôt que d&apos;ajouter des sélections pour atteindre une cote.
          </EmptyState>
        )}
      </section>
    </div>
  );
}
