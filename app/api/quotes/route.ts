export const dynamic = "force-dynamic";

type StockQuote = {
  secid: string;
  code: string;
  name: string;
  price: number;
  prevClose: number;
  changePct: number;
  industry?: string;
  concepts?: string;
  time: string;
};

const upstreamHeaders = {
  Accept: "application/json, text/plain, */*",
  Referer: "https://quote.eastmoney.com/",
  "User-Agent": "Mozilla/5.0 (compatible; XinhuiyingDashboard/1.0)",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredText(value: unknown, field: string): string {
  const text = String(value ?? "").trim();
  if (!text || text === "-") throw new Error(`missing ${field}`);
  return text;
}

function requiredNumber(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`invalid ${field}`);
  return number;
}

async function fetchEastmoneyQuote(secid: string, extended: boolean): Promise<StockQuote> {
  const fields = `f57,f58,f43,f60,f170${extended ? ",f127,f129" : ""}`;
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${encodeURIComponent(secid)}&fields=${fields}`;
  let lastError: unknown;

  for (let attempt = 0; attempt < 1; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: upstreamHeaders,
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new Error(`quote upstream ${response.status}`);

      const payload: unknown = await response.json();
      if (!isRecord(payload) || !isRecord(payload.data)) throw new Error("invalid quote payload");
      const data = payload.data;

      return {
        secid,
        code: requiredText(data.f57, "code"),
        name: requiredText(data.f58, "name"),
        price: requiredNumber(data.f43, "price") / 100,
        prevClose: requiredNumber(data.f60, "previous close") / 100,
        changePct: requiredNumber(data.f170, "change percent") / 100,
        industry: extended ? String(data.f127 ?? "").trim() : undefined,
        concepts: extended ? String(data.f129 ?? "").trim() : undefined,
        time: new Date().toISOString(),
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("quote unavailable");
}

async function fetchTencentQuote(secid: string): Promise<StockQuote> {
  const [market, code] = secid.split(".");
  const symbol = `${market === "1" ? "sh" : "sz"}${code}`;
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,2,qfq`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Referer: "https://gu.qq.com/",
      "User-Agent": upstreamHeaders["User-Agent"],
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`tencent quote upstream ${response.status}`);

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !isRecord(payload.data) || !isRecord(payload.data[symbol])) {
    throw new Error("invalid tencent quote payload");
  }
  const stock = payload.data[symbol];
  if (!isRecord(stock.qt) || !Array.isArray(stock.qt[symbol])) {
    throw new Error("missing tencent quote");
  }
  const quote = stock.qt[symbol];

  return {
    secid,
    code: requiredText(quote[2], "code"),
    name: requiredText(quote[1], "name"),
    price: requiredNumber(quote[3], "price"),
    prevClose: requiredNumber(quote[4], "previous close"),
    changePct: requiredNumber(quote[32], "change percent"),
    time: new Date().toISOString(),
  };
}

async function fetchQuote(secid: string, extended: boolean): Promise<StockQuote> {
  try {
    return await fetchTencentQuote(secid);
  } catch (tencentError) {
    try {
      return await fetchEastmoneyQuote(secid, extended);
    } catch (eastmoneyError) {
      throw new AggregateError([tencentError, eastmoneyError], "all quote providers unavailable");
    }
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secids = (url.searchParams.get("secids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^[01]\.\d{6}$/.test(value))
    .slice(0, 30);
  const extended = url.searchParams.get("extended") === "1";

  if (secids.length === 0) {
    return Response.json({ error: "missing or invalid secids", quotes: [] }, { status: 400 });
  }

  const settled = await Promise.allSettled(secids.map((secid) => fetchQuote(secid, extended)));
  const quotes = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  const failed = settled.flatMap((result, index) => (result.status === "rejected" ? [secids[index]] : []));

  if (quotes.length === 0) {
    console.error(JSON.stringify({ message: "quote upstream unavailable", failed }));
    return Response.json(
      { error: "quote upstream unavailable", quotes: [], failed },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    { quotes, failed },
    { headers: { "Cache-Control": "no-store" } },
  );
}
