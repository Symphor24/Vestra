# Vestra

Analyse des matchs de football, des mouvements de cotes et des combinés expliqués. Mobile-first, Next.js 16.

> **État : phases 1–4.** Interface prototype sur données fictives (signalées en permanence). Schéma de base et ingestion des cotes prêts et testés, en attente des clés : voir [docs/database.md](docs/database.md) et [docs/ingestion.md](docs/ingestion.md).

## Lancer

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # calculs de cotes, générateur, ticket, migrations + RLS (PGlite, sans Docker)
npm run typecheck
npm run lint
npm run build
npm run ingest     # une synchro des cotes (nécessite .env.local)
```

## Structure

```
src/app/                 pages : / matches match/[id] combos combos/builder favorites profile about
src/components/          ui/ layout/ dashboard/ matches/ odds/ combos/ charts/ favorites/ profile/
src/lib/odds/calc.ts     variation, baisse, probabilité implicite, marge, normalisation, fraîcheur
src/lib/combos/          generate.ts (générateur déterministe), slip.ts (contrôle du ticket utilisateur)
src/lib/data.ts          point d'entrée unique des données (démo aujourd'hui, Supabase ensuite), cache serveur
src/lib/demo/data.ts     données fictives
src/lib/store.ts         favoris, ticket, préférences : stockage local du navigateur
supabase/migrations/     schéma versionné ; supabase/seed.sql : compétitions
scripts/                 ingest-odds.ts + lib/ (env Zod, client HTTP avec reprises, client The Odds API, ingestion)
.github/workflows/       ingest-odds.yml (3×/jour), backup.yml (hebdomadaire, chiffré)
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
| Statut « en direct » | non affiché | pas de source fiable gratuite |
| Logos d'équipes | initiales | blasons à brancher via football-data.org (vérifier les droits) |
| Hébergement | à décider : Vercel Hobby interdit l'usage commercial ; Cloudflare Pages ou Netlify sinon | |

## Reste à faire

- **Phase 3** ✅ schéma, contraintes, RLS, rétention, testés. Reste : créer le projet Supabase et appliquer la migration ([docs/database.md](docs/database.md)), décider des sauvegardes.
- **Phase 4** ✅ ingestion, plafond de crédits, reprises, journal, tâches planifiées, sauvegardes. Reste : clés, secrets GitHub, premier passage réel ([docs/ingestion.md](docs/ingestion.md)).
- **Phase 5–6** : générer les tickets côté script, remplacer `DATA_SOURCE = "demo"` dans `src/lib/data.ts`, résultats via football-data.org, suivi des performances (§13).
- **Phase 7** : déploiement et documentation de maintenance.
- Tests de navigation de bout en bout (Playwright) ; aujourd'hui seulement vérifiés à la main.
