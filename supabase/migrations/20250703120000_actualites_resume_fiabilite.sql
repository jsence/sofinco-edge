-- Actualités : résumé et fiabilité (Espace contributeur)

ALTER TABLE actualites
  ADD COLUMN IF NOT EXISTS resume TEXT,
  ADD COLUMN IF NOT EXISTS fiabilite TEXT;

ALTER TABLE actualites
  DROP CONSTRAINT IF EXISTS actualites_fiabilite_check;

ALTER TABLE actualites
  ADD CONSTRAINT actualites_fiabilite_check
  CHECK (fiabilite IS NULL OR fiabilite IN ('confirmee', 'a_verifier'));
