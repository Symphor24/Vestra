import type { Metadata } from "next";
import { CATEGORIES, METHODOLOGY_VERSION, RULES } from "@/lib/combos/generate";
import { STALE_AFTER_HOURS } from "@/lib/odds/calc";
import { DATA_SOURCE } from "@/lib/data";

export const metadata: Metadata = { title: "Sources et méthodologie" };

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 border-t border-line pt-6">
      <h2 className="mb-3 text-lg font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-muted [&_strong]:font-semibold [&_strong]:text-text">{children}</div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <article className="max-w-2xl space-y-8">
      <header>
        <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Sources et méthodologie</h1>
        <p className="mt-1 text-sm text-muted">Ce que Vestra mesure, comment, et ce qu&apos;il ne peut pas dire.</p>
      </header>

      <Section id="sources" title="Sources des données">
        {DATA_SOURCE === "demo" && (
          <p><strong>Cette version est une démonstration : tous les matchs et toutes les cotes sont fictifs.</strong></p>
        )}
        <p>Les cotes proviendront de The Odds API (marché 1N2, bookmakers européens), interrogée environ trois fois par jour. Elles ne sont donc <strong>pas en temps réel</strong>.</p>
        <p>Le calendrier et les résultats proviendront de football-data.org. Les scores en direct ne sont pas affichés.</p>
        <p>L&apos;offre gratuite de The Odds API ne fournit pas l&apos;historique des cotes. Vestra enregistre donc ses propres observations depuis son lancement : la première valeur affichée est <strong>la première observation Vestra, pas la cote d&apos;ouverture</strong> du marché.</p>
      </Section>

      <Section id="methodologie" title={`Méthodologie (version ${METHODOLOGY_VERSION})`}>
        <p><strong>Variation</strong> : ((cote actuelle − première observation) / première observation) × 100, calculée uniquement entre deux observations du même match, de la même issue et du même bookmaker.</p>
        <p><strong>Probabilité implicite</strong> : 1 / cote. Elle inclut la marge du bookmaker. La version « sans marge » divise chaque 1/cote par leur somme sur le marché complet (méthode proportionnelle). C&apos;est une lecture du marché, pas la probabilité réelle de l&apos;événement.</p>
        <p><strong>Sélections retenues</strong> : baisse d&apos;au moins {RULES.minDropPct} %, au moins {RULES.minObservations} observations, prix confirmé il y a moins de {STALE_AFTER_HOURS} h, baisse d&apos;au plus {RULES.maxDropPct} % (au-delà, erreur de données probable), écart d&apos;au plus {RULES.maxConsensusDeviationPct} % avec la cote médiane de tous les bookmakers, coup d&apos;envoi dans plus de {RULES.minMinutesBeforeKickoff} minutes, une seule issue par match. Ce seuil est un filtre descriptif, pas une preuve de valeur.</p>
        <p><strong>Combinés</strong> : construction déterministe qui parcourt les sélections retenues et s&apos;arrête dès que la cote visée est atteinte ({CATEGORIES.moderate.min} à {CATEGORIES.moderate.max}, {CATEGORIES.intermediate.min} à {CATEGORIES.intermediate.max}, {CATEGORIES.high.min} et plus). Deux sélections d&apos;une même équipe ne sont jamais combinées. Une catégorie reste vide plutôt que d&apos;être complétée artificiellement. Les combinés sont recalculés à chaque synchronisation et invalidés dès que les données changent ; ils expirent au premier coup d&apos;envoi.</p>
        <p><strong>Limites</strong> : une baisse de cote peut refléter une information nouvelle, un ajustement du bookmaker, une faible liquidité ou un changement de marge. Seule la corrélation « même équipe » est détectée ; les autres (même journée, enjeux liés) ne sont pas évaluées. Aucun modèle de probabilité propre ni score de confiance n&apos;est publié tant qu&apos;il n&apos;a pas été validé sur un historique suffisant.</p>
        <p><strong>Historique de performance</strong> : aucun taux de réussite n&apos;est affiché. Il le sera seulement avec un historique complet, la taille de l&apos;échantillon et la période étudiée.</p>
      </Section>

      <Section id="confidentialite" title="Confidentialité">
        <p>Vestra fonctionne sans compte. Vos favoris, votre ticket et vos préférences sont stockés dans le stockage local de votre navigateur et ne quittent pas votre appareil. Vous pouvez les effacer depuis la page Profil.</p>
        <p>Aucun cookie publicitaire ni outil de suivi tiers n&apos;est utilisé.</p>
      </Section>

      <Section id="jeu-responsable" title="Jeu responsable">
        <p><strong>Les jeux d&apos;argent sont interdits aux mineurs.</strong> Parier comporte des risques : endettement, isolement, dépendance.</p>
        <p>Vestra est un outil d&apos;analyse. Il ne prend pas de paris et ne garantit aucun résultat ni aucun gain. Ne misez que ce que vous pouvez vous permettre de perdre.</p>
        <p>Besoin d&apos;aide ? Joueurs Info Service : <strong>09 74 75 13 13</strong> (appel non surtaxé), ou joueurs-info-service.fr.</p>
      </Section>
    </article>
  );
}
