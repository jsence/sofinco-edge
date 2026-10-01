# Investigation — tag « Généré par SofincoEdge » (Décryptage Prêt Personnel)

**Date :** 2026-09-14  
**Statut :** identification terminée — **aucune suppression en base** (en attente de validation métier).

## Synthèse

Les 3 cartes signalées sur **Prêt Personnel** correspondent exactement aux **3 lignes `tendances`** du fichier de seed de référence `seed-data.json`, toutes avec `status: "genere"`. Ce statut déclenche le badge UI « Généré par SofincoEdge » (`renderDiffStatusBadge` dans `index.html`). Il n’y a **pas** de table `decryptage` en base : le Décryptage produit est rendu depuis **`tendances`** (section sous l’onglet **Différenciateurs** sur les pages produit ; onglet **Décryptage** dédié sur les 5 pages catégorie).

Ce contenu est du **jeu de démo / référence seed**, pas un import mensuel sourcing : pas de date de publication, pas de source URL sur les tendances (champs non prévus pour ce type de ligne).

## Liste complète (référentiel repo)

| # | Table | Titre | `produit_id` | `categorie` | Page d’affichage |
|---|--------|--------|--------------|-------------|------------------|
| 1 | `tendances` | Mouvement sur les taux promo | `pb` | — | Prêt Personnel → Différenciateurs → section **Décryptage** |
| 2 | `tendances` | Accélération du 100 % digital | `pb` | — | Idem |
| 3 | `tendances` | Guerre des durées maximales | `pb` | — | Idem |

**Autres pages :** dans `seed-data.json`, **aucune** autre tendance `status=genere` et **aucun** différenciateur `status=genere`. Les 5 onglets catégorie Décryptage ne reçoivent des tendances seed que si des lignes avec `categorie` sont importées — le seed actuel n’en contient pas.

## Origine technique

1. **`seed-data.json`** — section `tendances` (3 entrées, `produit_id: "pb"`, `status: "genere"`).
2. **`scripts/seed-supabase.mjs`** — pour chaque produit, `DELETE tendances WHERE produit_id` puis `INSERT` depuis le seed (`npm run seed:supabase` / `verify:seed`).
3. **Tests E2E** — `scripts/test-decryptage-import.mjs` et similaires créent des marqueurs `TEST DECRYPTAGE IMPORT …` (nettoyage prévu), **pas** ces trois titres.
4. **Import Excel** — la feuille `DECRYPTAGE` peut aussi poser `status` à `genere` / `généré` ; à vérifier en base prod via SQL ci-dessous.

## Vérification base (à faire côté équipe — pas exécutée sur la prod par l’agent)

```sql
SELECT id, produit_id, categorie, titre, status, portee, created_at
FROM tendances
WHERE status = 'genere'
ORDER BY produit_id, categorie, titre;

SELECT id, produit_id, acteur_id, status
FROM differenciateurs
WHERE status = 'genere'
ORDER BY produit_id, acteur_id;
```

## Suppression proposée (après validation explicite uniquement)

```sql
DELETE FROM tendances
WHERE status = 'genere'
  AND produit_id = 'pb'
  AND titre IN (
    'Mouvement sur les taux promo',
    'Accélération du 100 % digital',
    'Guerre des durées maximales'
  );
```

**Suivi repo recommandé après validation :** retirer les 3 objets de `seed-data.json` et mettre à jour `meta.counts.tendances` pour éviter qu’un prochain `seed:supabase` ne les réinjecte.

## Script local

```bash
node scripts/audit-genere-sofincoedge-content.mjs
# Optionnel (Supabase TEST uniquement) :
node scripts/audit-genere-sofincoedge-content.mjs --supabase-test
```
