/**
 * Cloudflare Worker for Macro & Asset Monitoring Dashboard
 * Multi-Source Architecture:
 * - Primary: Coinbase Exchange (Crypto), FRED Federal Reserve (Rates), Central Bank / Open Currency (FX)
 * - Fallback: Yahoo Finance (query1/query2 mirrors) + Cloudflare Edge CDN Caching
 */

// Core monitored assets in strict display order
const ASSETS = {
  "^GSPC": {
    ticker: "^GSPC",
    name: "标普 500 指数",
    en_name: "S&P 500",
    category: "美股大盘",
    category_en: "US Equities",
    unit: "点",
    precision: 2,
    is_yield: false,
    color: "#38BDF8",
    description: "反映美国500家龙头上市公司的综合表现，全球宏观权益资产核心基准。"
  },
  "^NDX": {
    ticker: "^NDX",
    name: "纳斯达克 100 指数",
    en_name: "Nasdaq 100",
    category: "科技龙头",
    category_en: "Tech & Growth",
    unit: "点",
    precision: 2,
    is_yield: false,
    color: "#A855F7",
    description: "汇聚全球顶尖软硬件、半导体与人工智能龙头企业，全球风险偏好风向标。"
  },
  "^RUT": {
    ticker: "^RUT",
    name: "罗素 2000 指数",
    en_name: "Russell 2000",
    category: "美股小盘",
    category_en: "US Small Cap",
    unit: "点",
    precision: 2,
    is_yield: false,
    color: "#06B6D4",
    description: "美股中小市值公司代表指数，高度敏锐反映美国国内实体经济景气度与信用环境。"
  },
  "^TNX": {
    ticker: "^TNX",
    name: "10年期美债收益率",
    en_name: "US 10Y Treasury Yield",
    category: "宏观利率",
    category_en: "Macro Benchmark",
    unit: "%",
    precision: 3,
    is_yield: true,
    color: "#F43F5E",
    description: "全球资产定价之锚，反映市场对实际利率、通胀走势与美联储货币政策预期。"
  },
  "CL=F": {
    ticker: "CL=F",
    name: "WTI 原油期货",
    en_name: "Crude Oil (WTI)",
    category: "大宗商品",
    category_en: "Commodities & Energy",
    unit: "美元/桶",
    precision: 2,
    is_yield: false,
    color: "#F97316",
    description: "全球工业之母与核心大宗商品，反映全球制造业与出行需求、地缘博弈与输入性通胀。"
  },
  "GC=F": {
    ticker: "GC=F",
    name: "COMEX 黄金期货",
    en_name: "Gold Futures",
    category: "避险/商品",
    category_en: "Commodities & Safe Haven",
    unit: "美元/盎司",
    precision: 2,
    is_yield: false,
    color: "#EAB308",
    description: "避险资产与抗通胀硬通货，反映全球地缘政治风险、流动性及法币信用评估。"
  },
  "BTC-USD": {
    ticker: "BTC-USD",
    name: "比特币",
    en_name: "Bitcoin (BTC/USD)",
    category: "数字资产",
    category_en: "Digital Assets",
    unit: "美元",
    precision: 2,
    is_yield: false,
    color: "#10B981",
    description: "新兴数字黄金与高贝塔流动性风向标，反映全球超额流动性、风险偏好与去中心化资产配置需求。"
  },
  "USDCNY=X": {
    ticker: "USDCNY=X",
    name: "美元兑人民币",
    en_name: "USD / CNY",
    category: "外汇汇率",
    category_en: "FX & Currencies",
    unit: "汇率",
    precision: 4,
    is_yield: false,
    color: "#EC4899",
    description: "衡量中美经济周期分化、进出口贸易景气度与中美利差的核心汇率定价指标。"
  }
};

const PERIOD_MAP = {
  "1D": { range: "1d", interval: "5m", label: "分时 1日" },
  "5D": { range: "5d", interval: "15m", label: "分时 5日" },
  "1M": { range: "1mo", interval: "1d", label: "日线 1月" },
  "6M": { range: "6mo", interval: "1d", label: "日线 6月" },
  "1Y": { range: "1y", interval: "1d", label: "日线 1年" }
};

