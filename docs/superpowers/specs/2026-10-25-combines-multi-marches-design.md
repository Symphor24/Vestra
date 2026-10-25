# Combinés multi-marchés, paliers de cote et suivi en direct — conception

Date : 25/10/2026 · Statut : à valider

## Pourquoi

Aujourd'hui Vestra ne génère presque aucun combiné : le générateur n'accepte que des sélections 1N2 dont la cote a baissé d'au moins 10 %, et il n'a que trois catégories (2–5, 10–50, 100+). Les combinés dont les cotes bougent sont invalidés et disparaissent de l'écran, donc on ne peut jamais juger après coup ce qui a été proposé.

L'utilisatrice veut :
- un large choix de combinés, du très sûr (~2) au très gros (~20 000 et plus), sur plusieurs marchés ;
- 2 à 3 combinés « sérieux » mis en avant ;
- un historique qui ne s'efface jamais, avec le statut de chaque combiné suivi en direct (En cours, Gagné, Perdu) ;
- une section « Validés » épinglée pour l'analyse a posteriori.

Ses mots : « rien n'est impossible » : les gros paliers restent proposés même si leur probabilité est faible.

## Objectifs

1. Marchés : 1N2, Double chance, Plus/Moins de 1,5 / 2,5 / 3,5 buts, Les deux équipes marquent (BTTS).
2. Paliers cibles : ~2, ~5, ~10, ~20, ~50, ~100, ~500, ~1 000, ~5 000, ~20 000+, avec une tolérance de ±15 % autour de la cote visée (le dernier palier n'a pas de borne haute). Aucun plafond artificiel.
3. Pour chaque palier, le combiné **le plus probable selon le marché** qui tombe dans la fourchette, avec le moins de sélections possible. Palier impossible : il reste vide.
4. 2 à 3 combinés « sérieux » : les plus probables des paliers ~2, ~5, ~10, avec un bonus pour les sélections dont la cote baisse.
5. Aucun combiné supprimé. Statut de chaque sélection et de chaque combiné : En cours, Gagné, Perdu (et Annulé si un match est reporté), mis à jour à partir des scores en direct, avec résolution anticipée.
6. Interface : filtre par palier, onglets En cours / Validés / Perdus, section « Validés » épinglée.

## Non-objectifs

- Pas de modèle de prédiction. La seule probabilité affichée est celle qu'impliquent les cotes du bookmaker de référence, marge retirée.
- Pas d'abonnement payant : tout doit tenir dans les offres gratuites (décision de l'utilisatrice).
- Pas de pari, de lien affilié ni de compte utilisateur.
- Pas d'autres championnats que les 5 actuels.

## Anti-objectifs (échec même si « ça marche »)

- Présenter la probabilité du marché comme une prédiction, une certitude ou une « vraie probabilité ». Libellé imposé : « probabilité selon le marché ». L'utilisatrice a écrit « vraie probabilité statistique » ; c'est volontairement reformulé, conformément à la règle du projet (spec §10, README « Probabilité modèle : non affichée »).
- Faire disparaître un combiné de l'historique, ou modifier ses cotes après sa création.
- Dépasser un quota gratuit (The Odds API 500 crédits/mois, API-Football 100 requêtes/jour et 10/min, football-data.org 10/min).
- Afficher les baisses de cote en vert (règle existante : bleu).

## Contraintes et faits vérifiés le 25/10/2026

**API-Football, offre gratuite** (clé `API_FOOTBALL_KEY`, testée) :
- `GET /odds?fixture=<id>` fonctionne sur la saison en cours. Exemple PSG–Lyon : 9 bookmakers ; 1N2, Plus/Moins (id 5), BTTS (id 8), Double chance (id 12) chez 7 d'entre eux, dont Bet365.
- `GET /fixtures?date=YYYY-MM-DD` fonctionne (≈1 200 matchs/jour, nos 5 ligues : ids 39 PL, 140 LaLiga, 135 Serie A, 78 Bundesliga, 61 Ligue 1).
- Refusé : toute requête avec `season` ou `league` (saisons 2022–2024 seulement) ; dates hors de la fenêtre hier/aujourd'hui/demain ; `page` > 3.
- 100 requêtes/jour (remise à zéro 00:00 UTC), 10/minute.
- Conditions commerciales de l'offre gratuite : non vérifiées (site inaccessible à la lecture automatique). À vérifier par l'utilisatrice.

Conséquence : **les cotes multi-marchés ne couvrent que les matchs d’aujourd’hui et de demain**. Vestra récupère celles de demain et construit les combinés la veille (voir §1).

