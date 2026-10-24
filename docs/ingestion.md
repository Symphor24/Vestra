# Ingestion des cotes et sauvegardes

## Ce que fait une synchro (`scripts/ingest-odds.ts`)

1. Ouvre une ligne dans `sync_runs` (statut `running`).
2. **Contrôle du quota** : additionne les crédits consommés ce mois-ci (`sync_runs`). Si la synchro ferait dépasser `ODDS_API_MONTHLY_CREDIT_CAP` (470 par défaut), elle s'arrête **avant tout appel**.
3. Pour chaque compétition active : un appel `GET /v4/sports/{clé}/odds?regions=eu&markets=h2h`, soit 1 crédit. La synchro s'arrête aussi si le fournisseur annonce 0 crédit restant (en-tête `x-requests-remaining`).
4. **Validation** (Zod) : une réponse au format inattendu est rejetée, pas enregistrée. Un marché est écarté s'il est incomplet (pas exactement 3 issues), s'il a une cote ≤ 1 ou un horodatage dans le futur.
5. **Normalisation** : équipes reconnues par leur nom The Odds API ; issues `home`, `draw` ou `away`. Les matchs déjà commencés sont ignorés, car aucune source fiable n'existe pour le direct.
6. **Enregistrement** : une ligne par prix dans `odds_snapshots`. Un prix déjà connu (même bookmaker, même `last_update`) n'est pas réinséré. Un report du coup d'envoi est suivi. Le bookmaker de référence est choisi une fois pour toutes (Pinnacle de préférence, puis Betfair, Unibet, William Hill, sinon le premier par ordre alphabétique).
7. Nettoyage `prune_old_data()`, puis clôture du `sync_run` : statut, crédits consommés et restants, nombre de prix enregistrés, erreurs.

Une compétition en erreur n'empêche pas les autres d'être traitées, mais la synchro est marquée `error` et le script sort en code 1. GitHub signale alors l'échec par e-mail.

**Appels réseau** : délai de 15 s, 3 tentatives maximum avec backoff exponentiel, uniquement sur les erreurs passagères (408, 429, 5xx, réseau). Une erreur 401 ou 422 n'est jamais retentée, car chaque appel coûte du quota. La clé API n'apparaît jamais dans les messages d'erreur.

Les étapes 6 à 8 du cahier des charges (§9 : comparaison, indicateurs, suggestions) relèvent de la phase 5.

## Lancer à la main

```bash
cp .env.example .env.local   # remplir DATABASE_URL et ODDS_API_KEY
npm run ingest               # coûte environ 5 crédits
```

## Mettre en place sur GitHub

1. Pousser le dépôt sur GitHub. Les tâches planifiées ne tournent que sur la branche par défaut.
2. *Settings > Secrets and variables > Actions > Secrets* :

   | Secret | Valeur |
   |---|---|
   | `DATABASE_URL` | Supabase > Connect > **Session pooler** (pas « Direct connection », qui n'est accessible qu'en IPv6, alors que GitHub n'a pas d'IPv6) |
   | `ODDS_API_KEY` | clé The Odds API |
   | `BACKUP_PASSPHRASE` | phrase longue et aléatoire, **à conserver ailleurs** : sans elle, les sauvegardes sont illisibles |

3. Optionnel, dans l'onglet *Variables* : `ODDS_API_MONTHLY_CREDIT_CAP` pour changer le plafond.
4. *Actions > Ingest odds > Run workflow* pour un premier essai, puis vérifier `select * from sync_runs order by id desc` dans Supabase.

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