function cleanNum(val, precision = 2) {
  if (val === null || val === undefined || isNaN(val)) return null;
  return Number(Number(val).toFixed(precision));
}

function formatDate(timestamp, isDaily = false) {
  const d = new Date(timestamp * 1000);
  if (isDaily) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } else {
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const h = String(d.getUTCHours()).padStart(2, "0");
    const min = String(d.getUTCMinutes()).padStart(2, "0");
    return `${m}-${day} ${h}:${min}`;
  }
}

// Compute Simple Moving Average
function computeSMA(data, window) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < window - 1) {
      result.push(null);
    } else {
      let sum = 0;
      let count = 0;
      for (let j = i - window + 1; j <= i; j++) {
        if (data[j] !== null && data[j] !== undefined && !isNaN(data[j])) {
          sum += data[j];
          count++;
        }
      }
      result.push(count === window ? Number((sum / window).toFixed(2)) : null);
    }
  }
  return result;
}

// ============================================================================
// High-Quota Primary Data Sources
// ============================================================================

// 1. Primary: Coinbase Exchange for Bitcoin
async function fetchCoinbaseBTC() {
  try {
    const statsRes = await fetch("https://api.exchange.coinbase.com/products/BTC-USD/stats", {
      headers: { "User-Agent": "Mozilla/5.0" },
      cf: { cacheTtl: 30, cacheEverything: true }
    });
    if (statsRes.ok) {
      const s = await statsRes.json();
      const last = cleanNum(s.last, 2);
      const open = cleanNum(s.open, 2);
      const high = cleanNum(s.high, 2);
      const low = cleanNum(s.low, 2);
      if (last && open) {
        const change = cleanNum(last - open, 2);
        const changePct = cleanNum(((last - open) / open) * 100, 2);
        return {
          lastPrice: last,
          prevClose: open,
          change,
          changePct,
          dayHigh: high,
          dayLow: low,
          source: "Coinbase Exchange (官方合规源)",
          source_badge: "Coinbase"
        };
      }
    }
  } catch (e) {}
  return null;
}

// 2. Primary: European Central Bank / Open Currency for USD/CNY
async function fetchOfficialUSDCNY() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      headers: { "User-Agent": "Mozilla/5.0" },
      cf: { cacheTtl: 60, cacheEverything: true }
    });
    if (res.ok) {
      const data = await res.json();
      const rate = cleanNum(data.rates?.CNY, 4);
      if (rate) {
        return {
          lastPrice: rate,
          source: "ECB / 欧洲央行外汇基准 (官方源)",
          source_badge: "ECB官方"
        };
      }
    }
  } catch (e) {}
  return null;
}

// 3. Primary: FRED (Federal Reserve Bank of St. Louis) for 10Y Treasury
async function fetchFRED10Y() {
  try {
    const res = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10", {
      headers: { "User-Agent": "Mozilla/5.0" },
      cf: { cacheTtl: 120, cacheEverything: true }
    });
    if (res.ok) {
      const txt = await res.text();
      const lines = txt.trim().split("\n");
      const valid = [];
      for (const l of lines.slice(1)) {
        const parts = l.trim().split(",");
        if (parts.length >= 2) {
          const val = parseFloat(parts[1]);
          if (!isNaN(val)) valid.push(val);
        }
      }
      if (valid.length >= 2) {
        const last = cleanNum(valid[valid.length - 1], 3);
        const prev = cleanNum(valid[valid.length - 2], 3);
        const change = cleanNum(last - prev, 3);
        const changePct = cleanNum(((last - prev) / prev) * 100, 2);
        return {
          lastPrice: last,
          prevClose: prev,
          change,
          changePct,
          source: "美联储 FRED 圣路易斯联储 (官方源)",
          source_badge: "美联储FRED"
        };
      }
    }
  } catch (e) {}
  return null;
}