**The Odds API** reste la source du 1N2 et de son historique sur plusieurs jours (inchangée).

**football-data.org** reste la source des scores (direct et final), 10 appels/min, sans plafond journalier connu.

## Ce qui a été décidé (par l'utilisatrice)

- Rester gratuit ; API-Football pour les marchés autres que le 1N2.
- Probabilité = probabilité selon le marché, marge retirée ; les gros paliers sont gardés.
- Liste des marchés, des paliers, ±15 %, une sélection par match, priorité au moins de sélections, 2–3 « sérieux » parmi ~2 à ~10 avec bonus de baisse, historique permanent, résolution anticipée, section Validés épinglée, filtre par palier, onglets En cours / Validés / Perdus.

## Conception

### 1. Ingestion API-Football (`scripts/ingest-markets.ts`, nouveau)

- Une fois par synchro : `fixtures?date=aujourd'hui` et `fixtures?date=demain` (2 requêtes), filtrés sur nos 5 ligues, matchs pas encore commencés.
- Rattacher chaque fixture à une ligne existante de `matches` (créée par The Odds API) avec la même logique que `scripts/lib/results.ts` : coup d'envoi ±15 min et équipe reconnue, sinon les deux équipes dans 36 h ; en cas d'ambiguïté, signaler sans deviner. Enregistrer `matches.api_football_id`. Une fixture sans match correspondant est ignorée et signalée (pas de création de match depuis API-Football : un seul référentiel).
- Puis `odds?fixture=<id>` pour chaque match rattaché, dans la limite du budget (ci-dessous). Stocker dans `odds_snapshots` les marchés retenus, pour le bookmaker de référence du match uniquement.
- **Bookmaker de référence multi-marchés** : Bet365 s'il propose les quatre marchés, sinon le premier bookmaker (ordre stable par nom) qui en propose le plus. Stocké dans `matches.markets_bookmaker`, figé une fois choisi (comparabilité des observations).
- **Budget** : compteur dans `sync_runs` (comme les crédits The Odds API). Plafond 90 requêtes/jour (marge de 10). Pause ≥ 6,5 s entre deux appels (10/min). Priorité aux matchs les plus proches du coup d'envoi ; ceux qui ne rentrent pas dans le budget attendent la synchro suivante.
- **Planning** *(choix de Claude)* : l'ingestion API-Football ne porte que sur les matchs de **demain** (jour J+1), en deux passages :
  - 07:15 UTC : `fixtures?date=demain` puis `odds?fixture` pour chaque match de demain (première observation) ;
  - 13:15 UTC : mêmes matchs, seconde observation (c'est elle qui permet de mesurer une baisse de cote sur tous les marchés), puis génération des combinés de J+1.
  - 18:15 UTC : pas d'appel API-Football.

  Un très gros jour (~30 matchs) coûte 2 × (1 + 30) = 62 requêtes, sous le plafond de 90. Si le budget ne suffit pas, les matchs les plus proches du coup d'envoi passent en premier, et le compteur est journalisé.
- Le timeout du job `pipeline` passe de 10 à 20 minutes (31 appels × 6,5 s ≈ 3,5 min par passage, plus les autres étapes).

Clés de marché et de sélection (communes au stockage, au générateur et au règlement) :

| Marché | `market_key` | `selection_key` |
|---|---|---|
| 1N2 | `h2h` | `home`, `draw`, `away` |
| Double chance | `double_chance` | `1X`, `12`, `X2` |
| Plus/Moins | `totals_1.5`, `totals_2.5`, `totals_3.5` | `over`, `under` |
| BTTS | `btts` | `yes`, `no` |

Le 1N2 des combinés vient du même bookmaker multi-marchés (pour que toutes les jambes d'un match soient comparables). L'historique 1N2 The Odds API continue d'alimenter la page Matchs et les mouvements, sans changement.

### 2. Probabilités

Pour une sélection : probabilité brute = 1/cote ; probabilité selon le marché = brute / somme des bruts **du même marché** chez le même bookmaker × nombre d'issues couvertes par l'ensemble du marché (normalisation proportionnelle, `normalizedProbabilities`). Un marché incomplet (une issue manquante) n'est pas utilisable.

- 1N2, Plus/Moins, BTTS : les issues s'excluent, la somme normalisée vaut 1.
- **Double chance** : 1X, 12 et X2 couvrent chacune deux des trois résultats, donc la somme normalisée vaut **2** (1X + 12 + X2 = 2). Sans ce facteur, chaque probabilité serait divisée par deux. *(Choix de Claude : on normalise la Double chance sur ses propres cotes plutôt que de la déduire du 1N2, pour que chaque sélection soit jugée sur le prix réellement proposé.)* Test obligatoire : pour un marché sans marge, 1X = P(1) + P(N).

Probabilité d'un combiné = produit des probabilités de ses sélections, présentée « si les matchs étaient indépendants » (règle existante, spec §4.5).

### 3. Générateur (`src/lib/combos/generate.ts`, remplacé ; `METHODOLOGY_VERSION` → 1.0.0)

Entrée : les matchs **d'une seule journée** J+1 (date UTC du coup d'envoi), avec leurs cotes multi-marchés de la seconde observation (13:15). Un combiné ne mélange jamais deux journées. *(Choix de Claude.)* Toutes les sélections valides de ces matchs sont candidates, pas seulement les baisses.

Pour chaque palier T : trouver l'ensemble de sélections qui
- respecte : une sélection au plus par match ; deux sélections ne partagent pas une équipe (règle existante de corrélation) ; au moins 2 sélections ; cote totale dans [0,85 T ; 1,15 T] (palier 20 000+ : ≥ 17 000, sans borne haute) ;
- maximise la probabilité selon le marché du combiné ; à probabilité quasi égale (écart < 1 % relatif), préfère le moins de sélections, puis la marge cumulée la plus faible.

Déterministe (mêmes données → même combiné, départage stable par id de match puis clé de sélection). Doit tourner en moins d'une seconde pour ~60 matchs × ~15 sélections ; une recherche exacte n'est pas exigée (recherche en faisceau ou glouton amélioré accepté), mais le test doit montrer qu'elle trouve l'optimum sur de petits cas vérifiables à la main.

« Sérieux » : choisis **une seule fois**, au moment où la journée est générée, et stockés (`tickets.featured`), jamais recalculés. Parmi les combinés des paliers ~2, ~5, ~10, score = probabilité du combiné × (1 + 0,05 × nombre de sélections dont la cote a baissé entre l'observation de 07:15 et celle de 13:15, chez le même bookmaker). Les 2 meilleurs scores sont mis en avant ; un 3e s’il atteint au moins 80 % du score du 2e. *(Coefficient 0,05 et seuil 80 % : choix de Claude, à régler à l'usage.)*

Justification affichée par sélection (fait observé, pas d'opinion) : marché, cote, probabilité selon le marché, et la baisse le cas échéant.

### 4. Persistance (`scripts/lib/combos.ts`)

- **Un combiné par palier et par journée de matchs**, tous créés en une seule fois par la génération de 13:15 la veille. Contrainte d'unicité en base : `(match_day, category)`. Une fois créé, un combiné est **figé** : ni modifié, ni invalidé, ni supprimé. Une journée déjà générée n'est jamais regénérée, même si le script est relancé. Un palier vide ce jour-là le reste. *(Choix de Claude : on borne le volume à ≤ 10 combinés par jour, on respecte « ne pas écraser les premiers combinés générés », et on construit chaque journée sur des données complètes plutôt que partielles.)*
- Nouvelle colonne `tickets.match_day date not null` (pour les nouveaux combinés).
- Les anciens statuts `invalidated` et `expired` ne sont plus attribués. La table `tickets` de production est vide au 25/10/2026 : il n’y a aucun ancien combiné à reprendre.
- `tickets.category` devient le palier (`2`, `5`, … `20000`) ; `tickets.featured boolean` marque les « sérieux » ; `tickets.estimated_probability` est renseignée.

### 5. Règlement et statuts

Fonction pure `settleLeg(market, selection, homeGoals, awayGoals, finished)` → `pending | won | lost` :
- Plus de n,5 : gagné dès que total > n ; perdu seulement au coup de sifflet final.
- Moins de n,5 : perdu dès que total > n ; gagné au final.
- BTTS oui : gagné dès que les deux équipes ont marqué ; perdu au final. BTTS non : perdu dès que les deux ont marqué ; gagné au final.
- 1N2, Double chance : au final seulement.
- Match reporté, annulé ou suspendu définitivement : `void` ; la sélection est retirée du calcul (cote 1) et le combiné continue avec les autres. *(Choix de Claude, règle usuelle des bookmakers.)*

Statut d'un combiné : Perdu dès qu'une sélection est perdue ; Gagné quand toutes sont gagnées ou annulées (au moins une gagnée) ; Annulé si toutes sont annulées ; sinon En cours.

**En direct** : rendu côté serveur à partir du tableau de scores existant (`getLiveBoard`, football-data, cache 1 min). Pour relier une sélection à un score, il faut le `football_data_id` du match **avant** le coup d'envoi : `scripts/ingest-results.ts` rattache désormais aussi les matchs à venir de la fenêtre aujourd'hui/demain (même algorithme de rapprochement, même appel par ligue, au plus 5 appels). Rien n'est écrit en base pendant le direct.

**Définitif** : `scripts/ingest-results.ts`, quand il enregistre un score final, règle les sélections concernées (`ticket_selections.result`) et les combinés (`tickets.result` : `won | lost | void`, `settled_at`). Un combiné ne change plus de statut une fois réglé.

**Statut affiché** *(choix de Claude)* : le résultat en base s'il existe, sinon le statut calculé en direct par la même fonction `settleLeg` sur les scores du jour. Les onglets, la section « Validés » et les cartes utilisent tous ce statut affiché, calculé à un seul endroit côté serveur, pour qu'ils ne se contredisent jamais. Un combiné gagné à 17:00 apparaît donc tout de suite dans « Validés », puis le règlement en base le confirme à la synchro suivante. Limite connue : `getLiveBoard` ne couvre que la journée UTC en cours, donc un match qui finit après minuit UTC attend le règlement en base.

### 6. Base de données (nouvelle migration)

- `matches` : `api_football_id bigint unique`, `markets_bookmaker text`.
- `tickets` : `category` sans contrainte d'énumération (texte ou entier du palier), `featured boolean not null default false`, `result text check (result in ('won','lost','void'))`, `settled_at timestamptz`.
- `ticket_selections` : `result text check (result in ('won','lost','void'))` ; `market_key` accepte les nouvelles clés.
- `ui_tickets(p_now)` renvoie tout l'historique (pagination : 30 jours glissants par défaut), avec `football_data_id`, palier, `featured`, résultats. RLS et grants comme l'existant ; tests en rôle `anon` comme `tests/integration/ui-read.test.ts`.
- Rétention : `prune_old_data()` ne touche jamais `tickets` ni `ticket_selections`. Les `odds_snapshots` des nouveaux marchés suivent la règle existante (premier + dernier prix après 30 jours).
- Volume : ≤ 10 combinés/jour × ~6 sélections → négligeable.

### 7. Interface (`/combos`)

- En haut : les 2–3 « sérieux » du jour.
- Section **Validés** épinglée : derniers combinés gagnés (les plus récents d'abord).
- Onglets **En cours / Validés / Perdus** sur l'historique, filtre par palier (puces ~2 … ~20 000+, plus « Tous »).
- Chaque combiné : palier, cote totale, probabilité selon le marché (libellé exact « Probabilité selon le marché, si les matchs étaient indépendants »), statut, et pour chaque sélection : match, marché en clair (« Plus de 2,5 buts »), cote, statut (pastille), score en direct si le match est en cours.
- Statuts : Gagné = accent lime en pastille (cohérent avec « Favori », ce n'est pas une baisse de cote) ; Perdu = `danger` ; En cours = neutre avec point animé si un match est en direct ; Annulé = `muted`.
- La page se rafraîchit chaque minute (composant `AutoRefresh` existant) quand un combiné a un match en cours.
- `TicketCard` et `SlipBuilder` existants sont adaptés (marché en clair, statut) plutôt que réécrits.
- Page « Sources et méthodologie » : mise à jour (API-Football, marchés, paliers, règle de probabilité, règlement).

## Laissé au constructeur

- L'algorithme exact de recherche du combiné optimal (dans les contraintes ci-dessus).
- La forme précise des composants et des requêtes SQL.
- Le découpage en tâches et l'ordre de livraison.

## Vérification attendue

- Tests unitaires : probabilités par marché, générateur (fourchette, une sélection par match, corrélation d'équipes, palier vide, optimum sur petits cas, déterminisme), `settleLeg` (tous les marchés, anticipations, report), statut du combiné.
- Tests d'intégration (PGlite) : migration, ingestion API-Football rejouée sur des réponses enregistrées, budget de requêtes respecté, combinés figés sur deux générations successives, règlement par le script de résultats, `ui_tickets` en rôle `anon`.
- Vérification dans le navigateur (mobile, clair et sombre) de `/combos`.
- Un premier passage réel de l'ingestion API-Football, en surveillant le compteur de requêtes.
