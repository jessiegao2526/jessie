/** Cloudflare Worker entry point for the Xin Hui Ying dashboard. */
import handler from "vinext/server/app-router-entry";

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // The standalone Tencent Cloud server has no ASSETS binding. It serves the
    // fixed-rule site directly, while Cloudflare is the isolated AI website.
    if (!env?.ASSETS) return handler.fetch(request, env, ctx);

    const url = new URL(request.url);
    if (url.pathname === "/") url.pathname = "/ai";

    const headers = new Headers(request.headers);
    headers.set("x-xinhuiying-ai-site", "1");
    const aiRequest = new Request(new Request(url, request), { headers });
    return handler.fetch(aiRequest, env, ctx);
  },
} satisfies ExportedHandler<Env>;

export default worker;
