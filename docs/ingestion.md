# Pipeline des cotes et sauvegardes

Trois fois par jour, le workflow `pipeline.yml` enchaîne quatre scripts :

| Étape | Script | Écrit dans |
|---|---|---|
| 1. Résultats | `scripts/ingest-results.ts` | `matches` (statut, score), `teams` (ids, noms courts) |
| 2. Cotes | `scripts/ingest-odds.ts` | `teams`, `matches`, `odds_snapshots` |
| 3. Analyse | `scripts/analyze-matches.ts` | `matches_analysis` |
| 4. Combinés | `scripts/generate-combos.ts` | `tickets`, `ticket_selections` |

L'étape 1 est sautée si `FOOTBALL_DATA_API_KEY` n'est pas défini. Chaque étape tourne même si la précédente a échoué. Chaque étape est journalisée dans `sync_runs`.

## Ce que fait une synchro (`scripts/ingest-odds.ts`)

1. Ouvre une ligne dans `sync_runs` (statut `running`).
2. **Contrôle du quota** : additionne les crédits consommés ce mois-ci (`sync_runs`). Si la synchro ferait dépasser `ODDS_API_MONTHLY_CREDIT_CAP` (470 par défaut), elle s'arrête **avant tout appel**.
3. Pour chaque compétition active : un appel `GET /v4/sports/{clé}/odds?regions=eu&markets=h2h`, soit 1 crédit. La synchro s'arrête aussi si le fournisseur annonce 0 crédit restant (en-tête `x-requests-remaining`).
4. **Validation** (Zod) : une réponse au format inattendu est rejetée, pas enregistrée. Un marché est écarté s'il est incomplet (pas exactement 3 issues), s'il a une cote ≤ 1 ou un horodatage dans le futur.
5. **Normalisation** : équipes reconnues par leur nom The Odds API ; issues `home`, `draw` ou `away`. Les matchs déjà commencés sont ignorés, car aucune source fiable n'existe pour le direct.
6. **Enregistrement** : une ligne par prix dans `odds_snapshots`. `matches.reference_seen_at` note la dernière synchro où le bookmaker de référence proposait encore le marché : un prix inchangé mais confirmé reste « frais ». Un prix déjà connu (même bookmaker, même `last_update`) n'est pas réinséré. Un report du coup d'envoi est suivi. Le bookmaker de référence est choisi une fois pour toutes (Pinnacle de préférence, puis Betfair, Unibet, William Hill, sinon le premier par ordre alphabétique).
7. Nettoyage `prune_old_data()`, puis clôture du `sync_run` : statut, crédits consommés et restants, nombre de prix enregistrés, erreurs.

Une compétition en erreur n'empêche pas les autres d'être traitées, mais la synchro est marquée `error` et le script sort en code 1. GitHub signale alors l'échec par e-mail.

**Appels réseau** : délai de 15 s, 3 tentatives maximum avec backoff exponentiel, uniquement sur les erreurs passagères (408, 429, 5xx, réseau). Une erreur 401 ou 422 n'est jamais retentée, car chaque appel coûte du quota. La clé API n'apparaît jamais dans les messages d'erreur.

## Résultats (`scripts/ingest-results.ts`, football-data.org)

Pour les matchs commencés depuis 2 h à 7 jours et toujours « à venir », le script fait un appel par ligue, au plus 5 par synchro. L'offre gratuite autorise 10 appels par minute.

**Rapprocher les deux fournisseurs** : les noms diffèrent (« Inter Milan » contre « FC Internazionale Milano »). Le script cherche donc la rencontre, pas l'équipe. Il retient :
1. un coup d'envoi à ±15 min avec au moins une équipe reconnue du bon côté ;
2. sinon, les deux équipes reconnues dans une fenêtre de 36 h ;
3. sinon, une seule candidate dans cette fenêtre (cas des reports).

En cas d'ambiguïté, le match est **signalé, jamais deviné** (`unmatched` dans la sortie). Chaque rapprochement enregistre l'identifiant football-data des deux équipes, ce qui rend les suivants exacts, et leur nom court (« Wolves »).

**Statuts** : `FINISHED` donne le score final. `POSTPONED` ou `CANCELLED` retire le match du programme. Un match reporté revient automatiquement quand The Odds API annonce une nouvelle date. Entre le coup d'envoi et le résultat, le match n'est pas affiché, faute de source fiable pour le direct.

## Analyse (`scripts/analyze-matches.ts`)

