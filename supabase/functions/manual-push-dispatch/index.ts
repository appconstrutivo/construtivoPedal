import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.1"
import webpush from "npm:web-push@3.6.7"

type Candidato = {
  subscription_id: string
  endpoint: string
  p256dh: string
  auth_key: string
  bicicleta_id: string
  token_manual: string
  company_id: string
  bike_label: string
  revisao_sequencia: number
  revisao_titulo: string
  revisao_tipo: string
  prazo_em: string
  gatilho: "antes_3d" | "no_dia" | "atraso"
  atrasadas_count: number
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  })
}

function textos(c: Candidato): { title: string; body: string; tag: string } {
  const modelo = c.bike_label || "sua bicicleta"
  const titulo = c.revisao_titulo || "Revisão"
  if (c.gatilho === "antes_3d") {
    return {
      title: `Revisão em 3 dias — ${modelo}`,
      body: `Agende a ${titulo} na oficina.`,
      tag: `manual-${c.bicicleta_id}-${c.revisao_sequencia}-antes`,
    }
  }
  if (c.gatilho === "atraso") {
    return {
      title: `Revisão em atraso — ${modelo}`,
      body: `${titulo} passou do prazo. Agende o quanto antes.`,
      tag: `manual-${c.bicicleta_id}-${c.revisao_sequencia}-atraso`,
    }
  }
  return {
    title: `Chegou o dia da revisão — ${modelo}`,
    body: `${titulo}. Toque para ver o quadro.`,
    tag: `manual-${c.bicicleta_id}-${c.revisao_sequencia}-dia`,
  }
}

function authorized(req: Request): boolean {
  const cronSecret = Deno.env.get("CRON_SECRET")?.trim()
  const headerSecret = req.headers.get("x-cron-secret")?.trim()
  if (cronSecret && headerSecret && headerSecret === cronSecret) return true

  const auth = req.headers.get("Authorization") ?? ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim()
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true

  if (cronSecret && auth === `Bearer ${cronSecret}`) return true

  return false
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405)
  }
  if (!authorized(req)) return json({ error: "Unauthorized" }, 401)

  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")?.trim()
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")?.trim()
  const vapidSubject = Deno.env.get("VAPID_SUBJECT")?.trim() || "mailto:suporte@construtivopedal.app"
  const appOrigin = (Deno.env.get("MANUAL_APP_ORIGIN")?.trim() || "https://construtivopedal.vercel.app").replace(/\/$/, "")
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim()
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim()

  if (!vapidPublic || !vapidPrivate) {
    return json({ error: "VAPID keys missing" }, 500)
  }
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Supabase env missing" }, 500)
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.rpc("manual_push_candidatos")
  if (error) return json({ error: error.message }, 500)

  const candidatos = (data ?? []) as Candidato[]
  let enviados = 0
  let falhas = 0
  let desativados = 0

  for (const c of candidatos) {
    const { title, body, tag } = textos(c)
    const url = `${appOrigin}/?manual=${encodeURIComponent(c.token_manual)}&secao=revisoes`
    const payload = JSON.stringify({
      title,
      body,
      url,
      badgeCount: c.atrasadas_count || (c.gatilho === "atraso" ? 1 : 0),
      tag,
    })

    try {
      await webpush.sendNotification(
        {
          endpoint: c.endpoint,
          keys: { p256dh: c.p256dh, auth: c.auth_key },
        },
        payload,
        { TTL: 60 * 60 * 24 },
      )

      await supabase.rpc("manual_push_marcar_envio", {
        p_subscription_id: c.subscription_id,
        p_bicicleta_id: c.bicicleta_id,
        p_revisao_sequencia: c.revisao_sequencia,
        p_gatilho: c.gatilho,
      })
      enviados += 1
    } catch (err) {
      falhas += 1
      const statusCode = (err as { statusCode?: number })?.statusCode
      const message = err instanceof Error ? err.message : String(err)
      if (statusCode === 404 || statusCode === 410) {
        await supabase.rpc("manual_push_desativar_por_endpoint", {
          p_endpoint: c.endpoint,
          p_erro: `${statusCode}: ${message}`.slice(0, 400),
        })
        desativados += 1
      } else {
        console.error("push fail", c.subscription_id, statusCode, message)
      }
    }
  }

  return json({
    ok: true,
    candidatos: candidatos.length,
    enviados,
    falhas,
    desativados,
  })
})
