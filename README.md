# sofinco-edge

Competitive intelligence & market monitoring dashboard for Sofinco — benchmarking products, rates and competitors in the consumer finance market.

## Données Supabase

Les données métier sont chargées **uniquement depuis Supabase** au runtime (`index.html` → `bootstrapData()`). Le fichier `seed-data.json` sert uniquement au déploiement / réinitialisation de la base.

1. Configurer `supabase-config.js` avec l'URL et la clé anon du projet (Dashboard → API)
2. Appliquer les migrations : `supabase/migrations/`
3. Importer le seed : voir `supabase/README.md`

```bash
npm install
npm run verify:seed
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:supabase
```

## Développement local

Ouvrir `index.html` via un serveur HTTP statique (les appels Supabase nécessitent une origine valide).
