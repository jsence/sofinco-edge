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

**Dernière mise à jour** (`20250902210000_app_meta_last_import.sql`) — date du dernier import contributeur (en-tête) :

```sql
-- Voir supabase/migrations/20250902210000_app_meta_last_import.sql
```

## Annulation du dernier import Excel

Table `import_undo_snapshot` (migration `20250902220000_import_undo_snapshot.sql`) : une seule ligne `id='last'` avec le JSON des tables concernées **juste avant** le dernier import.

- Bouton « Annuler le dernier import » dans l'étape Excel contributeur (après un import réussi)
- Un seul niveau de retour arrière ; un nouvel import écrase l'instantané précédent
- **Sans cette migration appliquée sur Supabase**, le bouton reste désactivé avec un message explicite (le code front est déployé mais la table n'existe pas encore)

Appliquer manuellement dans **SQL Editor** si l'intégration GitHub Supabase ne l'a pas fait :

```sql
-- Voir supabase/migrations/20250902220000_import_undo_snapshot.sql
```

Les scripts `scripts/test-*.mjs` **refusent de s'exécuter** sur la base de production (`supabase-config.js`). Utiliser un projet Supabase de test :

1. Copier `supabase-config.test.example.js` → `supabase-config.test.js` (gitignored) et renseigner l'URL + clé anon du projet test
2. Ou exporter `SUPABASE_TEST_URL` + `SUPABASE_TEST_ANON_KEY`

- Chaque script nettoie automatiquement les lignes de test en `finally` (préfixe `TEST`, imports PB minimaux, etc.).
- Nettoyage manuel sur la prod : `node scripts/cleanup-test-data.mjs --dry-run` puis `--apply`

## Tables

`produits`, `acteurs`, `acteurs_produits`, `criteres`, `valeurs`, `promos`, `differenciateurs` (dont `categorie` optionnelle), `tendances` (dont `portee`, `categorie` optionnelle), `actualites` (dont `resume`, `fiabilite`, `acteur_id` optionnel, `categorie`, `a_la_une`), `taux_cr`, `taux_cr_meta`, `historique`, `indicateurs`, `produits_texte_libre`
