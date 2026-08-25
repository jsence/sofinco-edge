# Import `taux_cr` — colonnes attendues

## Table `taux_cr`

| Colonne | Type | Description |
|---------|------|-------------|
| `acteur_id` | TEXT (FK `acteurs`) | Identifiant acteur (résolu depuis la colonne **Acteur** à l'import) |
| `produit_nom` | TEXT | Nom commercial de l'offre côté concurrent (ex. `Facelia`, `Provisio`) |
| `categorie` | TEXT | `bancaire` ou `financiere` |
| `rows` | JSONB | Tableau de lignes par sous-tranche (voir ci-dessous) |
| `commentaire` | TEXT | Note libre optionnelle |

Contrainte d'unicité : `(acteur_id, produit_nom)`.

### Structure `rows[]`

Chaque élément :

| Champ | Type | Description |
|-------|------|-------------|
| `tranche` | string | Libellé sous-tranche (ex. `De 1 € à 1 500 €`) |
| `b1` | number \| null | Taux décimal tranche 0–3 000 € (ex. `0.1695` = 16,95 %) |
| `b2` | number \| null | Taux tranche 3 000–6 000 € |
| `b3` | number \| null | Taux tranche > 6 000 € |
| `b1v`, `b2v`, `b3v` | number \| null | Variation vs période précédente (optionnel) |

## Table `taux_cr_meta`

| Colonne | Description |
|---------|-------------|
| `id` | Identifiant produit (`cr`, `pb`, `rac` selon périmètre) |
| `updated_at` | Date de mise à jour affichée |
| `prev_date` | Date période précédente (comparaison) |
| `usure` | JSON plafonds légaux `[{ id: b1\|b2\|b3, label, taux }]` |

## Onglets Excel attendus (import contributeur)

Feuilles reconnues : `TAUX_PB`, `TAUX_CR`, `TAUX_RAC`.

En-têtes (ligne 1, insensibles à la casse) :

- **Acteur** — nom affiché (ex. `Cetelem`)
- **Produit** ou **Produit nom** — valeur `produit_nom`
- **Catégorie** / **Categorie** — `bancaire` ou `financiere`
- **Sous-tranche** / **Tranche** — libellé tranche
- **0 – 3 000 €** ou **b1** — taux tranche 1 (% ou décimal)
- **3 000 – 6 000 €** ou **b2**
- **> 6 000 €** ou **b3**

L'import Excel existant (PB, CR, … + PROMOS + DIFFERENCIATEURS) n'est pas modifié : les feuilles taux sont traitées en complément via `syncTauxCrFromImport`.