// ============================================================================
// Fallback: Yahoo Finance API with Multi-Mirror Failover
// ============================================================================
async function fetchYahooChart(ticker, range, interval) {
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  let lastErr = null;

  for (const host of hosts) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "application/json"
        },
        cf: {
          cacheTtl: 30,
          cacheEverything: true
        }
      });
      if (res.ok) {
        const json = await res.json();
        const result = json?.chart?.result?.[0];
        if (result) return result;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error(`Failed to fetch Yahoo chart for ${ticker}`);
}

// Handler: GET /api/overview (Multi-Source + Fallback)
async function handleOverview() {
  const results = [];

  for (const [ticker, meta] of Object.entries(ASSETS)) {
    let primaryData = null;

    // 1. Try high-quota official sources first
    if (ticker === "BTC-USD") {
      primaryData = await fetchCoinbaseBTC();
    } else if (ticker === "USDCNY=X") {
      primaryData = await fetchOfficialUSDCNY();
    } else if (ticker === "^TNX") {
      primaryData = await fetchFRED10Y();
    }

    try {
      // 2. Fetch history / sparkline from Yahoo (also serves as complete fallback)
      const chart = await fetchYahooChart(ticker, "5d", "15m");
      const m = chart?.meta || {};
      const q = chart?.indicators?.quote?.[0] || {};
      const closes = (q.close || []).filter(v => v !== null && !isNaN(v));

      let lastPrice = primaryData?.lastPrice ?? m.regularMarketPrice ?? (closes.length ? closes[closes.length - 1] : null);
      let prevClose = primaryData?.prevClose ?? m.chartPreviousClose ?? (closes.length >= 2 ? closes[closes.length - 2] : null);

      let change = primaryData?.change ?? null;
      let changePct = primaryData?.changePct ?? null;

      if ((change === null || changePct === null) && lastPrice !== null && prevClose !== null && prevClose !== 0) {
        change = cleanNum(lastPrice - prevClose, meta.precision);
        changePct = cleanNum(((lastPrice - prevClose) / prevClose) * 100, 2);
      }

      const sparkline = closes.slice(-30).map(v => cleanNum(v, meta.precision));
      const lastTs = chart?.timestamp?.length ? chart.timestamp[chart.timestamp.length - 1] : Math.floor(Date.now() / 1000);
      const lastUpdated = formatDate(lastTs, false);

      const source = primaryData ? primaryData.source : "雅虎财经多节点镜像 (备用源)";
      const sourceBadge = primaryData ? primaryData.source_badge : "雅虎备用";

      results.push({
        ticker,
        name: meta.name,
        en_name: meta.en_name,
        category: meta.category,
        category_en: meta.category_en,
        unit: meta.unit,
        is_yield: meta.is_yield,
        color: meta.color,
        description: meta.description,
        last_price: cleanNum(lastPrice, meta.precision),
        prev_close: cleanNum(prevClose, meta.precision),
        change,
        change_pct: changePct,
        day_high: cleanNum(primaryData?.dayHigh ?? m.regularMarketDayHigh, meta.precision),
        day_low: cleanNum(primaryData?.dayLow ?? m.regularMarketDayLow, meta.precision),
        year_high: cleanNum(m.fiftyTwoWeekHigh, meta.precision),
        year_low: cleanNum(m.fiftyTwoWeekLow, meta.precision),
        sparkline,
        last_updated: lastUpdated,
        status: (change || 0) > 0 ? "up" : ((change || 0) < 0 ? "down" : "neutral"),
        source,
        source_badge: sourceBadge
      });
    } catch (e) {
      // If Yahoo failed but primary succeeded
      if (primaryData) {
        results.push({
          ticker,
          name: meta.name,
          en_name: meta.en_name,
          category: meta.category,
          unit: meta.unit,
          is_yield: meta.is_yield,
          color: meta.color,
          description: meta.description,
          last_price: cleanNum(primaryData.lastPrice, meta.precision),
          prev_close: cleanNum(primaryData.prevClose, meta.precision),
          change: primaryData.change,
          change_pct: primaryData.changePct,
          day_high: cleanNum(primaryData.dayHigh, meta.precision),
          day_low: cleanNum(primaryData.dayLow, meta.precision),
          year_high: null,
          year_low: null,
          sparkline: [primaryData.lastPrice],
          last_updated: formatDate(Math.floor(Date.now() / 1000), false),
          status: (primaryData.change || 0) > 0 ? "up" : "down",
          source: primaryData.source,
          source_badge: primaryData.source_badge
        });
      } else {
        results.push({
          ticker,
          name: meta.name,
          en_name: meta.en_name,
          category: meta.category,
          unit: meta.unit,
          is_yield: meta.is_yield,
          color: meta.color,
          description: meta.description,
          last_price: null,
          change: null,
          change_pct: null,
          sparkline: [],
          error: e.message,
          source: "数据源重试中",
          source_badge: "重试中"
        });
      }
    }
  }

  const now = new Date();
  return {
    timestamp: Date.now() / 1000,
    formatted_time: now.toISOString().replace("T", " ").substring(0, 19),
    assets: results
  };
}

