-- Rattrapage categorie NULL sur actualites (Type → Categorie validée).
-- Exécuter dans l'ordre. Vérifier avant : SELECT COUNT(*) FROM actualites WHERE categorie IS NULL OR categorie = '';
-- Objectif après : 0

UPDATE actualites SET categorie = 'commercial_communication'
WHERE (categorie IS NULL OR categorie = '')
  AND type IN ('Opération commerciale', 'Communication', 'Marketing');

UPDATE actualites SET categorie = 'produit_tarification'
WHERE (categorie IS NULL OR categorie = '')
  AND type IN ('Changement de taux', 'Taux', 'Produit', 'Evolution de produit ou service');

UPDATE actualites SET categorie = 'strategie_corporate'
WHERE (categorie IS NULL OR categorie = '')
  AND type = 'Corporate';

UPDATE actualites SET categorie = 'innovation_securite'
WHERE (categorie IS NULL OR categorie = '')
  AND type IN ('Digital', 'Fonctionnalité App mobile');

-- Dernier : tout reliquat sans categorie
UPDATE actualites SET categorie = 'strategie_corporate'
WHERE categorie IS NULL OR categorie = '';
