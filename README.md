# JobRadar — version en ligne (100 % gratuite)

Agrégateur d'offres d'emploi avec **comptes synchronisés**, **offres France Travail** (+ sources ouvertes), **générateur de lettres** et **alertes e-mail** sur les nouvelles offres.

## Ce qui est déjà construit et testé
- **Moteur France Travail** : connexion OAuth + recherche filtrée (région / département, triée par date) + normalisation des offres.
- **Comptes** : inscription / connexion (mots de passe chiffrés, sessions), profils, lettres et candidatures **stockés côté serveur** → synchronisés téléphone + PC.
- **Alertes** : un scan repère les nouvelles offres par profil et envoie un e-mail, sans jamais renvoyer deux fois la même offre.

Tests : `npm test` (moteur) et `node test/server.test.mjs` (serveur + alertes) — tout passe.

## Lancer en local
```bash
npm install
cp .env.example .env      # renseigne FT_CLIENT_ID / FT_CLIENT_SECRET (voir francetravail.io)
node server.js            # http://localhost:3000
```

## Déploiement 100 % gratuit (prévu ensemble)
Trois briques gratuites :
1. **Site + comptes + offres** → hébergeur web gratuit (Render/Netlify).
2. **Stockage partagé persistant** → base gratuite (ex. Upstash Redis ou Supabase). Nécessaire pour que le site et le scan voient les mêmes données.
3. **Scan 24/7 + alertes** → **GitHub Actions** (planificateur gratuit, voir `.github/workflows/scan.yml`) + **Brevo** (e-mail gratuit).

France Travail : gratuit. Coût total : **0 €**. Le seul compromis du gratuit : le site peut mettre ~30 s à se réveiller s'il est resté inactif.

> Remarque technique : le stockage JSON par défaut (`lib/store.js`) convient au local et à un hôte avec disque persistant. Pour la combinaison gratuite ci-dessus (site + scan séparés), on branchera le stockage partagé à l'étape déploiement — c'est prévu.

## Fichiers
- `server.js` — serveur web + API
- `lib/francetravail.js` — client API France Travail
- `lib/aggregate.js` — agrégation + filtres
- `lib/locations.js` — régions / départements → codes France Travail
- `lib/scan.js` — scan des nouvelles offres + alertes
- `lib/mailer.js` — envoi Brevo
- `lib/store.js` — stockage
- `public/` — interface (à venir)
- `.github/workflows/scan.yml` — planificateur gratuit
