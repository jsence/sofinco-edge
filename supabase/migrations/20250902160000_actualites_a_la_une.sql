-- Actualités : mise en avant manuelle « À la une » sur l'accueil

ALTER TABLE actualites
  ADD COLUMN IF NOT EXISTS a_la_une BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS actualites_single_a_la_une_idx
  ON actualites ((1))
  WHERE a_la_une = true;
