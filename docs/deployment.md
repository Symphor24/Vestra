# Déploiement (Netlify) et maintenance

Configuration : `netlify.toml` (build `npm run build`, Node 24). Netlify détecte Next.js et applique son adaptateur tout seul ; ne pas ajouter `@netlify/plugin-nextjs` à la main. Cache Components et PPR sont pris en charge (doc Netlify, vérifiée le 25/10/2026).

**Site** : https://vestra-official.netlify.app · projet Netlify `vestra-official` (compte `jitoua81`), variables `NEXT_PUBLIC_*` déjà définies.

## Mise en ligne (une fois)

1. Netlify > *Add new project* > *Import an existing project* > GitHub > `Symphor24/Vestra`, branche `main`. Laisser les réglages de build proposés : ceux de `netlify.toml` priment.
2. **Avant le premier déploiement**, *Project configuration > Environment variables* :

   | Variable | Valeur |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé `anon` |

   Elles sont intégrées au code au moment du build : si elles manquent, le site affiche les données fictives, et il faut relancer un déploiement après les avoir ajoutées (*Deploys > Trigger deploy*).
   **Ne jamais ajouter** `DATABASE_URL` ni les clés d'API sur Netlify : le site n'en a pas besoin, et seules les tâches GitHub écrivent en base.
3. Vérifier sur l'URL `*.netlify.app` qu'aucun bandeau « données fictives » n'apparaît.

Chaque push sur `main` redéploie le site. Les pages se renouvellent seules au bout de quelques minutes (`cacheLife("minutes")`), donc une synchro ne demande pas de redéploiement.

## Ce qui tourne tout seul

| Quoi | Quand | Où regarder |
|---|---|---|
| Synchro résultats + cotes + analyse + combinés | 07:15, 13:15, 18:15 UTC | GitHub > *Actions > Odds pipeline* ; table `sync_runs` |
| Sauvegarde chiffrée | lundi 03:30 UTC | GitHub > *Actions > Backup database* > artefacts (90 jours) |
| Nettoyage (`prune_old_data`) | fin de chaque synchro | taille de la base dans Supabase > *Database* |
| Site | à chaque push sur `main` | Netlify > *Deploys* |

## Contrôles réguliers

- **Chaque semaine** : la dernière exécution des deux workflows est verte ; le site n'affiche pas l'alerte « données plus actualisées ».
- **Chaque mois** : crédits The Odds API restants (`select credits_remaining from sync_runs order by id desc limit 1`), qui doivent rester au-dessus de ~15 par jour restant ; taille de la base, très en dessous de 500 Mo.
- **Tous les 2 mois** si le dépôt est public : GitHub coupe les tâches planifiées après 60 jours sans commit. Un e-mail prévient, et on les réactive dans *Actions*.

## Pannes courantes

| Symptôme | Cause probable | Action |
|---|---|---|
| Workflow en échec sur `Variables d'environnement invalides` | secret manquant ou mal nommé | *Settings > Secrets* (voir [ingestion.md](ingestion.md#mettre-en-place-sur-github)) |
| `ENOTFOUND postgres.<ref>` | mot de passe non encodé dans `DATABASE_URL` | encoder avec `encodeURIComponent` (voir [database.md](database.md)) |
| Synchros refusées en fin de mois | plafond de crédits atteint (lancements manuels en trop) | attendre le mois suivant ; ne pas relever le plafond au-delà du quota du compte |
| Site figé sur d'anciennes données | projet Supabase en pause, ou synchros en échec | Supabase > *Restore project* ; lire le dernier `sync_runs.error` |
| Site en données fictives | variables `NEXT_PUBLIC_*` absentes au build | les ajouter sur Netlify puis *Trigger deploy* |

## Changer le schéma

Ajouter une migration dans `supabase/migrations/`, la tester (`npm test`), puis `npx supabase db push`. Les trois premières migrations sont déjà inscrites dans le suivi du CLI et ne seront pas rejouées.
