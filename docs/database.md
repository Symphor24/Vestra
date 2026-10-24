# Base de données (Supabase PostgreSQL)

Migrations : `supabase/migrations/` (schéma initial, qualité d'analyse, fonctions de lecture de l'application) · Données initiales : `supabase/seed.sql` · Tests : `tests/integration/db.test.ts`

## Installer

**Option A, sans rien installer** : dans le tableau de bord Supabase, *SQL Editor*, exécuter la migration puis `seed.sql`.

**Option B, CLI** (recommandée pour les migrations suivantes) :

```bash
npx supabase login
npx supabase link --project-ref <ref-du-projet>
npx supabase db push            # applique supabase/migrations/
```

puis exécuter `seed.sql` dans le SQL Editor (le CLI ne pousse le seed que vers une base locale).

Ensuite, remplir `.env.local` à partir de `.env.example`. Les scripts se connectent avec `DATABASE_URL` (chaîne « Session pooler »), qui passe outre la RLS : à garder secrète.

## Tables

| Table | Rôle | Écrite par |
|---|---|---|
| `competitions` | 5 ligues du lancement ; `is_enabled` les masque sans les supprimer | seed |
| `teams` | équipes ; `odds_api_name` = nom exact envoyé par The Odds API, `external_id` = id football-data.org | ingestion |
| `matches` | rencontres ; `reference_bookmaker` = bookmaker sur lequel tous les mouvements affichés sont mesurés, `reference_seen_at` = dernière synchro où il proposait le marché ; scores pour l'évaluation future | ingestion |
| `odds_snapshots` | une ligne par prix observé, jamais modifiée | ingestion |
| `matches_analysis` | dernier état calculé par sélection, avec cote médiane du marché et statut de qualité ; `opening_odds`, `model_probability`, `confidence_score` restent `null` | analyse |
| `tickets`, `ticket_selections` | combinés générés, avec la cote et l'heure d'observation au moment de la génération | générateur |
| `user_favorites` | favoris des comptes, seulement si Supabase Auth est activé | navigateur |
| `sync_runs` | journal des tâches : statut, erreur, crédits consommés et restants | scripts |

Écarts avec le cahier des charges (§10), tous additifs :

- `matches` : `football_data_id`, scores, `reference_bookmaker` ;
- `matches_analysis` : `first_observed_odds`, `normalized_probability` et `observation_count`, distincts de `opening_odds`, qui reste vide ;
- `ticket_selections` : `observed_at` et `rationale` ;
- nouvelle table `sync_runs`, qui sert au contrôle des quotas (§9).

## Garanties portées par la base

- **Ingestion idempotente** : `unique (match_id, bookmaker, market_key, selection_key, observed_at)`. Relancer une synchro n'insère rien de nouveau. `observed_at` est le `last_update` du bookmaker : un prix inchangé ne crée pas de ligne.
- **Cotes valides** : `check (odds_value > 1)` partout.
- **Pas deux issues du même match dans un ticket** : `unique (ticket_id, match_id)`.
- **Pas de match contre soi-même** : `check (home_team_id <> away_team_id)`.

## Accès (RLS)

| Rôle | Peut |
|---|---|
| `anon`, `authenticated` | lire les compétitions actives, équipes, matchs, cotes, analyses, tickets |
| `authenticated` | lire, ajouter, supprimer **ses propres** favoris |
| propriétaire de la base via `DATABASE_URL` (scripts, GitHub Actions) | tout. Cette chaîne ne doit **jamais** être exposée au navigateur |

**Lecture par l'application** : `ui_matches(p_now)` et `ui_tickets(p_now)` renvoient en un seul appel ce qu'affichent les écrans : historique du bookmaker de référence, cote médiane, tickets actifs. Elles s'exécutent avec les droits de l'appelant (`security invoker`), donc la RLS s'applique. Elles sont testées en tant que rôle `anon`.

La sécurité tient en deux couches : les privilèges d'écriture par défaut de Supabase sont révoqués, puis les policies filtrent les lignes. `sync_runs` et `prune_old_data()` ne sont accessibles qu'au propriétaire de la base.

**Pour toute nouvelle table** : `enable row level security`, puis les `grant` et policies nécessaires. Supabase donne tous les droits aux rôles API sur les nouvelles tables.

## Volume et rétention (offre gratuite : 500 Mo)

Estimation au pire, si tous les prix changent à chaque synchro : 5 ligues × ~10 matchs/semaine × ~15 bookmakers (région `eu`) × 3 issues × 21 synchros = ~47 000 lignes/semaine. À ~200 octets par ligne index compris, cela fait ~10 Mo/semaine, soit ~500 Mo/an **sans nettoyage**.

`prune_old_data(keep_days default 30)` ne garde, 30 jours après le match, que le premier et le dernier prix de chaque sélection. Elle supprime aussi les `sync_runs` de plus de 90 jours. On reste alors à ~50 Mo/an. Elle est appelée à la fin de chaque synchro.

Si le volume dépasse les prévisions, le levier est de ne stocker qu'une liste courte de bookmakers.

## Limites de l'offre gratuite Supabase (vérifiées le 24/10/2026)

- 500 Mo de base par projet, 2 projets actifs, 5 Go de trafic sortant.
- **Projet mis en pause après 1 semaine d'inactivité.** Les synchros planifiées (3 par jour) l'évitent.
- **Aucune sauvegarde automatique.** Compensé par une sauvegarde hebdomadaire chiffrée par GitHub Actions : voir [ingestion.md](ingestion.md#sauvegardes-githubworkflowsbackupyml).
