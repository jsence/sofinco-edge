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

## GitHub Pages

Le déploiement est géré par `.github/workflows/deploy-pages.yml` (site statique, sans Jekyll).

Si le site ne se met pas à jour après un merge : **Actions** → vérifier le workflow « Deploy SofincoEdge to Pages », ou relancer manuellement via **Run workflow**.

Paramètres repo → **Pages** → Source : **GitHub Actions** (workflow `Deploy SofincoEdge to Pages`).