Pour chaque issue des matchs à venir, une ligne dans `matches_analysis` (mise à jour, jamais dupliquée) : première cote observée, cote actuelle, variation, probabilité implicite brute et sans marge, cote médiane de tous les bookmakers, nombre de bookmakers. Chaque ligne reçoit un statut de qualité :

| Statut | Signification |
|---|---|
| `ok` | au moins 2 observations, prix confirmé il y a moins de 12 h, proche du marché |
| `insufficient_history` | une seule observation : variation non mesurable |
| `stale` | prix non confirmé depuis plus de 12 h |
| `divergent` | écart de plus de 8 % avec la cote médiane des bookmakers |
| `invalid` | aucun prix valide |

`opening_odds`, `model_probability` et `confidence_score` restent vides : il n'existe ni cote d'ouverture ni modèle validé.

## Combinés (`scripts/generate-combos.ts`)

Le générateur est celui de l'interface (`src/lib/combos/generate.ts`, méthodologie v0.2.0), appliqué aux données de la base.
- **Sélections admissibles** : statut de qualité `ok`, baisse de 10 à 50 % (au-delà, erreur probable), coup d'envoi dans plus de 30 minutes, une seule issue par match.
- **Corrélation** : deux matchs de la même équipe ne sont jamais combinés. Les autres corrélations ne sont pas évaluées, et l'interface le dit.
- **Cycle de vie des tickets** :
  - un ticket identique à un ticket actif est conservé tel quel ;
  - tout autre ticket actif passe en `invalidated` ;
  - un ticket passe en `expired` dès le premier coup d'envoi de ses matchs.
- `estimated_probability` reste vide : le produit des probabilités supposerait l'indépendance, que rien ne garantit.

## Lancer à la main

```bash
cp .env.example .env.local   # remplir DATABASE_URL et ODDS_API_KEY
npm run ingest               # coûte environ 5 crédits
npm run analyze
npm run combos
npm run results              # nécessite FOOTBALL_DATA_API_KEY
npm run pipeline             # les quatre à la suite
```

## Mettre en place sur GitHub

1. Pousser le dépôt sur GitHub. Les tâches planifiées ne tournent que sur la branche par défaut.
2. *Settings > Secrets and variables > Actions > Secrets* :

   | Secret | Valeur |
   |---|---|
   | `DATABASE_URL` | Supabase > Connect > **Session pooler** (pas « Direct connection », qui n'est accessible qu'en IPv6, alors que GitHub n'a pas d'IPv6) |
   | `ODDS_API_KEY` | clé The Odds API |
   | `FOOTBALL_DATA_API_KEY` | clé football-data.org (gratuite, sur inscription) |
   | `BACKUP_PASSPHRASE` | phrase longue et aléatoire, **à conserver ailleurs** : sans elle, les sauvegardes sont illisibles |

3. Optionnel, dans l'onglet *Variables* : `ODDS_API_MONTHLY_CREDIT_CAP` pour changer le plafond.
4. *Actions > Odds pipeline > Run workflow* pour un premier essai, puis vérifier `select * from sync_runs order by id desc` dans Supabase.

**Calendrier** : 07:15, 13:15 et 18:15 UTC, avant les matchs de l'après-midi et du soir. Cela fait 3 × 5 = 15 crédits par jour, et au plus 465 sur un mois de 31 jours. Chaque lancement manuel consomme environ 5 crédits de plus : au-delà du plafond, les dernières synchros du mois sont refusées.

**À savoir** : sur un dépôt public, GitHub désactive les tâches planifiées après 60 jours sans commit. Il les réactive en un clic, et un e-mail prévient avant. Sur un dépôt privé, l'offre gratuite donne 2000 minutes par mois ; une synchro en prend environ 1.

## Sauvegardes (`.github/workflows/backup.yml`)

Chaque lundi à 03:30 UTC : `pg_dump` du schéma `public`, chiffré en AES-256 avec `BACKUP_PASSPHRASE`, puis stocké comme artefact GitHub pendant 90 jours. On garde ainsi environ 13 sauvegardes glissantes.

Pour restaurer :

```bash
gpg --decrypt vestra-AAAA-MM-JJ.dump.gpg > vestra.dump
pg_restore --clean --if-exists --no-owner --no-privileges -d "$DATABASE_URL" vestra.dump
```

**Limites** :
- les comptes (`auth.users`) ne sont pas sauvegardés, donc les favoris ne se restaurent que si les comptes existent encore ;
- si Supabase passe un jour à PostgreSQL 18, il faudra installer `postgresql-client-18` dans le workflow.
