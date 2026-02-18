import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// Mapeamento product_id / price_id → plano interno
const PRICE_TO_PLAN: Record<string, { plan: string; days: number }> = {
  "price_1T2271FQmz22ylYMQrYyktHi": { plan: "mensal", days: 30 },
  "price_1T227EFQmz22ylYM3VNyp1sS": { plan: "anual", days: 365 },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!stripeKey) {
    return new Response("STRIPE_SECRET_KEY não configurada", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event: Stripe.Event;

  try {
    if (webhookSecret && signature) {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } else {
      // Modo desenvolvimento sem validação de assinatura
      console.warn("STRIPE_WEBHOOK_SECRET não configurado — sem validação de assinatura");
      event = JSON.parse(body) as Stripe.Event;
    }
  } catch (err: any) {
    console.error("Webhook signature error:", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  console.log(`Evento recebido: ${event.type}`);

  try {
    // ── Pagamento confirmado (nova assinatura) ──
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.mode !== "subscription") return new Response("ok");

      const userId = session.metadata?.user_id;
      const plan = session.metadata?.plan;

      if (!userId || !plan) {
        console.error("Metadata ausente no session:", session.id);
        return new Response("Metadata inválida", { status: 400 });
      }

      const planDays = plan === "anual" ? 365 : 30;
      const expiresAt = new Date(Date.now() + planDays * 24 * 60 * 60 * 1000).toISOString();

      const { error } = await supabase
        .from("profiles")
        .update({
          subscription_plan: plan as any,
          subscription_expires_at: expiresAt,
        })
        .eq("id", userId);

      if (error) {
        console.error(`Erro ao atualizar perfil para user=${userId}:`, error);
        return new Response("Erro ao atualizar plano", { status: 500 });
      }

      console.log(`✅ Plano ${plan} ativado para user=${userId} até ${expiresAt}`);
    }

    // ── Renovação automática da assinatura ──
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;

      // Só processa renovações (billing_reason = subscription_cycle)
      if (invoice.billing_reason !== "subscription_cycle") return new Response("ok");

      const subscriptionId = typeof invoice.subscription === "string"
        ? invoice.subscription
        : invoice.subscription?.id;

      if (!subscriptionId) return new Response("ok");

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const userId = subscription.metadata?.user_id;
      const plan = subscription.metadata?.plan;

      if (!userId || !plan) {
        // Tenta resolver pelo e-mail do cliente
        console.warn("Metadata ausente na subscription:", subscriptionId);
        return new Response("ok");
      }

      const planDays = plan === "anual" ? 365 : 30;
      const expiresAt = new Date(Date.now() + planDays * 24 * 60 * 60 * 1000).toISOString();

      const { error } = await supabase
        .from("profiles")
        .update({
          subscription_plan: plan as any,
          subscription_expires_at: expiresAt,
        })
        .eq("id", userId);

      if (error) {
        console.error(`Erro na renovação para user=${userId}:`, error);
      } else {
        console.log(`🔄 Plano ${plan} renovado para user=${userId} até ${expiresAt}`);
      }
    }

    // ── Cancelamento / falha de pagamento ──
    if (
      event.type === "customer.subscription.deleted" ||
      event.type === "invoice.payment_failed"
    ) {
      let subscriptionId: string | null = null;

      if (event.type === "customer.subscription.deleted") {
        subscriptionId = (event.data.object as Stripe.Subscription).id;
      } else {
        const inv = event.data.object as Stripe.Invoice;
        subscriptionId = typeof inv.subscription === "string"
          ? inv.subscription
          : (inv.subscription as any)?.id ?? null;
      }

      if (!subscriptionId) return new Response("ok");

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const userId = subscription.metadata?.user_id;

      if (userId) {
        await supabase
          .from("profiles")
          .update({ subscription_plan: "free" as any, subscription_expires_at: null })
          .eq("id", userId);

        console.log(`❌ Plano cancelado/falho para user=${userId}`);
      }
    }
  } catch (err: any) {
    console.error("Erro ao processar evento:", err.message);
    return new Response("Erro interno", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