// Handler: GET /api/asset/:ticker
async function handleAssetHistory(ticker, period = "1M") {
  if (!ASSETS[ticker]) {
    throw new Error(`Ticker ${ticker} not found`);
  }

  const periodKey = (period || "1M").toUpperCase();
  const cfg = PERIOD_MAP[periodKey] || PERIOD_MAP["1M"];
  const meta = ASSETS[ticker];

  const chart = await fetchYahooChart(ticker, cfg.range, cfg.interval);
  const timestampsRaw = chart?.timestamp || [];
  const q = chart?.indicators?.quote?.[0] || {};
  const isDaily = cfg.interval === "1d";

  const timestamps = [];
  const candlestick = [];
  const closes = [];
  const volumes = [];

  for (let i = 0; i < timestampsRaw.length; i++) {
    const o = cleanNum(q.open?.[i], meta.precision);
    const c = cleanNum(q.close?.[i], meta.precision);
    const l = cleanNum(q.low?.[i], meta.precision);
    const h = cleanNum(q.high?.[i], meta.precision);
    const v = q.volume?.[i] || 0;

    if (c !== null) {
      timestamps.push(formatDate(timestampsRaw[i], isDaily));
      candlestick.push([o ?? c, c, l ?? c, h ?? c]);
      closes.push(c);
      volumes.push(v);
    }
  }

  const ma5 = isDaily ? computeSMA(closes, 5) : [];
  const ma20 = isDaily ? computeSMA(closes, 20) : [];

  return {
    ticker,
    name: meta.name,
    en_name: meta.en_name,
    category: meta.category,
    unit: meta.unit,
    is_yield: meta.is_yield,
    color: meta.color,
    period: periodKey,
    interval: cfg.interval,
    label: cfg.label,
    timestamps,
    candlestick,
    closes,
    volumes,
    ma5,
    ma20,
    count: timestamps.length
  };
}

// Handler: GET /api/macro-comparison
async function handleMacroComparison(period = "1M") {
  const periodKey = (period || "1M").toUpperCase();
  const cfg = PERIOD_MAP[periodKey] || PERIOD_MAP["1M"];
  const isDaily = cfg.interval === "1d";

  const allTimestampsSet = new Set();
  const assetData = {};

  for (const [ticker, meta] of Object.entries(ASSETS)) {
    try {
      const chart = await fetchYahooChart(ticker, cfg.range, cfg.interval);
      const tsRaw = chart?.timestamp || [];
      const closes = chart?.indicators?.quote?.[0]?.close || [];

      const validPairs = [];
      for (let i = 0; i < tsRaw.length; i++) {
        if (closes[i] !== null && closes[i] !== undefined && !isNaN(closes[i])) {
          validPairs.push({ ts: formatDate(tsRaw[i], isDaily), val: closes[i] });
        }
      }

      if (validPairs.length > 0) {
        const baseVal = validPairs[0].val;
        const map = {};
        for (const item of validPairs) {
          allTimestampsSet.add(item.ts);
          const ret = baseVal ? ((item.val / baseVal) - 1.0) * 100.0 : 0.0;
          map[item.ts] = cleanNum(ret, 2);
        }
        assetData[ticker] = map;
      } else {
        assetData[ticker] = {};
      }
    } catch (e) {
      assetData[ticker] = {};
    }
  }

  const sortedTimestamps = Array.from(allTimestampsSet).sort();

  const series = {};
  for (const [ticker, meta] of Object.entries(ASSETS)) {
    const tMap = assetData[ticker] || {};
    const curve = [];
    let lastKnown = 0.0;

    for (const ts of sortedTimestamps) {
      if (ts in tMap && tMap[ts] !== null) {
        lastKnown = tMap[ts];
      }
      curve.push(lastKnown);
    }

    series[ticker] = {
      name: meta.name,
      short_name: meta.name.split(" ")[0],
      color: meta.color,
      data: curve
    };
  }

  return {
    period: periodKey,
    label: cfg.label,
    timestamps: sortedTimestamps,
    series
  };
}

