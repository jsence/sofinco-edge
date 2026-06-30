/**
 * Connexion Supabase — SofincoEdge
 *
 * Configurer supabase-config.js avec :
 *   - url : URL du projet (https://xxxx.supabase.co)
 *   - anonKey : clé publique anon/publishable
 *
 * Obtenir ces valeurs : Supabase Dashboard → Project Settings → API
 * L'intégration GitHub Supabase peut injecter ces valeurs au déploiement.
 */
window.SOFINCO_EDGE_SUPABASE = window.SOFINCO_EDGE_SUPABASE || {
  url: '',
  anonKey: ''
};
