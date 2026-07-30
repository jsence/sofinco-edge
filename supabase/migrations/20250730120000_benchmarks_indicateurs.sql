-- Benchmarks transverses + table indicateurs marché

INSERT INTO produits (id, label, short_label, a_onglet_taux)
VALUES
  ('digital', 'Digital', 'DIGITAL', false),
  ('sav', 'SAV', 'SAV', false),
  ('com', 'Communication', 'COM', false),
  ('distribution', 'Modèle de distribution', 'DISTRIB', false)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  short_label = EXCLUDED.short_label,
  a_onglet_taux = EXCLUDED.a_onglet_taux;

CREATE TABLE IF NOT EXISTS indicateurs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categorie  TEXT NOT NULL,
  libelle    TEXT NOT NULL,
  periode    TEXT NOT NULL,
  valeur     TEXT,
  evolution  TEXT,
  note       TEXT,
  ordre      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_indicateurs_categorie_ordre ON indicateurs(categorie, ordre);

ALTER TABLE indicateurs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'indicateurs' AND policyname = 'anon_select_indicateurs') THEN
    CREATE POLICY "anon_select_indicateurs" ON indicateurs FOR SELECT TO anon USING (true);
    CREATE POLICY "anon_insert_indicateurs" ON indicateurs FOR INSERT TO anon WITH CHECK (true);
    CREATE POLICY "anon_update_indicateurs" ON indicateurs FOR UPDATE TO anon USING (true) WITH CHECK (true);
    CREATE POLICY "anon_delete_indicateurs" ON indicateurs FOR DELETE TO anon USING (true);
  END IF;
END $$;
