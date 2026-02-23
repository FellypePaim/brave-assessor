import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// In-memory cache (5 minutes TTL)
let cachedResponse: { market: any[]; updatedAt: string } | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const now = Date.now();

    // Return cached data if still valid
    if (cachedResponse && (now - cacheTimestamp) < CACHE_TTL_MS) {
      return new Response(JSON.stringify(cachedResponse), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    const market: any[] = [];

    // Use open.er-api.com for exchange rates (free, no key, reliable)
    try {
      const [usdRes, eurRes, gbpRes, fiatChangeRes] = await Promise.all([
        fetch("https://open.er-api.com/v6/latest/USD"),
        fetch("https://open.er-api.com/v6/latest/EUR"),
        fetch("https://open.er-api.com/v6/latest/GBP"),
        fetch("https://api.coingecko.com/api/v3/simple/price?ids=usd,eur,gbp&vs_currencies=brl&include_24hr_change=true"),
      ]);

      const [usdData, eurData, gbpData, fiatChange] = await Promise.all([
        usdRes.json(), eurRes.json(), gbpRes.json(), fiatChangeRes.json(),
      ]);

      if (usdData.rates?.BRL) {
        const change24h = fiatChange?.usd?.brl_24h_change ?? null;
        market.push({
          label: "DÓLAR", value: `R$ ${usdData.rates.BRL.toFixed(2)}`,
          change: change24h !== null ? `${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%` : null,
          positive: change24h === null ? true : change24h >= 0,
        });
      }
      if (eurData.rates?.BRL) {
        const change24h = fiatChange?.eur?.brl_24h_change ?? null;
        market.push({
          label: "EURO", value: `R$ ${eurData.rates.BRL.toFixed(2)}`,
          change: change24h !== null ? `${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%` : null,
          positive: change24h === null ? true : change24h >= 0,
        });
      }
      if (gbpData.rates?.BRL) {
        const change24h = fiatChange?.gbp?.brl_24h_change ?? null;
        market.push({
          label: "LIBRA (GBP)", value: `R$ ${gbpData.rates.BRL.toFixed(2)}`,
          change: change24h !== null ? `${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%` : null,
          positive: change24h === null ? true : change24h >= 0,
        });
      }
      if (usdData.rates?.EUR) {
        const eurUsd = (1 / usdData.rates.EUR).toFixed(4);
        const eurusdChange = fiatChange?.eur?.brl_24h_change !== undefined && fiatChange?.usd?.brl_24h_change !== undefined
          ? fiatChange.eur.brl_24h_change - fiatChange.usd.brl_24h_change : null;
        market.push({
          label: "EUR/USD", value: `$ ${eurUsd}`,
          change: eurusdChange !== null ? `${eurusdChange >= 0 ? "+" : ""}${eurusdChange.toFixed(2)}%` : null,
          positive: eurusdChange === null ? true : eurusdChange >= 0,
        });
      }
    } catch (e) {
      console.error("Exchange rate error:", e.message);
    }

    // Bitcoin
    try {
      const btcRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=brl&include_24hr_change=true");
      const btcData = await btcRes.json();
      if (btcData.bitcoin) {
        const price = btcData.bitcoin.brl;
        const change = btcData.bitcoin.brl_24h_change ?? 0;
        market.push({
          label: "BITCOIN",
          value: `R$ ${price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          change: `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`,
          positive: change >= 0,
        });
      }
    } catch (e) {
      console.error("Bitcoin error:", e.message);
    }

    // IBOVESPA
    try {
      const res = await fetch("https://brapi.dev/api/quote/%5EBVSP?token=demo");
      const data = await res.json();
      if (data.results?.length) {
        const r = data.results[0];
        const pct = r.regularMarketChangePercent ?? 0;
        market.push({
          label: "IBOVESPA",
          value: `${Number(r.regularMarketPrice).toLocaleString("pt-BR")} pts`,
          change: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`,
          positive: pct >= 0,
        });
      }
    } catch (e) {
      console.error("IBOVESPA error:", e.message);
    }

    // CDI / SELIC
    try {
      const [selicRes, cdiRes] = await Promise.all([
        fetch("https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/2?formato=json"),
        fetch("https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados/ultimos/2?formato=json"),
      ]);
      const [selicData, cdiData] = await Promise.all([selicRes.json(), cdiRes.json()]);

      if (Array.isArray(selicData) && selicData.length > 0) {
        const latest = selicData[selicData.length - 1];
        const prev = selicData.length > 1 ? selicData[selicData.length - 2] : null;
        const val = parseFloat(latest.valor);
        const prevVal = prev ? parseFloat(prev.valor) : val;
        const diff = val - prevVal;
        market.push({
          label: "SELIC", value: `${val.toFixed(2)}% a.a.`,
          change: diff !== 0 ? `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%` : null,
          positive: diff >= 0,
        });
      }

      if (Array.isArray(cdiData) && cdiData.length > 0) {
        const latest = cdiData[cdiData.length - 1];
        const prev = cdiData.length > 1 ? cdiData[cdiData.length - 2] : null;
        const valDiario = parseFloat(latest.valor);
        const annualized = ((1 + valDiario / 100) ** 252 - 1) * 100;
        const prevDiario = prev ? parseFloat(prev.valor) : valDiario;
        const prevAnnualized = ((1 + prevDiario / 100) ** 252 - 1) * 100;
        const diff = annualized - prevAnnualized;
        market.push({
          label: "CDI", value: `${annualized.toFixed(2)}% a.a.`,
          change: diff !== 0 ? `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%` : null,
          positive: diff >= 0,
        });
      }
    } catch (e) {
      console.error("BCB SELIC/CDI error:", e.message);
      market.push({ label: "SELIC", value: "13.25% a.a.", change: null, positive: true });
      market.push({ label: "CDI", value: "13.15% a.a.", change: null, positive: true });
    }

    // Store in cache
    cachedResponse = { market, updatedAt: new Date().toISOString() };
    cacheTimestamp = now;

    return new Response(JSON.stringify(cachedResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (error) {
    // On error, return cached data if available
    if (cachedResponse) {
      return new Response(JSON.stringify(cachedResponse), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "STALE" },
      });
    }
    return new Response(JSON.stringify({ error: error.message, market: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
