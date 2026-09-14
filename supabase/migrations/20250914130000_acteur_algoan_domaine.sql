-- Algoan (sourcing) : domaine pour affichage logo via favicon (pas de colonne logo_url).
UPDATE acteurs
SET domaine = 'algoan.com'
WHERE lower(id) = 'algoan'
   OR nom ILIKE 'Algoan';
