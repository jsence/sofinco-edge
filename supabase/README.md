# Supabase — SofincoEdge

## Configuration

1. Dashboard Supabase → **Project Settings → API**
2. Copier **Project URL** et **anon public key**
3. Renseigner `supabase-config.js` à la racine du repo

## Déploiement du schéma

L'intégration GitHub Supabase applique automatiquement les fichiers dans `supabase/migrations/`.

En local (avec CLI connectée) :

```bash
npx supabase db push
```

## Seed des données

Les données de référence sont dans `seed-data.json` à la racine du repo. Pour (re)peupler une base Supabase :

```bash
npm install
npm run verify:seed
SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... npm run seed:supabase
```

Variables : `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (recommandé) ou `SUPABASE_ANON_KEY`.

## Tables

`produits`, `acteurs`, `acteurs_produits`, `criteres`, `valeurs`, `promos`, `differenciateurs`, `tendances`, `actualites`, `taux_cr`, `taux_cr_meta`
