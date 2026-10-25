# Combinés multi-marchés — plan de mise en œuvre

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Générer chaque jour, la veille, des combinés multi-marchés par palier de cote (~2 à ~20 000+), les conserver pour toujours et suivre leur statut en direct.

**Architecture:** Un nouveau script `ingest-markets` lit API-Football (cotes de demain, 2 passages) et écrit dans `odds_snapshots`. Un générateur pur (`src/lib/combos/tiers.ts`) construit un combiné par palier à partir de « sélections » génériques. Le règlement (`src/lib/combos/settle.ts`) est partagé : les scripts l'utilisent pour le résultat définitif, la page `/combos` l'utilise pour le statut en direct à partir des scores football-data déjà affichés sur `/live`.

**Tech Stack:** Next.js 16 (App Router, Cache Components), TypeScript exécuté directement par Node 24 dans `scripts/` (imports relatifs en `.ts`, pas de propriétés de paramètre de constructeur), Zod 4, PostgreSQL Supabase, PGlite + Vitest pour les tests.

**Spec:** `docs/superpowers/specs/2026-10-25-combines-multi-marches-design.md` (à lire avant chaque tâche).

## Global Constraints

- Gratuit uniquement : API-Football ≤ 90 requêtes/jour (plafond dur) et ≥ 6,5 s entre deux appels ; The Odds API inchangé ; football-data ≤ 10 appels/min.
- Paliers : `TIERS = [2, 5, 10, 20, 50, 100, 500, 1000, 5000, 20000]`, fourchette `[0.85·T ; 1.15·T]`, dernier palier `≥ 17000` sans borne haute.
- Une sélection au plus par match, pas deux sélections partageant une équipe, au moins 2 sélections par combiné.
- Libellé de probabilité, mot pour mot : « Probabilité selon le marché, si les matchs étaient indépendants ». Jamais « vraie probabilité », « prédiction » ni « chance de gagner ».
- Un combiné n'est jamais supprimé ni modifié après création, sauf ses colonnes de règlement (`result`, `settled_at`, `status`).
- Baisses de cote en bleu (`text-info`), jamais en vert. Statut Gagné en pastille lime (`bg-accent text-accent-ink`), Perdu `danger`, Annulé `muted`.
- Code dans `scripts/` et `src/lib/**` partagé avec les scripts : imports relatifs avec extension `.ts` (comme `src/lib/odds/calc.ts`).
- `METHODOLOGY_VERSION` → `"1.0.0"`.
- En production, la table `tickets` est vide (vérifié le 25/10/2026) : pas de reprise de l'ancien format, l'ancienne contrainte `category in (...)` peut être retirée.

## Review Focus

1. **Fixture API-Football introuvable ou ambiguë** (noms différents, deux matchs proches des mêmes équipes) : le match est ignoré et listé dans `unmatched`, jamais deviné. Test : Task 4, `skips and reports an ambiguous fixture`.
2. **Marché incomplet chez le bookmaker** (Over 2.5 sans Under 2.5, Double chance avec 2 issues) : ce marché seul est écarté, les autres restent utilisables. Test : Task 4, `drops an incomplete market but keeps the others`.
3. **Budget épuisé ou 429 en cours de passage** : arrêt propre, compteur enregistré, aucun crash, les matchs restants passent au passage suivant. Test : Task 4, `stops at the daily budget and records requests used`.
4. **Match reporté après création du combiné** : sélection `void`, combiné continue ; toutes `void` → combiné `void`. Test : Task 2 (`ticketStatus`) et Task 6 (`voids the leg of a postponed match`).
5. **Génération lancée deux fois, ou avant 13:00 UTC** : aucun doublon, aucune journée construite sur une seule observation. Test : Task 5, `is idempotent per match day` et `does nothing before 13:00 UTC`.

---

### Task 1: Migration et lecture des combinés

**Files:**
- Create: `supabase/migrations/20261027090000_multi_market_tickets.sql`
- Modify: `tests/integration/db.test.ts`, `tests/integration/ui-read.test.ts`

