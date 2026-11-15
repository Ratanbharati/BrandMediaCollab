// Shared Supabase client for the static pages served from /site.
// Only the publishable key is returned by the server route. Never place a
// Supabase secret/service-role key in browser code.
window.bmcSupabaseReady = (async () => {
  try {
    const configResponse = await fetch("/api/supabase-config", { cache: "no-store" });
    const config = await configResponse.json();
    if (!configResponse.ok || !config.url || !config.publishableKey) {
      throw new Error(config.error || "Supabase connection settings are missing.");
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    window.bmcSupabase = createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    return window.bmcSupabase;
  } catch (error) {
    window.bmcSupabaseError = error instanceof Error ? error.message : "Supabase failed to initialize.";
    return null;
  }
})();
