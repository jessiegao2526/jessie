import type { Metadata } from "next";
import { Dashboard } from "../page";

export const metadata: Metadata = {
  title: "鑫汇盈双模式话术生成器",
  description: "在普通话术与 DeepSeek 智能话术之间快速切换，并统一管理鑫汇盈持仓。",
};

export default function CombinedDashboard(){
  return <Dashboard allowModeSwitch/>;
}
