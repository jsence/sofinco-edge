-- Actualités : acteur optionnel (tendances marché, infos macro sans acteur nommé)

ALTER TABLE actualites
  ALTER COLUMN acteur_id DROP NOT NULL;
