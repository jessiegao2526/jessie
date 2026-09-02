export const dynamic = "force-dynamic";

type BusinessItem = {
  REPORT_DATE?: unknown;
  MAINOP_TYPE?: unknown;
  ITEM_NAME?: unknown;
  MBI_RATIO?: unknown;
  GROSS_RPOFIT_RATIO?: unknown;
};

const upstreamHeaders = {
  Accept: "application/json, text/plain, */*",
  Referer: "https://emweb.securities.eastmoney.com/",
  "User-Agent": "Mozilla/5.0 (compatible; XinhuiyingDashboard/1.0)",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: upstreamHeaders,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`profile upstream ${response.status}`);
      const payload: unknown = await response.json();
      if (!isRecord(payload)) throw new Error("invalid profile payload");
      return payload;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("profile unavailable");
}

function cleanItem(value: Record<string, unknown>) {
  return {
    name: String(value.ITEM_NAME ?? "").trim(),
    revenueRatio: Number(value.MBI_RATIO ?? 0),
    grossMargin: Number(value.GROSS_RPOFIT_RATIO ?? 0),
  };
}

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.toUpperCase() ?? "";
  if (!/^(SH|SZ)\d{6}$/.test(code)) {
    return Response.json({ error: "invalid code" }, { status: 400 });
  }

  const [surveyResult, businessResult] = await Promise.allSettled([
    fetchJson(`https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/PageAjax?code=${code}`),
    fetchJson(`https://emweb.securities.eastmoney.com/PC_HSF10/BusinessAnalysis/PageAjax?code=${code}`),
  ]);

  const survey = surveyResult.status === "fulfilled" ? surveyResult.value : {};
  const business = businessResult.status === "fulfilled" ? businessResult.value : {};
  const profile = asRecords(survey.jbzl)[0] ?? {};
  const rows = asRecords(business.zygcfx) as BusinessItem[];
  const latest = rows
    .map((row) => String(row.REPORT_DATE ?? ""))
    .filter(Boolean)
    .sort()
    .at(-1) ?? "";
  const current = rows.filter((row) => String(row.REPORT_DATE ?? "") === latest);
  const sortByRevenue = (left: BusinessItem, right: BusinessItem) =>
    Number(right.MBI_RATIO ?? 0) - Number(left.MBI_RATIO ?? 0);

  const result = {
    industry: String(profile.EM2016 ?? profile.INDUSTRYCSRC1 ?? "").trim(),
    reportDate: latest.slice(0, 10),
    segments: current
      .filter((row) => String(row.MAINOP_TYPE ?? "") === "1")
      .sort(sortByRevenue)
      .slice(0, 4)
      .map((row) => cleanItem(row as Record<string, unknown>)),
    products: current
      .filter((row) => String(row.MAINOP_TYPE ?? "") === "2")
      .sort(sortByRevenue)
      .slice(0, 6)
      .map((row) => cleanItem(row as Record<string, unknown>)),
  };

  if (!result.industry && result.segments.length === 0 && result.products.length === 0) {
    console.error(JSON.stringify({
      message: "profile upstream unavailable",
      code,
      survey: surveyResult.status,
      business: businessResult.status,
    }));
    return Response.json(
      { ...result, error: "profile upstream unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(result, {
    headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" },
  });
}