**Interfaces:**
- Produces (schéma) :
  - `matches.api_football_id bigint unique`, `matches.markets_bookmaker text`.
  - `tickets` : contrainte `tickets_category_check` retirée ; `match_day date`, `featured boolean not null default false`, `result text check (result in ('won','lost','void'))`, `settled_at timestamptz` ; index unique `tickets_day_tier_uniq on (match_day, category) where match_day is not null`.
  - `ticket_selections.result text check (result in ('won','lost','void'))`.
  - `sync_runs_job_check` recréée avec `'ingest-markets'` en plus.
  - `ui_tickets(p_now timestamptz)` remplacée : tous les combinés `generated_at >= p_now - interval '30 days'`, ordre `match_day desc, category::numeric`. Champs : `id, category, totalOdds, probability (estimated_probability), featured, status, result, matchDay, generatedAt, methodologyVersion, legs[]` ; chaque jambe : `matchId, market (market_key), outcome (selection_key), odds, observedAt, rationale, result, kickoffAt, footballDataId (text|null), matchStatus, homeScore, awayScore, home{name,shortName}, away{name,shortName}`.

- [ ] **Step 1: Write the failing tests**

Dans `db.test.ts`, `it("stores one ticket per tier and match day")` : insérer deux tickets `(match_day '2026-10-27', category '5')` → la seconde insertion échoue (`unique`). `it("accepts the new markets and results")` : insérer une sélection `market_key 'totals_2.5', selection_key 'over', result 'won'` → OK ; `result 'maybe'` → échec.

Dans `ui-read.test.ts`, `it("returns ticket history with results, as a visitor")` : en rôle `anon`, un ticket réglé (`status 'settled', result 'won'`) de la veille et un ticket actif sont tous deux renvoyés, avec `legs[0].market`, `legs[0].result`, `legs[0].footballDataId`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/integration/db.test.ts tests/integration/ui-read.test.ts`
Expected: FAIL (colonnes inexistantes).

- [ ] **Step 3: Write the migration**

`alter table` pour chaque colonne ci-dessus, `drop constraint` / `add constraint` pour les deux contraintes, `create or replace function public.ui_tickets` (toujours `security invoker`, `set search_path = ''`, même `grant execute` que l'existant). `prune_old_data()` n'est pas modifiée (elle ne touche pas `tickets`).

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/integration`
Expected: PASS (les anciens tests de `ui_tickets` qui filtraient `status = 'active'` sont mis à jour pour le nouvel historique).

- [ ] **Step 5: Commit**

`git commit -m "Base : combinés multi-marchés, paliers, résultats"`

---

### Task 2: Marchés, probabilités et règlement (logique pure partagée)

**Files:**
- Create: `src/lib/combos/markets.ts`, `src/lib/combos/settle.ts`
- Test: `tests/unit/markets.test.ts`, `tests/unit/settle.test.ts`

**Interfaces:**
- Produces (`markets.ts`) :
  - `export type MarketKey = "h2h" | "double_chance" | "totals_1.5" | "totals_2.5" | "totals_3.5" | "btts";`
  - `export const MARKET_PICKS: Record<MarketKey, readonly string[]>` = h2h `["home","draw","away"]`, double_chance `["1X","12","X2"]`, totals_* `["over","under"]`, btts `["yes","no"]`.
  - `export function marketProbabilities(market: MarketKey, prices: Record<string, number>): Record<string, number> | null` — null si une issue de `MARKET_PICKS[market]` manque ou a une cote ≤ 1 ; normalisation proportionnelle, somme = 2 pour `double_chance`, 1 sinon.
  - `export function pickLabel(market: MarketKey, pick: string, home: string, away: string): string` — ex. `"Plus de 2,5 buts"`, `"Les deux équipes marquent : oui"`, `"Double chance Lyon ou nul"`, `"Victoire PSG"`, `"Match nul"`.
- Produces (`settle.ts`) :
  - `export type LegResult = "pending" | "won" | "lost" | "void";`
  - `export type MatchState = "scheduled" | "live" | "finished" | "void";`
  - `export function settleLeg(market: MarketKey, pick: string, home: number | null, away: number | null, state: MatchState): LegResult`
  - `export function ticketStatus(legs: LegResult[]): LegResult`

- [ ] **Step 1: Write the failing tests**

