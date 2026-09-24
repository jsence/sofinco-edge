# Doc de passation — SofincoEdge

## 1. Accès

| Élément | Détail |
|--------|--------|
| **URL du site (déployé)** | **https://jsence.github.io/sofinco-edge-v2/** |
| **URL à ne pas utiliser** | `https://jsence.github.io/sofinco-edge/` → **404** (ancien chemin Pages) |
| **Code d’accès site** (première visite, hors localhost) | `EDGE-2026-SFC` — vérification SHA-256 dans `js/access-gate.js` ; mémorisé dans `localStorage` (`sofinco_edge_gate_v1`). Navigation privée → code redemandé. |
| **Dépôt GitHub** | [jsence/sofinco-edge-v2](https://github.com/jsence/sofinco-edge-v2) (branche `main` ; l’ancien nom `sofinco-edge` redirige vers ce dépôt) |
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
