/** Cloudflare Worker entry point for the Xin Hui Ying dashboard. */
import handler from "vinext/server/app-router-entry";

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // The standalone Tencent Cloud server exposes three public entry points:
    // / for the standard generator, /ai for DeepSeek and /all for both modes.
    if (!env?.ASSETS) {
      const url = new URL(request.url);
      const referer = request.headers.get("referer");
      let refererPath = "";
      if (referer) try { refererPath = new URL(referer).pathname; } catch { refererPath = ""; }
      const allowsAi = url.pathname === "/ai" || url.pathname === "/all" ||
        (url.pathname === "/api/generate" && (refererPath === "/ai" || refererPath === "/all"));
      if (!allowsAi) return handler.fetch(request, env, ctx);

      const headers = new Headers(request.headers);
      headers.set("x-xinhuiying-ai-site", "1");
      return handler.fetch(new Request(request, { headers }), env, ctx);
    }

    const url = new URL(request.url);
    if (url.pathname === "/") url.pathname = "/ai";

    const headers = new Headers(request.headers);
    headers.set("x-xinhuiying-ai-site", "1");
    const aiRequest = new Request(new Request(url, request), { headers });
    return handler.fetch(aiRequest, env, ctx);
  },
} satisfies ExportedHandler<Env>;

export default worker;