// Worker Fetch Dispatcher
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS Headers for API requests
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Edge Caching Layer
    const cache = caches.default;
    const forceRefresh = url.searchParams.get("force") === "true";

    // Favicon handler
    if (path === "/favicon.ico" || path === "/favicon.svg") {
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
      const svgIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📈</text></svg>';
      return new Response(svgIcon, {
        headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" }
      });
    }

    // 1. GET /api/overview
    if (path === "/api/overview") {
      const cacheKey = new Request(url.origin + "/api/overview", request);
      if (!forceRefresh) {
        const cachedRes = await cache.match(cacheKey);
        if (cachedRes) return cachedRes;
      }

      try {
        const data = await handleOverview();
        const response = new Response(JSON.stringify(data), {
          headers: {
            ...corsHeaders,
            "Cache-Control": "public, max-age=30, s-maxage=30"
          }
        });
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 2. GET /api/asset/:ticker
    if (path.startsWith("/api/asset/")) {
      const ticker = decodeURIComponent(path.replace("/api/asset/", ""));
      const period = url.searchParams.get("period") || "1M";
      const cacheKey = new Request(`${url.origin}/api/asset/${encodeURIComponent(ticker)}?period=${period}`, request);

      if (!forceRefresh) {
        const cachedRes = await cache.match(cacheKey);
        if (cachedRes) return cachedRes;
      }

      try {
        const data = await handleAssetHistory(ticker, period);
        const maxAge = (period === "1D" || period === "5D") ? 60 : 300;
        const response = new Response(JSON.stringify(data), {
          headers: {
            ...corsHeaders,
            "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge}`
          }
        });
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 404, headers: corsHeaders });
      }
    }

    // 3. GET /api/macro-comparison
    if (path === "/api/macro-comparison") {
      const period = url.searchParams.get("period") || "1M";
      const cacheKey = new Request(`${url.origin}/api/macro-comparison?period=${period}`, request);

      if (!forceRefresh) {
        const cachedRes = await cache.match(cacheKey);
        if (cachedRes) return cachedRes;
      }

      try {
        const data = await handleMacroComparison(period);
        const response = new Response(JSON.stringify(data), {
          headers: {
            ...corsHeaders,
            "Cache-Control": "public, max-age=60, s-maxage=60"
          }
        });
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 4. POST /api/refresh
    if (path === "/api/refresh" && request.method === "POST") {
      try {
        const data = await handleOverview();
        return new Response(JSON.stringify({ status: "refreshed", data }), {
          headers: corsHeaders
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 5. GET /api/health
    if (path === "/api/health") {
      return new Response(JSON.stringify({
        status: "healthy",
        service: "macro-asset-monitor-cloudflare-worker",
        features: ["coinbase-crypto", "fred-treasury", "ecb-fx", "yahoo-fallback", "edge-cache"],
        monitored_tickers: Object.keys(ASSETS)
      }), { headers: corsHeaders });
    }

    // 6. Static files fallback (handles both /static/* and root-relative paths)
    if (env.ASSETS) {
      if (path.startsWith("/static/")) {
        const rewrittenUrl = new URL(request.url);
        rewrittenUrl.pathname = path.replace(/^\/static/, "");
        return env.ASSETS.fetch(new Request(rewrittenUrl.toString(), request));
      }
      return env.ASSETS.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  }
};
