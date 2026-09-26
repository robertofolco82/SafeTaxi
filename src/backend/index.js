/* Scelta del backend: Supabase se configurato (.env), altrimenti modalità demo locale (dati nel browser). */
export async function createBackend(getState, save){
  const env = import.meta.env;
  if (env.VITE_BACKEND === 'locale' || !env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    const {createLocalBackend} = await import('./local.js');
    return createLocalBackend(getState, save);
  }
  const {createSupabaseBackend} = await import('./supabase.js');
  return createSupabaseBackend(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);
}
