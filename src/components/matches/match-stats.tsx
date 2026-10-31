import { Info } from "lucide-react";
import { getHeadToHead, getSeasonResults } from "@/lib/live";
import { expectedGoals, MIN_PLAYED, modelProbabilities, teamForm, type TeamForm } from "@/lib/stats";
import { fmtPct } from "@/lib/formatting";
import { card } from "@/components/ui/bits";

export interface StatsTeams {
  /** football-data league code (PL, PD…). */
  code: string;
  home: { fdId: number; name: string };
  away: { fdId: number; name: string };
  fdMatchId: string | null;
}

const RESULT = {
  W: ["V", "bg-accent text-accent-ink", "victoire"],
  D: ["N", "bg-surface-2", "nul"],
  L: ["D", "bg-danger/15 text-danger", "défaite"],
} as const;
const num = (x: number) => x.toFixed(2).replace(".", ",");

/** Season facts of both teams, the Poisson model built on them, and their last meetings. */
export async function MatchStats({ code, home, away, fdMatchId }: StatsTeams) {
  const [season, h2h] = await Promise.all([getSeasonResults(code), fdMatchId ? getHeadToHead(fdMatchId) : null]);
  const forms = season && [teamForm(season, home.fdId), teamForm(season, away.fdId)];
  const xg = season && expectedGoals(season, home.fdId, away.fdId);
  const model = xg && modelProbabilities(xg);

  return (
    <>
      <section className={`${card} night p-4 sm:p-5`} aria-labelledby="season-title">
        <h2 id="season-title" className="font-semibold">Statistiques de la saison</h2>
        <p className="mb-4 text-xs text-muted">Championnat en cours, d&apos;après les résultats football-data.org.</p>
        {forms && forms[0] && forms[1] ? (
          <FormTable names={[home.name, away.name]} forms={[forms[0], forms[1]]} />
        ) : (
          <p className="text-sm text-muted">Statistiques indisponibles pour le moment.</p>
        )}
      </section>

      <section className="rounded-card border border-dashed border-line p-4 sm:p-5" aria-labelledby="model-title">
        <h2 id="model-title" className="font-semibold">Buts attendus (modèle Vestra)</h2>
        <p className="mb-3 text-xs text-muted">
          Modèle de Poisson sur l&apos;attaque et la défense de chaque équipe cette saison. Ce n&apos;est pas un xG calculé sur les tirs.
        </p>
        {xg && model ? (
          <>
            <p className="mb-3 flex items-baseline justify-center gap-3 text-2xl font-semibold tabular-nums">
              {num(xg.home)} <span className="text-sm font-normal text-muted">–</span> {num(xg.away)}
            </p>
            <ul className="grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-5">
              {[
                [`Victoire ${home.name}`, model.h2h.home],
                ["Match nul", model.h2h.draw],
                [`Victoire ${away.name}`, model.h2h.away],
                ["Plus de 2,5 buts", model["totals_2.5"].over],
                ["Les deux marquent", model.btts.yes],
              ].map(([label, p]) => (
                <li key={label as string} className="rounded-[12px] bg-surface-2 p-2">
                  <p className="truncate text-muted">{label}</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums">{fmtPct((p as number) * 100, 0)}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Les combinés mêlent ces probabilités (25 %) à celles du marché (75 %), qui restent la source principale.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">Pas assez de matchs joués cette saison (minimum {MIN_PLAYED} par équipe).</p>
        )}
      </section>

      <section className={`${card} night p-4 sm:p-5`} aria-labelledby="h2h-title">
        <h2 id="h2h-title" className="mb-3 font-semibold">Confrontations directes</h2>
        {h2h && h2h.length > 0 ? (
          <ul className="divide-y divide-line text-sm">
            {h2h.slice(0, 5).map((m) => (
              <li key={m.utcDate} className="flex items-center gap-3 py-2">
                <span className="w-20 shrink-0 text-xs text-muted tabular-nums">{new Date(m.utcDate).toLocaleDateString("fr-FR")}</span>
                <span className="flex-1 truncate text-right">{m.home}</span>
                <span className="w-12 shrink-0 text-center font-semibold tabular-nums">{m.homeGoals ?? "–"} – {m.awayGoals ?? "–"}</span>
                <span className="flex-1 truncate">{m.away}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{h2h ? "Aucune confrontation récente." : "Historique indisponible pour ce match."}</p>
        )}
      </section>

      <p className="flex gap-2 text-xs leading-relaxed text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Possession, tirs, corners, cartons, fautes et xG réels ne sont pas fournis par les offres gratuites de nos sources : ils ne sont pas affichés plutôt qu&apos;estimés.
      </p>
    </>
  );
}

function FormTable({ names, forms }: { names: [string, string]; forms: [TeamForm, TeamForm] }) {
  const rows: [string, (f: TeamForm) => string][] = [
    ["Matchs joués", (f) => String(f.played)],
    ["Buts marqués / match", (f) => num(f.goalsFor)],
    ["Buts encaissés / match", (f) => num(f.goalsAgainst)],
    ["Les deux marquent", (f) => fmtPct(f.bttsPct, 0)],
    ["Plus de 2,5 buts", (f) => fmtPct(f.over25Pct, 0)],
    ["Sans encaisser", (f) => fmtPct(f.cleanSheetPct, 0)],
  ];
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-muted">
          <th className="w-1/3 pb-2 text-left font-medium">{names[0]}</th>
          <th className="pb-2 font-medium"><span className="sr-only">Statistique</span></th>
          <th className="w-1/3 pb-2 text-right font-medium">{names[1]}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        <tr>
          <td className="py-2"><FormChips form={forms[0]} /></td>
          <td className="py-2 text-center text-xs text-muted">Forme (récent à gauche)</td>
          <td className="py-2 text-right"><FormChips form={forms[1]} /></td>
        </tr>
        {rows.map(([label, v]) => (
          <tr key={label}>
            <td className="py-2 font-semibold tabular-nums">{v(forms[0])}</td>
            <td className="py-2 text-center text-xs text-muted">{label}</td>
            <td className="py-2 text-right font-semibold tabular-nums">{v(forms[1])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Last five results, most recent first. */
function FormChips({ form }: { form: TeamForm }) {
  const recent = [...form.last5].reverse();
  return (
    <span className="inline-flex gap-1">
      <span className="sr-only">{recent.map((r) => RESULT[r][2]).join(", ")}</span>
      {recent.map((r, i) => (
        <span key={i} aria-hidden="true" className={`grid size-5 place-items-center rounded-md text-[11px] font-bold ${RESULT[r][1]}`}>
          {RESULT[r][0]}
        </span>
      ))}
    </span>
  );
}