`markets.test.ts` :
- `marketProbabilities("h2h", {home: 2, draw: 4, away: 4})` → `{home: 0.5, draw: 0.25, away: 0.25}`.
- Double chance sans marge construite depuis P(1)=0.5, P(N)=0.25, P(2)=0.25 : cotes `{"1X": 1/0.75, "12": 1/0.75, "X2": 1/0.5}` → `1X ≈ 0.75`, `X2 ≈ 0.5`, somme ≈ 2 (`toBeCloseTo`, 6 décimales).
- Avec marge (`{over: 1.8, under: 1.8}`) → `0.5 / 0.5`.
- Issue manquante (`{over: 1.36}`) → `null` ; cote `1` → `null`.
- `pickLabel("totals_2.5","over","PSG","Lyon")` → `"Plus de 2,5 buts"`.

`settle.test.ts` (score `home, away`, état) :
- `("totals_1.5","over",1,1,"live")` → `won` ; `("totals_1.5","over",1,0,"live")` → `pending` ; `(… ,1,0,"finished")` → `lost`.
- `("totals_2.5","under",2,1,"live")` → `lost` ; `(…,1,1,"finished")` → `won`.
- `("btts","yes",1,1,"live")` → `won` ; `("btts","no",1,1,"live")` → `lost` ; `("btts","no",2,0,"finished")` → `won`.
- `("h2h","home",3,0,"live")` → `pending` ; `(…,"finished")` → `won`.
- `("double_chance","X2",1,1,"finished")` → `won` ; `("double_chance","12",1,1,"finished")` → `lost`.
- `(any,"…",null,null,"void")` → `void` ; `"scheduled"` → `pending`.
- `ticketStatus(["won","pending"])` → `pending` ; `["won","lost","pending"]` → `lost` ; `["won","void"]` → `won` ; `["void","void"]` → `void`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/unit/markets.test.ts tests/unit/settle.test.ts` — Expected: FAIL (modules absents).

- [ ] **Step 3: Implement both modules**

Règles de résolution exactes : spec §5. `settleLeg` ne renvoie jamais `won` pour `h2h` / `double_chance` avant `finished`.

- [ ] **Step 4: Run to verify they pass** — même commande, PASS.

- [ ] **Step 5: Commit** — `git commit -m "Marchés : probabilités par marché et règlement anticipé"`

---

### Task 3: Générateur par paliers

**Files:**
- Create: `src/lib/combos/tiers.ts`
- Test: `tests/unit/tiers.test.ts`

**Interfaces:**
- Consumes: `MarketKey`, `marketProbabilities`, `pickLabel` (Task 2).
- Produces:
  - `export const TIERS = [2, 5, 10, 20, 50, 100, 500, 1000, 5000, 20000] as const; export type Tier = (typeof TIERS)[number];`
  - `export function tierBand(t: Tier): [number, number]` → `[0.85 t, 1.15 t]`, et `[17000, Infinity]` pour 20000.
  - ```ts
    export interface Selection {
      matchId: string; teamIds: [string, string]; kickoffAt: string;
      market: MarketKey; pick: string; odds: number; probability: number;
      observedAt: string; dropped: boolean; label: string; matchLabel: string;
    }
    export interface TierTicket { tier: Tier; legs: Selection[]; totalOdds: number; probability: number; featured: boolean }
    ```
  - `export function buildTier(selections: Selection[], tier: Tier): Selection[] | null`
  - `export function generateDay(selections: Selection[]): TierTicket[]` — un ticket par palier atteignable, `featured` calculé (spec §3 : score = probabilité × (1 + 0,05 × nb de `dropped`), parmi les paliers 2/5/10 ; les 2 meilleurs, un 3e si ≥ 80 % du score du 2e).
  - `export const FEATURE_DROP_BONUS = 0.05; export const FEATURE_THIRD_RATIO = 0.8;`

- [ ] **Step 1: Write the failing tests**

Construire des sélections avec un helper `sel(matchId, market, pick, odds, probability, teams?)`.
- `respects the band`: chaque ticket de `generateDay` a `totalOdds` dans `tierBand(tier)`.
- `one selection per match and no shared team`: aucune paire de jambes avec même `matchId` ou une équipe commune.
- `leaves an unreachable tier empty`: 3 matchs à cote ~1.3 → pas de palier 100.
- `finds the optimum on small cases`: 6 matchs × 4 sélections tirées d'une graine fixe ; pour chaque palier, comparer à une recherche exhaustive écrite dans le test (toutes combinaisons ≥ 2 jambes) → même probabilité (`toBeCloseTo`, 9 décimales).
- `prefers fewer legs at equal probability`: deux solutions de probabilité égale à 1 % près → celle avec moins de jambes.
- `is deterministic`: deux appels sur une copie mélangée de l'entrée → résultat identique.
- `features the most probable small tiers with the drop bonus`: un palier 5 avec 2 jambes `dropped` passe devant un palier 2 légèrement plus probable sans baisse.
- `runs fast`: 60 matchs × 15 sélections → `generateDay` < 1000 ms.

- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/unit/tiers.test.ts`, FAIL.

