# Doc de passation — SofincoEdge

## 1. Accès

| Élément | Détail |
|--------|--------|
| **URL du site (déployé)** | **https://jsence.github.io/sofinco-edge/** |
| **URL obsolète** | `https://jsence.github.io/sofinco-edge-v2/` → **404** (ancien chemin Pages) |
| **Code d’accès site** (première visite, hors localhost) | `EDGE-2026-SFC` — vérification SHA-256 dans `js/access-gate.js` ; mémorisé dans `localStorage` (`sofinco_edge_gate_v1`). Navigation privée → code redemandé. |
| **Dépôt GitHub** | [jsence/sofinco-edge](https://github.com/jsence/sofinco-edge) (branche `main`) |
| **Déploiement** | Push sur `main` → workflow **Deploy SofincoEdge to Pages** (`.github/workflows/deploy-pages.yml`) ; homepage du dépôt = URL ci-dessus |
| **Base Supabase** | Projet lié à `supabase-config.js` (racine, copié dans l’artefact Pages). Clé **anon / publishable** côté client ; droits réels = RLS Supabase. |

### Où sont les identifiants

| Secret / config | Où le trouver | Ne jamais |
|-----------------|---------------|-----------|
| URL + clé anon (site) | `supabase-config.js` (repo + déploiement Pages) | Commiter la **service role** |
| Clé **service role** (seed, scripts admin) | Dashboard Supabase → API ; `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` pour `npm run seed:supabase` | Mettre dans le repo ni dans Pages |
| Projet Supabase **de test** (scripts `scripts/test-*.mjs`) | `supabase-config.test.js` (modèle : `supabase-config.test.example.js`, non versionné) ou `SUPABASE_TEST_URL` + `SUPABASE_TEST_ANON_KEY` | Exécuter import/undo de test sur la prod |
| **Code espace contributeur** | Transmis **hors dépôt** (canal sécurisé) ; configuré dans le code source de `index.html` — ne pas documenter dans ce fichier | Publier dans un doc versionné |

**Développement local** : servir `index.html` en HTTP ; gate site **inactive** sur `localhost` / `127.0.0.1`. Test gate : `?enforceAccessGate=1`.

---

## 2. Les 3 règles non négociables

1. **Rien des prestataires sous contrat non-IA** (Galitt, Squirel, ADNews, Nexton) ne passe par une IA. **Sémaphore** fait exception, toujours via **synthèse retravaillée**, jamais donnée brute copiée.
2. **Aucune donnée n’est inventée.** Une case vide vaut mieux qu’une valeur plausible non sourcée.
3. **L’IA rassemble, l’humain valide et publie.** Aucune écriture en production sans validation explicite.

---

## 3. Fonctionnement général

- **Menu** : Accueil · 5 catégories (Produit & Tarification, Commercial & Communication, Stratégie & Corporate, RSE & Juridique, Innovation & Sécurité) · 5 produits (PB, CR, NxCB, RAC, Carte).
- **Pages catégorie** : onglets **Actualités**, **Différenciateurs**, **Décryptage** — filtres **Acteur**, **Produit** ; **dates** sur Actualités uniquement.
- **Pages produit** : Tableau comparatif, Différenciateurs, Promos, Actualités ; exports Excel / Word selon l’écran.
- **Espace contributeur** : code dédié (hors doc) → hub → import **Excel** ou **JSON groupé** ; **À la une** ; annulation d’import (**5** dernières versions, FIFO).

**Hors menu** : vues `actus` et `indicateurs` (code uniquement).

---

## 4. Import Excel — règles clés

### Contenu mensuel type

- **Cœur métier** : onglets **`ACTUALITES`**, **`DIFFERENCIATEURS`**, **`DECRYPTAGE`**.
- **Classeur contributeur complet** (aide modale Excel) : `PB`, `CR`, `NxCB`, `RAC`, `TAUX_PB`, `TAUX_CR`, `TAUX_RAC`, `PROMOS`, `DIFFERENCIATEURS`, `DECRYPTAGE`, `ACTUALITES`.

### Dates

- **Usage recommandé** : `YYYY-MM-DD` dans Excel.
- L’import accepte aussi `JJ/MM/AAAA` et certaines dates série Excel ; en cas de doute, privilégier l’ISO.

### Catégorie vs produit

- Colonnes **`Categorie` / `Catégorie`** sur ACTUALITES, DIFFERENCIATEURS, DECRYPTAGE.
- Slugs : `produit_tarification`, `commercial_communication`, `strategie_corporate`, `rse_juridique`, `innovation_securite`.
- **Catégorie valide renseignée → elle prime ; ne pas remplir aussi `Produit`.**
- ACTUALITES : catégorie **et** produit vides → ligne **rejetée**.
- Slug invalide → ligne ignorée, import poursuivi.

### ACTUALITES (colonnes principales)

`Date`, `Acteur`, `Type`, `Produit` (si pas de catégorie), `Titre`, `Résumé` / `Resume`, `Source`, `Impact`, `Fiabilité`, option **`Une`** (Oui/Non ; une seule en base ; si plusieurs Oui, la **dernière** l’emporte).

### PROMOS

- Pour **chaque produit** présent dans l’onglet `PROMOS`, les promos en base de ce produit sont **supprimées puis remplacées** à l’import.
- **Toujours la liste complète** des acteurs actifs pour le produit.

### Taux

- Colonnes et feuilles : **`docs/taux-cr-import.md`**.

### Références repo

- Migrations : `supabase/migrations/`, `supabase/README.md`
- Aide intégrée : modale contributeur → Excel
- Seed : `seed-data.json`, `npm run seed:supabase`

---

## 5. Sourcing mensuel — méthode en 3 étapes

1. Sourcing consolidé (web + export Sémaphore), règles prestataires respectées.
2. Rédaction Différenciateurs / Décryptage **hors Excel** → validation métier avant classeur.
3. Génération Excel, contrôle final, dépôt contributeur après validation explicite.

---

## 6. Comment demander une modification à Cursor

1. **Contexte**
2. **Ce qu’il faut faire**
3. **Contraintes strictes** (ne rien casser, pas de test/écriture prod, branche `cursor/<nom>-c209` + PR, pas de merge auto)
4. **Vérification finale obligatoire** (preuve : tests, captures — pas seule la relecture de code)

Tests locaux : `scripts/test-*-ui.mjs` sur `127.0.0.1` ; import / undo réels → Supabase de test (`supabase-config.test.js`).

---

## 7. Points connus (pas de chantier prévu)

| Sujet | État |
|-------|------|
| Table **`indicateurs`** | Vide ; pas d’import contributeur prévu |
| **Tableau comparatif** / **Promos** (produits) | Alimentation pas encore régulière |
| Vues **`actus`** / **`indicateurs`** | Code seulement, pas dans le menu |

---

## 8. En cas de bug apparent

1. Migration SQL appliquée dans Supabase ? (`supabase/README.md`, ex. `a_la_une`, `import_undo_snapshot`.)
2. PR **mergée** et workflow Pages **vert** sur `main` ?
3. Cache / navigation privée (code d’accès site).
4. Lignes ignorées à l’import : message post-import + motif (catégorie, produit, etc.).

---

## 9. Pour les contributeurs techniques (IT)

Cette section complète les §1 (accès / déploiement) et §6 (demandes de changement). Usage métier (import, contributeur, sourcing) : §§3–5.

### Setup local

**Prérequis**

- **Git**
- **Node.js** (LTS recommandé) + **npm** — requis pour les scripts `scripts/*.mjs` (tests Puppeteer, seed Supabase)
- Un **serveur HTTP statique** (les appels Supabase depuis `file://` ne sont pas supportés)

**Cloner et installer**

```bash
git clone https://github.com/jsence/sofinco-edge.git
cd sofinco-edge
npm install
```

**Lancer le site**

Depuis la racine du dépôt, servir les fichiers statiques (exemples) :

```bash
python3 -m http.server 8080
# ou : npx --yes serve -p 8080
```

Ouvrir `http://localhost:8080/index.html` (ou le port choisi).

- Données runtime : chargement Supabase via `supabase-config.js` (voir ci-dessous).
- Gate d’accès site : **désactivée** sur `localhost` / `127.0.0.1` ; pour la tester en local : `?enforceAccessGate=1` (code transmis hors dépôt, cf. §1).
- Pas de build front : pas de `npm run dev` applicatif.

### Stack technique (résumé)

| Couche | Technologie |
|--------|-------------|
| **Hébergement** | GitHub Pages — workflow `.github/workflows/deploy-pages.yml` sur push `main` (artefact : `index.html`, `supabase-config.js`, `js/`, `.nojekyll`) |
| **Front** | **Vanilla JS** : UI, rendu et logique métier majoritairement dans `index.html` ; modules partagés dans `js/` |
| **CDN** (chargés par `index.html`) | SheetJS (`xlsx-js-style`), docx / jszip / pptxgenjs, Chart.js, Tabler Icons, client `@supabase/supabase-js` |
| **Données** | **Supabase** (PostgreSQL + API REST) ; synchro import / lecture via `js/supabase-data.js` |
| **Tests E2E UI** | Node + **Puppeteer** (`devDependencies`), serveur HTTP local `127.0.0.1` + fixtures `window.__testApplyLoadedData` |

Pas de React/Vue/Webpack : déploiement = copie de fichiers statiques.

### Structure du repo (fichiers clés)

| Chemin | Rôle |
|--------|------|
| `index.html` | Application (HTML, CSS, JS inline : navigation, rendu, import Excel, exports, contributeur) |
| `js/supabase-data.js` | Chargement Supabase, sync import, helpers données |
| `js/import-undo.js` | Instantanés d’annulation d’import (5 niveaux) |
| `js/access-gate.js` | Gate d’accès visiteurs (première visite) |
| `js/actor-domain-defaults.js` | Domaines / favicons acteurs (fallback logos) |
| `supabase-config.js` | URL projet + clé anon (client) — **versionné pour Pages** ; ne pas y mettre la service role |
| `supabase/migrations/` | Schéma SQL versionné (source de vérité) |
| `supabase/README.md` | Config dashboard, seed, migrations manuelles, undo |
| `seed-data.json` | Jeu de référence pour (re)peuplement (`npm run seed:supabase`) |
| `scripts/test-*.mjs` | Tests automatisés (UI, import, undo, etc.) |
| `scripts/test-helpers.mjs` | Garde-fou « pas de tests destructeurs sur la prod » |
| `supabase-config.test.example.js` | Modèle pour la base de **test** E2E |
| `docs/` | Documentation complémentaire (`taux-cr-import.md`, cette passation) |
| `.github/workflows/` | CI Pages |

### Lancer les tests

Après `npm install` :

```bash
# Exemples — UI locale, sans écriture Supabase (fixtures)
node scripts/test-category-filters-ui.mjs
node scripts/test-access-gate-ui.mjs
node scripts/test-contrib-access.mjs
node scripts/test-product-actor-logos-ui.mjs
```

**Tests qui touchent la base** (`test-import-undo.mjs`, `test-actualites-import.mjs`, etc.) :

1. Créer un projet Supabase **dédié aux tests** (jamais la prod métier pour des essais).
2. Copier `supabase-config.test.example.js` → `supabase-config.test.js` (fichier **local**, non versionné) et renseigner URL + clé anon du projet test, **ou** exporter `SUPABASE_TEST_URL` et `SUPABASE_TEST_ANON_KEY`.
3. Appliquer les migrations sur ce projet (`supabase db push` ou SQL Editor, cf. `supabase/README.md`).
4. Lancer le script concerné : `node scripts/test-import-undo.mjs`

Sans config test, `scripts/test-helpers.mjs` (**`assertSafeTestTarget`**) refuse d’exécuter les scripts sensibles contre l’URL de production.

Seed / vérif données de référence :

```bash
npm run verify:seed
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:supabase
```

(La **service role** ne doit passer que par des variables d’environnement locales ou un secret CI — jamais dans le dépôt.)

### Workflow de contribution attendu

1. Partir de `main` à jour : `git pull origin main`.
2. Branche dédiée : `cursor/<description-courte>-c209` (minuscules).
3. Commits clairs ; **aucun push direct sur `main`**.
4. Ouvrir une **Pull Request** (draft ou prête) ; **ne pas merger** sans relecture humaine.
5. Décrire la PR comme pour une demande Cursor (§6) : contexte, changements, contraintes, **preuves** (sortie de tests, captures sur `127.0.0.1`).
6. Après merge : vérifier l’action **Deploy SofincoEdge to Pages** (§8).

Pour une évolution Supabase : PR code **+** fichier dans `supabase/migrations/` ; s’assurer que la migration est appliquée sur le projet cible avant de considérer le bug « corrigé » en prod.

### Accès Supabase (sans exposer les secrets)

| Besoin | Marche à suivre |
|--------|------------------|
| **Contribuer au code** | Accès **GitHub** au dépôt `jsence/sofinco-edge` (mainteneur / owner). |
| **Voir les données / RLS / SQL** | Demander une invitation **Supabase** sur le projet SofincoEdge au responsable technique ou métier. Dashboard → **Project Settings → API** (URL, clé anon, service role réservée aux admins). |
| **Développer en local** | Utiliser `supabase-config.js` déjà présent pour le client anon **ou** une copie locale non commitée si vous pointez vers un fork de test. |
| **Tests automatisés avec écriture** | Projet Supabase **séparé** + `supabase-config.test.js` (cf. ci-dessus). |
| **Seed / maintenance lourde** | Service role fournie **hors git** (gestionnaire de secrets, canal sécurisé) ; commandes documentées dans `supabase/README.md`. |

Ne jamais committer : service role, mots de passe, codes contributeur, codes d’accès site en clair dans la doc.

### Schéma de base

- **Migrations** : `supabase/migrations/*.sql` (ordre chronologique dans le nom de fichier).
- **Documentation opérationnelle** : `supabase/README.md` (tables listées, undo import, colonnes `a_la_une`, `app_meta`, etc.).
- **Compléments métier** : `docs/taux-cr-import.md` pour les feuilles `TAUX_*`.

En cas de décalage prod / code : comparer les migrations appliquées dans le dashboard Supabase avec l’historique git (§8).

---

## Annexe — Recette fonctionnelle (sept. 2026)

Recette automatisée en **local** (`127.0.0.1` + fixtures), sans pilotage de l’URL Pages prod et sans écriture Supabase (import / undo non exécutés sans base de test).

| Zone | Résultat |
|------|----------|
| Navigation menu | OK |
| Filtres catégories | OK |
| Modal actualité | OK |
| Contributeur (UI accès / hub / À la une) | OK ; import + undo en base | non testés sans `supabase-config.test.js` |
| Export Excel / Word | OK |
| Onglets produit PB | OK |
| Code d’accès site | OK |
| Responsive mobile | OK |
