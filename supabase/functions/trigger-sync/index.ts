import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const validTargets = new Set(["all", "reports", "campograms", "calendar", "wyscout"]);

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Metodo no permitido" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey =
    Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const githubToken = Deno.env.get("GITHUB_ACTIONS_TRIGGER_TOKEN");
  const githubRepository = Deno.env.get("GITHUB_REPOSITORY");
  const githubRef = Deno.env.get("GITHUB_REF") || "main";
  const workflowFile = Deno.env.get("GITHUB_SYNC_WORKFLOW") || "sync-supabase.yml";

  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    !supabaseServiceRoleKey ||
    !githubToken ||
    !githubRepository
  ) {
    return jsonResponse({ error: "Faltan secretos de configuracion en la funcion" }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace("Bearer ", "").trim();

  if (!jwt) {
    return jsonResponse({ error: "No autenticado" }, 401);
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(jwt);

  if (userError || !user) {
    return jsonResponse({ error: "Sesion no valida" }, 401);
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("role,active")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.active) {
    return jsonResponse({ error: "Perfil no autorizado" }, 403);
  }

  if (profile.role !== "admin") {
    return jsonResponse({ error: "Solo los administradores pueden lanzar sincronizaciones" }, 403);
  }

  let body: { target?: string; dry_run?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "JSON invalido" }, 400);
  }

  const target = body.target || "reports";
  const dryRun = Boolean(body.dry_run);

  if (!validTargets.has(target)) {
    return jsonResponse({ error: `Target no valido: ${target}` }, 400);
  }

  const response = await fetch(
    `https://api.github.com/repos/${githubRepository}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubToken}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        ref: githubRef,
        inputs: {
          target,
          dry_run: String(dryRun),
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    return jsonResponse(
      {
        error: "GitHub no pudo lanzar la sincronizacion",
        detail,
      },
      502,
    );
  }

  return jsonResponse({
    ok: true,
    target,
    dry_run: dryRun,
    message: "Sincronizacion lanzada",
  });
});
