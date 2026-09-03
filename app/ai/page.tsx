import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Dashboard } from "../page";

export const metadata: Metadata = {
  title: "鑫汇盈 AI 话术生成器 · DeepSeek 智能版",
  description: "结合实时行情与最新主营资料，通过 DeepSeek 生成更贴合企业的一句话买入逻辑。",
};

export const dynamic = "force-dynamic";

export default async function AiDashboard(){
  const requestHeaders = await headers();
  if (requestHeaders.get("x-xinhuiying-ai-site") !== "1") notFound();
  return <Dashboard aiMode/>;
}
