-- Date du dernier import contributeur (en-tête « Dernière mise à jour »)

CREATE TABLE IF NOT EXISTS app_meta (
  id TEXT PRIMARY KEY,
  last_import_at DATE
);

INSERT INTO app_meta (id) VALUES ('global')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE app_meta ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'app_meta' AND policyname = 'anon_select_app_meta'
  ) THEN
    CREATE POLICY "anon_select_app_meta" ON app_meta FOR SELECT TO anon USING (true);
    CREATE POLICY "anon_insert_app_meta" ON app_meta FOR INSERT TO anon WITH CHECK (true);
    CREATE POLICY "anon_update_app_meta" ON app_meta FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;
