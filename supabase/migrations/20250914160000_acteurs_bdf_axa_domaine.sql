-- Logos Banque de France et AXA Banque via favicon (colonne domaine, pas de logo_url dans le schéma).
UPDATE acteurs
SET domaine = 'banque-france.fr'
WHERE lower(trim(nom)) = 'banque de france'
  AND (domaine IS NULL OR trim(domaine) = '');

UPDATE acteurs
SET domaine = 'axabanque.fr'
WHERE lower(trim(nom)) = 'axa banque'
  AND (domaine IS NULL OR trim(domaine) = '');
