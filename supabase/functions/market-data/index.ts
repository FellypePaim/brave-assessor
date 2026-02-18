import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const market: any[] = [];

    // Use open.er-api.com for exchange rates (free, no key, reliable)
    // Use CoinGecko for EUR/USD and 24h change on fiat pairs
    try {
      const [usdRes, eurRes, gbpRes, fiatChangeRes] = await Promise.all([
        fetch("https://open.er-api.com/v6/latest/USD"),
        fetch("https://open.er-api.com/v6/latest/EUR"),
        fetch("https://open.er-api.com/v6/latest/GBP"),
        // CoinGecko: get USD, EUR, GBP vs BRL prices with 24h change
        fetch("https://api.coingecko.com/api/v3/simple/price?ids=usd,eur,gbp&vs_currencies=brl&include_24hr_change=true"),
      ]);

      const [usdData, eurData, gbpData, fiatChange] = await Promise.all([
        usdRes.json(),
        eurRes.json(),
        gbpRes.json(),
        fiatChangeRes.json(),
      ]);

      if (usdData.rates?.BRL) {
        const change24h = fiatChange?.usd?.brl_24h_change ?? null;
        market.push({
          label: "DÓLAR",
          value: `R$ ${usdData.rates.BRL.toFixed(2)}`,
          change: change24h !== null ? `${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%` : null,
          positive: change24h === null ? true : change24h >= 0,
        });
      }
      if (eurData.rates?.BRL) {
        const change24h = fiatChange?.eur?.brl_24h_change ?? null;
        market.push({
          label: "EURO",
          value: `R$ ${eurData.rates.BRL.toFixed(2)}`,
          change: change24h !== null ? `${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%` : null,
          positive: change24h === null ? true : change24h >= 0,
        });
      }
      if (gbpData.rates?.BRL) {
        const change24h = fiatChange?.gbp?.brl_24h_change ?? null;
        market.push({
          label: "LIBRA (GBP)",
          value: `R$ ${gbpData.rates.BRL.toFixed(2)}`,
          change: change24h !== null ? `${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%` : null,
          positive: change24h === null ? true : change24h >= 0,
        });
      }

      // EUR/USD cross rate
      if (usdData.rates?.EUR) {
        const eurUsd = (1 / usdData.rates.EUR).toFixed(4);
        const eurusdChange = fiatChange?.eur?.brl_24h_change !== undefined && fiatChange?.usd?.brl_24h_change !== undefined
          ? fiatChange.eur.brl_24h_change - fiatChange.usd.brl_24h_change
          : null;
        market.push({
          label: "EUR/USD",
          value: `$ ${eurUsd}`,
          change: eurusdChange !== null ? `${eurusdChange >= 0 ? "+" : ""}${eurusdChange.toFixed(2)}%` : null,
          positive: eurusdChange === null ? true : eurusdChange >= 0,
        });
      }
    } catch (e) {
      console.error("Exchange rate error:", e.message);
    }

    // Bitcoin from CoinGecko (free, no key)
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

    // IBOVESPA from BrAPI
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

    // CDI / SELIC (static latest known rates as placeholder)
    market.push({ label: "CDI", value: "13.15%", change: null, positive: true });
    market.push({ label: "SELIC", value: "13.25%", change: null, positive: true });

    return new Response(JSON.stringify({ market, updatedAt: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message, market: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