- [ ] **Step 3: Implement**

Recherche en faisceau, déterministe :
1. Trier les matchs par `kickoffAt` puis `matchId` ; pour chaque match, ses sélections triées par `market`, `pick`.
2. États = listes de jambes ; départ `[[]]`. Pour chaque match : chaque état produit « on saute ce match » + « on ajoute la sélection s » (si pas d'équipe commune et produit des cotes ≤ borne haute de la fourchette).
3. Garder les `BEAM = 400` meilleurs états par clé `(produit des probabilités desc, nombre de jambes asc, signature asc)`. Comme un état peut encore grandir, conserver aussi les meilleurs états par tranche de log(cote) (16 tranches entre 0 et log(borne haute)) pour ne pas perdre les chemins vers les gros paliers.
4. Fin : parmi les états de ≥ 2 jambes dans la fourchette, prendre le meilleur selon `(probabilité, -jambes, signature)` avec l'égalité « < 1 % relatif » de la spec.
Si le test d'optimum échoue sur un cas, augmenter `BEAM` avant de changer l'algorithme.

- [ ] **Step 4: Run to verify they pass** — PASS.

- [ ] **Step 5: Commit** — `git commit -m "Générateur de combinés par paliers de cote"`

---

### Task 4: Ingestion API-Football

**Files:**
- Create: `scripts/lib/api-football.ts`, `scripts/lib/markets-ingest.ts`, `scripts/ingest-markets.ts`, `tests/integration/markets.test.ts`, `tests/integration/af-fixtures.ts`
- Modify: `scripts/lib/env.ts`, `scripts/lib/main.ts` (type `Job` + `"ingest-markets"`), `scripts/lib/results.ts` (exporter `findFixture` et le type `Pending`), `package.json` (script `markets`, et `pipeline`), `.env.example` (`API_FOOTBALL_KEY=`)

**Interfaces:**
- Consumes: `findFixture` (`scripts/lib/results.ts`), `MarketKey`, `MARKET_PICKS` (Task 2), `getWithRetry` (`scripts/lib/http.ts`).
- Produces:
  - `env.ts` : `export const MarketsEnv = DbEnv.extend({ API_FOOTBALL_KEY: z.string().min(10) });`
  - `api-football.ts` :
    ```ts
    export interface AfFixture { id: number; date: string; leagueId: number; home: string; away: string; status: string }
    export interface AfOdds { fixtureId: number; update: string; bookmakers: { name: string; bets: { id: number; values: { value: string; odd: string }[] }[] }[] }
    export interface ApiFootball { fixtures(date: string): Promise<AfFixture[]>; odds(fixtureId: number): Promise<AfOdds | null> }
    export function apiFootball(key: string, fetchImpl?: typeof fetch, sleepMs?: number): ApiFootball
    export const AF_LEAGUES: Record<number, string> = { 39: "PL", 140: "PD", 135: "SA", 78: "BL1", 61: "FL1" };
    ```
    Base `https://v3.football.api-sports.io`, en-tête `x-apisports-key`, Zod sur les réponses, pause `sleepMs` (défaut 6500) avant chaque appel sauf le premier. Une réponse 200 avec `errors` non vide lève `HttpError(429, …)` si la clé est `rateLimit`, sinon `Error`.
  - `markets-ingest.ts` :
    - `export function marketRows(o: AfOdds, bookmaker: string): { market: MarketKey; pick: string; odds: number }[]` — bets 1 (`Home/Draw/Away`), 12 (`Home/Draw`→1X, `Home/Away`→12, `Draw/Away`→X2), 5 (`Over 1.5`… → `totals_1.5`…, seulement 1.5/2.5/3.5), 8 (`Yes/No`) ; un marché est gardé seulement s'il est complet (`MARKET_PICKS`).
    - `export function pickMarketsBookmaker(o: AfOdds): string | null` — `"bet365"` s'il a les 4 bets (1, 5, 8, 12), sinon le nom (minuscules) qui en a le plus, départage alphabétique.
    - `export async function ingestMarkets(db: Db, af: ApiFootball, now: Date, budget?: number): Promise<{ fixtures: number; linked: number; oddsFetched: number; snapshots: number; requests: number; unmatched: string[]; errors: string[] }>` — `budget` défaut 90 ; requêtes déjà consommées aujourd'hui = `sum(credits_used)` des `sync_runs` `job='ingest-markets'` depuis minuit UTC.
  - `ingest-markets.ts` : via `main("ingest-markets", …, MarketsEnv)` ; `items = snapshots` ; écrit `credits_used = requests` sur la ligne `sync_runs` (adapter `withSyncRun` pour accepter un `credits` optionnel dans le retour de `fn`).

Comportement d'`ingestMarkets` (spec §1) : ne fait rien hors des fenêtres 07:00–08:59 et 13:00–14:59 UTC (retour avec `requests: 0`) ; `fixtures(demain)` ; garde `AF_LEAGUES`, statut `NS` ; rattache via `findFixture` (adapter `AfFixture` → forme `FdMatch` avec `homeTeam.id = null`, et `external_id = null` côté nos équipes) aux `matches` `scheduled` de la même date ; écrit `matches.api_football_id` ; puis `odds(fixtureId)` par match, coup d'envoi le plus proche d'abord, jusqu'au budget ; `markets_bookmaker` fixé au premier passage puis réutilisé ; insère dans `odds_snapshots` (`bookmaker = markets_bookmaker`, `observed_at = update`, `on conflict do nothing`).

- [ ] **Step 1: Write the failing tests**

`af-fixtures.ts` : réponses enregistrées minimales, reprises de la forme réelle (`fixtures` : `response[].fixture{id,date,status{short}}`, `league{id}`, `teams{home{name},away{name}}` ; `odds` : `response[0]{fixture{id}, update, bookmakers[]{name, bets[]{id,name,values[]{value,odd}}}}`), pour les matchs `Home 1…5` de `tests/integration/fixtures.ts` (kickoff identique).

`markets.test.ts` (base `freshDb()` + `seedTwoSyncs`, `now` = veille des matchs à 07:30 UTC, faux `ApiFootball`, `sleepMs = 0`) :
- `links fixtures and stores every complete market`: 5 matchs avec `api_football_id`, snapshots pour les 6 `MarketKey`.
- `drops an incomplete market but keeps the others`: un bookmaker sans `Under 2.5` → pas de `totals_2.5` pour ce match, les autres marchés présents.
- `skips and reports an ambiguous fixture`: deux fixtures candidates au même horaire → match non rattaché, présent dans `unmatched`.
- `stops at the daily budget and records requests used`: budget 3 → `requests === 3`, une seule ligne `sync_runs` avec `credits_used = 3` après passage par `withSyncRun`.
- `keeps the bookmaker chosen on the first pass`: second passage à 13:30 avec un autre bookmaker plus complet → `markets_bookmaker` inchangé.
- `does nothing outside the two windows`: `now` à 18:20 → `requests === 0`.

- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/integration/markets.test.ts`, FAIL.

- [ ] **Step 3: Implement** the three files and the env/main/package changes.

`package.json` : `"markets": "node --env-file-if-exists=.env.local --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/ingest-markets.ts"` ; `pipeline` = `(npm run results || echo results failed) && (npm run ingest || echo ingest failed) && (npm run markets || echo markets failed) && npm run analyze && npm run combos`.

- [ ] **Step 4: Run to verify they pass** — PASS, puis `npm run typecheck`.

- [ ] **Step 5: Commit** — `git commit -m "Ingestion API-Football : cotes multi-marchés de demain"`

---

### Task 5: Persistance des combinés par journée

**Files:**
- Create: `scripts/lib/selections.ts`
- Modify: `scripts/lib/combos.ts` (réécrit), `scripts/generate-combos.ts` (commentaire d'usage), `tests/integration/pipeline.test.ts`
- Modify: `src/lib/combos/generate.ts` : retirer `CATEGORIES`, `buildLegs`, `generateTickets`, `rationale` ; garder `RULES`, `consensusDeviationPct`, `eligibleCandidates` (utilisés par l'accueil et la fiche match) ; `METHODOLOGY_VERSION = "1.0.0"`. Mettre à jour `tests/unit/combos.test.ts` (garder les tests d'`eligibleCandidates`, retirer ceux de l'ancien générateur).

**Interfaces:**
- Consumes: `generateDay`, `Selection`, `TIERS` (Task 3) ; `marketProbabilities`, `pickLabel` (Task 2).
- Produces:
  - `selections.ts` : `export async function loadSelections(db: Db, day: string): Promise<Selection[]>` — matchs `scheduled` dont la date UTC du coup d'envoi = `day` et `markets_bookmaker` non nul ; pour chaque marché complet, dernière cote de `markets_bookmaker` ; `dropped` = dernière cote < première cote observée du même `(match, bookmaker, marché, issue)` ; `probability` via `marketProbabilities`.
  - `combos.ts` : `export async function generateCombos(db: Db, now: Date): Promise<{ day: string; created: number; skipped: "before-13h" | "already-generated" | null }>` — `day` = demain (UTC) ; si `now` < 13:00 UTC → `skipped: "before-13h"` ; si un ticket existe déjà avec ce `match_day` → `"already-generated"` ; sinon insère chaque `TierTicket` (`category = String(tier)`, `estimated_probability`, `featured`, `match_day`, `status 'active'`, `title = "Combiné ~" + tier`, `expires_at = null`) avec ses sélections (`market_key`, `selection_key`, `rationale` = cote, probabilité selon le marché arrondie, mention « cote en baisse » si `dropped`).
  - Les anciens passages « invalidated / expired » disparaissent.

- [ ] **Step 1: Write the failing tests** (dans `pipeline.test.ts`, après `seedTwoSyncs` + ingestion marchés de Task 4 à 07:30 et 13:30 la veille)
- `creates one ticket per reachable tier for tomorrow`: `created ≥ 1`, tous les tickets ont `match_day` = demain, catégories ⊂ `TIERS`.
- `is idempotent per match day`: second appel → `skipped: "already-generated"`, nombre de tickets inchangé, aucune ligne modifiée (`generated_at` identiques).
- `does nothing before 13:00 UTC`: appel à 08:00 → `skipped: "before-13h"`, 0 ticket.
- `stores probability and featured`: `estimated_probability` entre 0 et 1, 2 ou 3 tickets `featured` parmi les catégories `2/5/10`.

- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/integration/pipeline.test.ts`, FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run to verify they pass** — `npx vitest run`, PASS.

- [ ] **Step 5: Commit** — `git commit -m "Combinés figés par journée, générés la veille à 13 h"`

---

### Task 6: Rattachement football-data à l'avance et règlement définitif

**Files:**
- Create: `scripts/lib/settle-tickets.ts`
- Modify: `scripts/lib/results.ts`, `scripts/ingest-results.ts`, `tests/integration/results.test.ts`

**Interfaces:**
- Consumes: `settleLeg`, `ticketStatus` (Task 2).
- Produces:
  - `ingestResults` rattache aussi les matchs `scheduled` sans `football_data_id` dont le coup d'envoi est dans `[now, now + 48 h]` : il écrit seulement `football_data_id` (et apprend les ids d'équipe comme aujourd'hui), sans changer le statut. **Toujours au plus un appel par ligue** : la plage de dates demandée couvre les deux ensembles. `ResultsOutcome` gagne `linked: number`.
  - `settle-tickets.ts` : `export async function settleTickets(db: Db, now: Date): Promise<{ legs: number; tickets: number }>` — pour chaque `ticket_selections.result is null` dont le match est `finished` (score connu) ou `postponed`/`cancelled` → `settleLeg(..., state)` avec `state` = `finished` ou `void` ; puis chaque ticket `status 'active'` dont toutes les jambes ont un `result` → `result = ticketStatus(...)`, `status = 'settled'`, `settled_at = now`. Un ticket réglé n'est plus jamais touché.
  - `ingest-results.ts` appelle `settleTickets` après `ingestResults` ; `items` = matchs réglés + jambes réglées.

- [ ] **Step 1: Write the failing tests** (`results.test.ts`)
- `links upcoming matches without changing their status`: match dans 20 h → `football_data_id` renseigné, `status` reste `scheduled`, un seul appel `fetchMatches` par ligue (compter les appels du faux client).
- `settles legs and tickets from final scores`: ticket 2 jambes (`totals_2.5 over` sur un 2–1, `btts yes` sur un 1–0) → jambes `won`/`lost`, ticket `lost`, `status 'settled'`.
- `voids the leg of a postponed match`: ticket 2 jambes dont un match `postponed` et l'autre gagné → ticket `won`.
- `never touches a settled ticket`: rejouer `settleTickets` → `settled_at` inchangé.

- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/integration/results.test.ts`, FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run to verify they pass** — PASS.

- [ ] **Step 5: Commit** — `git commit -m "Résultats : rattachement à l'avance et règlement des combinés"`

---

### Task 7: Types, lecture et statut affiché côté application

**Files:**
- Modify: `src/lib/types.ts`, `src/lib/supabase/parse.ts`, `src/lib/data.ts`, `src/lib/formatting.ts`, `src/lib/store.ts`, `src/lib/demo/data.ts` (si besoin), `tests/unit/combos.test.ts` ou nouveau `tests/unit/ticket-status.test.ts`

**Interfaces:**
- Consumes: `MarketKey`, `pickLabel` (Task 2), `settleLeg`, `ticketStatus`, `LegResult` (Task 2), `generateDay`, `TIERS`, `Tier` (Task 3), `getLiveBoard`, `LiveMatch` (`src/lib/live.ts`).
- Produces:
  - `types.ts` : `TicketCategory` supprimé ; `Leg` gagne `market: MarketKey` (le ticket perso du constructeur met `"h2h"`) et `outcome: string` ; `Ticket` devient `{ id; tier: Tier; legs: (Leg & { rationale: string; result: LegResult | null; kickoffAt: string; footballDataId: string | null; matchState: MatchState; homeScore: number | null; awayScore: number | null })[]; totalOdds; probability: number | null; featured: boolean; result: LegResult | null; matchDay: string | null; generatedAt; methodologyVersion }`.
  - `store.ts` : lecture des anciens favoris/tickets locaux sans `market` → `market: "h2h"` par défaut.
  - `data.ts` : `export async function getTicketBoard(): Promise<{ source; now; tickets: DisplayTicket[] }>` avec `export interface DisplayTicket extends Ticket { status: LegResult; legStatus: LegResult[]; live: (LiveMatch | null)[] }` — `status` = `result` en base s'il existe, sinon `ticketStatus(legStatus)` où chaque `legStatus` = `result` en base, sinon `settleLeg` sur le `LiveMatch` de même `footballDataId` (état `live`/`paused` → `live`, `finished` → `finished`, `off` → `void`), sinon `pending`. `getTicketBoard` n'est **pas** dans le même `"use cache"` que `snapshot()` : il combine `snapshot()` (minutes) et `getLiveBoard()` (1 min).
  - Mode démo : tickets construits par `generateDay` à partir des cotes 1N2 de démonstration (sélections `h2h` uniquement).
  - `formatting.ts` : `tierLabel(t: Tier)` → `"~2"`, `"~1 000"`, `"~20 000 et +"` ; `categoryLabel`, `categoryTarget` supprimés.

- [ ] **Step 1: Write the failing test** — `ticket-status.test.ts` : la fonction pure `displayStatus(ticket, liveById: Map<string, LiveMatch>)` exportée par `src/lib/combos/display.ts` (à créer, utilisée par `getTicketBoard`) :
  - jambe réglée `lost` en base → ticket `lost` même si le direct dit autre chose ;
  - jambe sans résultat, direct `live` 1–1, `btts yes` → `won` ; autre jambe `pending` → ticket `pending` ;
  - ticket avec `result` en base `won` → `won`, direct ignoré.
- [ ] **Step 2: Run to verify it fails** — FAIL.
- [ ] **Step 3: Implement** `display.ts`, types, parse (Zod : `market` ∈ `MarketKey`, `tier` = nombre de `TIERS` parsé depuis `category`), `getTicketBoard`, store, formatting.
- [ ] **Step 4: Run** `npx vitest run && npm run typecheck` — PASS (corriger tous les usages signalés par `tsc` : `ticket-card.tsx`, `slip-builder.tsx`, `favorites-view.tsx`, `slip-bar.tsx`, `about/page.tsx`, `combos/page.tsx` ; dans cette tâche, seulement pour compiler — le rendu change en Task 8).
- [ ] **Step 5: Commit** — `git commit -m "Application : combinés multi-marchés et statut en direct"`

---

### Task 8: Interface `/combos`

**Files:**
- Create: `src/components/combos/tickets-browser.tsx` (client)
- Modify: `src/app/combos/page.tsx`, `src/components/combos/ticket-card.tsx`, `src/app/about/page.tsx`

**Interfaces:**
- Consumes: `getTicketBoard`, `DisplayTicket` (Task 7), `tierLabel`, `pickLabel`, `TIERS`, `AutoRefresh` (`src/components/live/auto-refresh.tsx`).

- [ ] **Step 1: Build the page**
  - `page.tsx` : titre + phrase d'introduction (combinés de demain générés chaque jour vers 13 h UTC, paliers ~2 à ~20 000 et +, probabilité selon le marché) ; section « À la une » (tickets `featured` de la dernière `matchDay`) ; section « Validés » épinglée (tickets `status === "won"`, plus récents d'abord, 6 au plus avec « Voir tout » qui sélectionne l'onglet Validés) ; puis `<TicketsBrowser tickets={…} />` ; `<AutoRefresh seconds={60} />` seulement si une jambe a un match `live`.
  - `tickets-browser.tsx` : onglets **En cours / Validés / Perdus** (`pending` / `won` / `lost` ; `void` va dans Perdus avec la pastille Annulé), puces de palier « Tous » + `TIERS` via `tierLabel`, état vide par filtre (« Aucun combiné ~500 validé pour l'instant. »).
  - `ticket-card.tsx` : titre `Combiné {tierLabel}`, cote totale en grand (inchangé), « Probabilité selon le marché, si les matchs étaient indépendants : X % » (ou « < 0,1 % »), pastille de statut, et pour chaque jambe : `matchLabel`, `pickLabel`, cote, pastille de statut de jambe, score si `live` ou `finished`. Garder les actions existantes (copier, ajouter au ticket, enregistrer).
  - `about/page.tsx` : paragraphe « Combinés » réécrit (sources API-Football + The Odds API, marchés, paliers et fourchette ±15 %, génération la veille, combinés figés, règlement anticipé, probabilité selon le marché) ; garder la phrase sur l'absence de modèle validé.
- [ ] **Step 2: Verify in the browser** — `npx next dev -p 3123`, mode démo (`NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npx next dev -p 3124`) et données réelles ; capture mobile 390×844 en clair et sombre de `/combos` ; onglets et puces cliquables au clavier (`aria-pressed`), aucun débordement horizontal.
- [ ] **Step 3: Run** `npm test && npm run typecheck && npm run lint` — PASS.
- [ ] **Step 4: Commit** — `git commit -m "Combinés : à la une, validés, onglets et filtre par palier"`

---

### Task 9: Planification, documentation, mise en production

**Files:**
- Modify: `.github/workflows/pipeline.yml`, `docs/ingestion.md`, `docs/database.md`, `docs/deployment.md`, `README.md`

- [ ] **Step 1: Workflow** — `timeout-minutes: 20` ; nouvelle étape « Ingest markets » entre « Ingest odds » et « Analyse matches », `if: ${{ !cancelled() }}`, `run: node scripts/ingest-markets.ts`, `env: API_FOOTBALL_KEY: ${{ secrets.API_FOOTBALL_KEY }}` (le script décide lui-même de la fenêtre horaire).
- [ ] **Step 2: Docs** — `ingestion.md` : section API-Football (fenêtres 07:15 / 13:15, budget 90/jour, rattachement, bookmaker de référence), section combinés réécrite ; `database.md` : nouvelles colonnes et `ui_tickets` ; `deployment.md` : secret `API_FOOTBALL_KEY` et contrôle du compteur (`select sum(credits_used) from sync_runs where job='ingest-markets' and started_at >= current_date`) ; `README.md` : lignes de décision « Combinés » et « Marchés ».
- [ ] **Step 3: Full verification** — `npm test && npm run typecheck && npm run lint && npm run build`, tout PASS.
- [ ] **Step 4: Commit and push** — `git commit -m "Pipeline : marchés API-Football, documentation"` puis `git push` (Netlify redéploie).
- [ ] **Step 5: Production** — appliquer la migration de Task 1 sur Supabase (même méthode que la phase 7 : transaction + inscription dans `supabase_migrations.schema_migrations`) ; ajouter `API_FOOTBALL_KEY` à `.env.local` et au secret GitHub **avec l'accord de l'utilisatrice** ; lancer `npm run markets` dans une fenêtre autorisée et vérifier le compteur de requêtes ; vérifier `/combos` en production après la première génération de 13:15 UTC.
