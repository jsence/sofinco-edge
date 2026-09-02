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

## Migrations manuelles (SQL Editor)

Si une migration n'a pas été appliquée par l'intégration GitHub, exécutez le fichier concerné dans **SQL Editor** du dashboard Supabase.

**À la une** (`20250902160000_actualites_a_la_une.sql`) — requis pour la colonne `Une` à l'import Excel et le bloc accueil :

```sql
ALTER TABLE actualites
  ADD COLUMN IF NOT EXISTS a_la_une BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS actualites_single_a_la_une_idx
  ON actualites ((1))
  WHERE a_la_une = true;
```

## Tests E2E et données de production

Les scripts `scripts/test-*.mjs` ciblent la base configurée dans `supabase-config.js`. **Ne pas pointer vers la production** sans base de test dédiée.

- Chaque script nettoie automatiquement les lignes de test en `finally` (préfixe `TEST`, source `example.com`, etc.).
- Nettoyage manuel : `node scripts/cleanup-test-data.mjs` (ajouter `--dry-run` pour lister sans supprimer).

## Tables

`produits`, `acteurs`, `acteurs_produits`, `criteres`, `valeurs`, `promos`, `differenciateurs` (dont `categorie` optionnelle), `tendances` (dont `portee`, `categorie` optionnelle), `actualites` (dont `resume`, `fiabilite`, `acteur_id` optionnel, `categorie`, `a_la_une`), `taux_cr`, `taux_cr_meta`, `historique`, `indicateurs`, `produits_texte_libre`
