# Vestra

Analyse des matchs de football, des mouvements de cotes et des combinés expliqués. Mobile-first, Next.js 16.

> **État : phases 1–6, phase 7 en cours.** L'interface lit Supabase dès que `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` sont définis ; sinon elle affiche des données fictives, signalées sur chaque page. Base, synchros et sauvegardes en service ; mise en ligne sur Netlify : voir [docs/deployment.md](docs/deployment.md).

## Lancer

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # calculs de cotes, générateur, ticket, migrations + RLS (PGlite, sans Docker)
npm run typecheck
npm run lint
npm run build
npm run pipeline   # résultats + cotes + analyse + combinés (nécessite .env.local)
```

## Structure

```
src/app/                 pages : / matches live match/[id] combos combos/builder favorites profile about
src/components/          ui/ layout/ dashboard/ matches/ odds/ combos/ charts/ favorites/ profile/
src/lib/odds/calc.ts     (partagé avec scripts/, d'où les imports relatifs en .ts) variation, baisse, probabilité implicite, marge, normalisation, fraîcheur
src/lib/combos/          generate.ts (générateur déterministe), slip.ts (contrôle du ticket utilisateur)
src/lib/data.ts          point d'entrée unique des données (Supabase en lecture seule via la clé anon, sinon démo), cache serveur
src/lib/supabase/        validation Zod des réponses
src/lib/demo/data.ts     données fictives
src/lib/store.ts         favoris, ticket, préférences : stockage local du navigateur
supabase/migrations/     schéma versionné ; supabase/seed.sql : compétitions
scripts/                 ingest-results.ts, ingest-odds.ts, analyze-matches.ts, generate-combos.ts + lib/
.github/workflows/       pipeline.yml (3×/jour), backup.yml (hebdomadaire, chiffré)
tests/unit/ tests/integration/
```

## Décisions

| Sujet | Décision | Pourquoi |
|---|---|---|
| Cotes | The Odds API, marché 1N2 (`h2h`), région `eu`, 5 ligues, 3 synchros/jour ≤ 465 crédits/mois, plafond 470 | 1 crédit par marché × région × appel ; quota gratuit ≈ 500/mois (à confirmer dans le compte) |
| Historique | Vestra enregistre ses propres observations ; `opening_odds` reste `null` | l'historique est réservé aux plans payants ; une première observation n'est pas une cote d'ouverture |
| Comparabilité | toutes les observations d'un match viennent d'un seul bookmaker | spec §11.1 |
| Couleur des baisses | bleu, jamais vert | une baisse de cote n'indique pas qu'un pari va gagner |
| Probabilité modèle / score de confiance | non affichés | aucun modèle validé (spec §10) |
| Probabilité d'un combiné | produit des probabilités du marché sans marge, présenté « si les matchs étaient indépendants », masqué en cas de conflit | spec §4.5 / §12 |
| Combinés | glouton déterministe, une issue par match, catégorie laissée vide plutôt que remplie artificiellement | spec §12 |
| Persistance utilisateur | `localStorage` uniquement, pas de compte | pas de données serveur sans auth + RLS (spec §4.6) |
| Graphique | SVG fait main (une série, un axe) avec tableau des valeurs | évite ~100 ko de Recharts pour 2 à 20 points |
| Composants | pas de shadcn/Radix pour l'instant | aucune primitive complexe (dialog, popover) n'est nécessaire ; à ajouter quand ce sera le cas |
| Filtre « type de marché » | non affiché | un seul marché (1N2) au lancement |
| Statut « en direct » | page Direct : scores du jour par football-data.org (offre gratuite), cache 1 min, rafraîchissement auto | un seul appel pour les 5 ligues, bien sous la limite de 10 appels/min ; « populaires » = liste fixe de grands clubs (`src/lib/live.ts`) |
| Logos d'équipes | initiales | blasons à brancher via football-data.org (vérifier les droits) |
| Hébergement | Netlify (offre gratuite), `netlify.toml` | Vercel Hobby interdit l'usage commercial ; l'adaptateur Netlify prend en charge Cache Components et PPR |

## Reste à faire

- **Phase 3** ✅ schéma, contraintes, RLS, rétention, testés. Reste : créer le projet Supabase et appliquer la migration ([docs/database.md](docs/database.md)), décider des sauvegardes.
- **Phase 4** ✅ ingestion, plafond de crédits, reprises, journal, tâches planifiées, sauvegardes. Reste : clés, secrets GitHub, premier passage réel ([docs/ingestion.md](docs/ingestion.md)).
- **Phase 5** ✅ analyse et statuts de qualité, filtres §11.4 (fraîcheur confirmée, écart au marché, variation aberrante), corrélation « même équipe », cycle de vie des tickets. Voir [docs/ingestion.md](docs/ingestion.md).
- **Phase 6** ✅ interface branchée sur Supabase (clé anon, RLS, cache serveur, validation Zod), résultats football-data.org, scores, alerte si les données ne sont plus actualisées. Vérifiée dans le navigateur contre une API Supabase simulée.
- **Après le lancement** : évaluation des performances (§13). Il faudra régler les tickets une fois tous leurs matchs terminés et publier un historique seulement quand l'échantillon sera suffisant.
- **Phase 7** ✅ base Supabase créée (migrations + seed le 25/10/2026), premier pipeline réel réussi, code sur GitHub, secrets Actions, configuration Netlify, [documentation de maintenance](docs/deployment.md). Reste : relier le dépôt dans Netlify (voir la doc).
- Tests de navigation de bout en bout (Playwright) ; aujourd'hui seulement vérifiés à la main.
