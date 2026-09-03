"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Holding={secid:string;code:string;name:string;market:string;cost:number};
type Portfolio={id:string;name:string;holdings:Holding[]};
type Quote={secid:string;code:string;name:string;price:number;prevClose:number;changePct:number;time:string};
type Suggestion={secid:string;code:string;name:string;market:string};
type QuotePayload={secid:string;code:string;name:string;price:number;prevClose:number;changePct:number;industry?:string;concepts?:string;time:string};
type ProfileItem={name:string;revenueRatio:number;grossMargin:number};
type StockProfile={industry?:string;segments?:ProfileItem[];products?:ProfileItem[]};
type AiGenerateInput={name:string;code:string;price:number;industry:string;concepts:string[];segments:ProfileItem[];products:ProfileItem[]};
type AiCacheEntry={logic:string;expiresAt:number};

const seed:Portfolio[]=[{id:"default",name:"默认组合",holdings:[{secid:"1.601985",code:"601985",name:"中国核电",market:"SH",cost:8.9}]}];
const money=(n:number)=>new Intl.NumberFormat("zh-CN",{style:"currency",currency:"CNY",minimumFractionDigits:2}).format(n);
const signed=(n:number)=>`${n>0?"+":n<0?"−":""}${Math.abs(n).toFixed(2)}%`;
const stockCode=(value:string)=>value.trim().toUpperCase().match(/^(\d{6})(?:\.(SH|SZ))?$/)?.[1]||null;
const AI_BROWSER_CACHE_MS=7*24*60*60*1000;
function aiCacheKey(input:AiGenerateInput){
  const source=JSON.stringify({v:2,code:input.code,industry:input.industry,concepts:[...input.concepts].sort(),segments:input.segments.map(x=>x.name),products:input.products.map(x=>x.name)});
  let hash=2166136261;for(let i=0;i<source.length;i+=1){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619)}
  return `xinhuiying-ai:${input.code}:${(hash>>>0).toString(36)}`;
}

const verifiedRule:Record<string,string>={
  "300394":"光器件领先，受益AI算力扩容",
  "600667":"洁净室工程领先，受益晶圆厂扩产",
  "601985":"核电运营龙头，受益核准提速",
};
const businessRules:Array<[RegExp,string]>=[
  [/(洁净室|洁净工程|电子工程|晶圆厂工程)/,"洁净室工程领先，受益晶圆厂扩产"],
  [/(光模块|光器件|光通信|光电子)/,"深耕光通信器件，受益AI算力扩容"],
  [/(核电运营|核能发电|核电发电)/,"聚焦核电运营，受益机组核准提速"],
  [/(封装测试|集成电路封测|先进封装)/,"半导体封测领先，受益国产替代"],
  [/(半导体设备|刻蚀|薄膜沉积|清洗设备)/,"聚焦半导体设备，受益国产替代"],
  [/(存储芯片|存储器|DRAM|NAND)/i,"深耕存储芯片，受益周期复苏"],
  [/(印制电路|电路板|PCB)/i,"聚焦高端PCB，受益算力硬件升级"],
  [/(服务器|算力设备|液冷|数据中心)/,"聚焦算力基础设施，受益AI扩容"],
  [/(变压器|输变电|电网设备|高压开关)/,"深耕电网设备，受益电网投资提速"],
  [/(工业机器人|减速器|伺服系统|机器视觉)/,"聚焦机器人核心部件，受益产业放量"],
  [/(动力电池|锂电池|电池材料|电解液)/,"深耕锂电产业链，受益储能需求增长"],
  [/(光伏组件|光伏逆变器|太阳能发电)/,"聚焦光伏产业链，受益装机需求增长"],
  [/(风电整机|风机叶片|海上风电)/,"深耕风电设备，受益海风建设提速"],
  [/(汽车零部件|汽车电子|智能座舱)/,"聚焦汽车零部件，受益智能化升级"],
  [/(军工电子|航空装备|航天装备|船舶制造)/,"深耕高端装备，受益国防需求增长"],
  [/(创新药|生物制药|原料药)/,"聚焦医药研发，受益创新药需求释放"],
  [/(医疗器械|医学影像|体外诊断)/,"深耕医疗器械，受益国产替代"],
  [/(黄金采选|金矿|贵金属)/,"聚焦黄金资源，受益金价中枢上行"],
  [/(铜矿|铝业|稀土|有色金属)/,"深耕资源品，受益供需格局改善"],
  [/(证券经纪|证券业务|券商)/,"聚焦证券服务，受益资本市场活跃"],
  [/(银行业务|商业银行)/,"深耕银行主业，受益息差企稳"],
  [/(煤炭开采|煤矿|焦煤)/,"聚焦煤炭资源，受益高股息价值"],
  [/(白酒|酒类生产)/,"深耕品牌白酒，受益消费需求修复"],
];
function cleanBusiness(value:string){return String(value||"").replace(/[（(].*?(?:补充|其他).*?[）)]/g,"").replace(/其他|补充|合计|主营业务|抵销/g,"").trim()}
function validProfileItem(item:ProfileItem){return Boolean(cleanBusiness(item.name))&&Number(item.revenueRatio||0)>=.03}
function cleanConcept(value:string){return value.trim().replace(/概念$/g,"")}
function validConcept(value:string){return Boolean(value)&&!/(板块|融资|转融|重仓|沪股通|深股通|高送转|预亏|预增|基金|社保|MSCI|富时|其他|补充)/i.test(value)}
function fitFixedLogic(value:string){return Array.from(value.replace(/受益于/g,"受益").replace(/[。；;]+$/g,"")).slice(0,20).join("").replace(/[，,。；;]+$/g,"")}
function conceptCatalyst(concepts:string[],industry:string){
  const signal=`${concepts.join("、")}、${industry}`;
  if(/AI|算力|CPO|数据中心/i.test(signal))return "AI算力扩容";
  if(/国产替代|自主可控|信创/.test(signal))return "国产替代";
  if(/低空经济|无人机/.test(signal))return "低空经济提速";
  if(/机器人/.test(signal))return "机器人产业放量";
  if(/储能/.test(signal))return "储能需求增长";
  if(/新能源车|汽车电子/.test(signal))return "汽车智能化升级";
  if(/一带一路|出海/.test(signal))return "海外需求增长";
  const theme=cleanBusiness(concepts[0]||industry||"产业").replace(/行业$/g,"");
  return `${Array.from(theme).slice(0,6).join("")}需求`;
}
function fixedRuleLogic(code:string,profile:StockProfile|null,quote:QuotePayload){
  if(verifiedRule[code])return verifiedRule[code];
  const items=[...(profile?.segments||[]),...(profile?.products||[])].filter(validProfileItem);
  const businesses=[...new Set(items.map(item=>cleanBusiness(item.name)).filter(Boolean))];
  const industry=cleanBusiness(profile?.industry||quote.industry||"");
  const concepts=[...new Set(String(quote.concepts||"").split(",").map(cleanConcept).filter(validConcept))];
  const coreSignal=`${businesses.join("、")}、${industry}`;
  const matched=businessRules.find(([pattern])=>pattern.test(coreSignal));
  if(matched)return matched[1];
  const primary=Array.from(businesses[0]||industry||"核心主业").slice(0,7).join("");
  const catalyst=conceptCatalyst(concepts,industry);
  return fitFixedLogic(`聚焦${primary}，受益${catalyst}`);
}

async function searchStocks(query:string){
  const exact=stockCode(query);if(exact){const suffix=query.trim().toUpperCase().endsWith(".SZ")?"SZ":query.trim().toUpperCase().endsWith(".SH")?"SH":/^[569]/.test(exact)?"SH":"SZ";const secid=`${suffix==="SH"?"1":"0"}.${exact}`;try{const d=await fetchQuote(secid);return[{secid,code:d.code||exact,name:d.name||exact,market:suffix}]}catch{}}
  const r=await fetch(`/api/search?q=${encodeURIComponent(query)}`);if(!r.ok)throw new Error();const d=await r.json() as {results?:Suggestion[]};return d.results||[];
}
async function fetchQuote(secid:string,extended=false){
  const r=await fetch(`/api/quotes?secids=${encodeURIComponent(secid)}${extended?"&extended=1":""}`,{cache:"no-store"});
  const j=await r.json() as {quotes?:QuotePayload[]};if(!r.ok||!j.quotes?.[0])throw new Error();return j.quotes[0];
}

export function Dashboard({aiMode=false}:{aiMode?:boolean}){
  const[portfolios,setPortfolios]=useState<Portfolio[]>(seed);const[activeId,setActiveId]=useState("default");
  const[quotes,setQuotes]=useState<Record<string,Quote>>({});const[loading,setLoading]=useState(false);const[updated,setUpdated]=useState("正在连接行情");const[error,setError]=useState("");
  const[holdingModal,setHoldingModal]=useState(false);const[groupModal,setGroupModal]=useState<"new"|"rename"|null>(null);const[groupName,setGroupName]=useState("");
  const[query,setQuery]=useState("");const[suggestions,setSuggestions]=useState<Suggestion[]>([]);const[selected,setSelected]=useState<Suggestion|null>(null);const[cost,setCost]=useState("");
  const[speechQuery,setSpeechQuery]=useState("");const[speechSuggestions,setSpeechSuggestions]=useState<Suggestion[]>([]);const[speechSelected,setSpeechSelected]=useState<Suggestion|null>(null);const[speech,setSpeech]=useState("");const[speechLoading,setSpeechLoading]=useState(false);const[speechError,setSpeechError]=useState("");const[speechCached,setSpeechCached]=useState(false);
  const[speechStock,setSpeechStock]=useState<(Suggestion&{price:number})|null>(null);const[speechAddModal,setSpeechAddModal]=useState(false);const[targetPortfolio,setTargetPortfolio]=useState("default");const[newPortfolioName,setNewPortfolioName]=useState("");const[speechCost,setSpeechCost]=useState("");
  const active=portfolios.find(p=>p.id===activeId)||portfolios[0];const holdings=active?.holdings||[];

  useEffect(()=>{try{const saved=localStorage.getItem("xinhuiying-portfolios");if(saved){const parsed=JSON.parse(saved);setPortfolios(parsed);setActiveId(parsed[0]?.id||"default");return}const old=localStorage.getItem("mingshi-holdings");if(old)setPortfolios([{id:"default",name:"默认组合",holdings:JSON.parse(old)}])}catch{}},[]);
  useEffect(()=>{localStorage.setItem("xinhuiying-portfolios",JSON.stringify(portfolios))},[portfolios]);

  const allHoldings=useMemo(()=>Array.from(new Map(portfolios.flatMap(p=>p.holdings).map(h=>[h.secid,h])).values()),[portfolios]);
  const refresh=useCallback(async()=>{if(!allHoldings.length)return;setLoading(true);setError("");try{const secids=allHoldings.map(h=>h.secid).join(",");const r=await fetch(`/api/quotes?secids=${encodeURIComponent(secids)}`,{cache:"no-store"});const data=await r.json() as {quotes?:Quote[]};const live=data.quotes||[];if(!r.ok||!live.length)throw new Error();setQuotes(current=>({...current,...Object.fromEntries(live.map(q=>[q.secid,q]))}));setUpdated(new Date().toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",second:"2-digit"}));if(live.length<allHoldings.length)setError("部分行情暂时未更新，稍后自动重试")}catch{setError("行情连接暂时中断，稍后自动重试")}finally{setLoading(false)}},[allHoldings]);
  useEffect(()=>{refresh();const t=setInterval(refresh,15000);return()=>clearInterval(t)},[refresh]);

  useEffect(()=>{if(selected||query.trim().length<2){setSuggestions([]);return}const raw=query.trim();const t=setTimeout(()=>searchStocks(raw).then(items=>{const code=stockCode(raw);if(code&&items[0]?.code===code){setSelected(items[0]);setQuery(`${items[0].name}  ${items[0].code}.${items[0].market}`);setSuggestions([])}else setSuggestions(items)}).catch(()=>setSuggestions([])),260);return()=>clearTimeout(t)},[query,selected]);
  useEffect(()=>{if(speechSelected||speechQuery.trim().length<2){setSpeechSuggestions([]);return}const raw=speechQuery.trim();const t=setTimeout(()=>searchStocks(raw).then(items=>{const code=stockCode(raw);if(code&&items[0]?.code===code){setSpeechSelected(items[0]);setSpeechQuery(`${items[0].name}  ${items[0].code}.${items[0].market}`);setSpeechSuggestions([])}else setSpeechSuggestions(items)}).catch(()=>setSpeechSuggestions([])),260);return()=>clearTimeout(t)},[speechQuery,speechSelected]);

  const stats=useMemo(()=>{const rows=holdings.map(h=>({h,q:quotes[h.secid]})).filter(x=>x.q);return{profitPct:rows.length?rows.reduce((s,{h,q})=>s+(q.price-h.cost)/h.cost*100,0)/rows.length:0,todayPct:rows.length?rows.reduce((s,{q})=>s+q.changePct,0)/rows.length:0}},[holdings,quotes]);
  function updateActive(fn:(items:Holding[])=>Holding[]){setPortfolios(ps=>ps.map(p=>p.id===activeId?{...p,holdings:fn(p.holdings)}:p))}
  function closeHolding(){setHoldingModal(false);setQuery("");setSelected(null);setCost("");setSuggestions([])}
  function addHolding(){if(!selected||Number(cost)<=0)return;updateActive(items=>[...items.filter(h=>h.secid!==selected.secid),{...selected,name:selected.name==="按代码查询"?selected.code:selected.name,cost:Number(cost)}]);closeHolding()}
  function saveGroup(){const name=groupName.trim();if(!name)return;if(groupModal==="new"){const id=`p-${Date.now()}`;setPortfolios(ps=>[...ps,{id,name,holdings:[]}]);setActiveId(id)}else setPortfolios(ps=>ps.map(p=>p.id===activeId?{...p,name}:p));setGroupModal(null);setGroupName("")}
  function deleteGroup(){if(portfolios.length<=1)return;const next=portfolios.filter(p=>p.id!==activeId);setPortfolios(next);setActiveId(next[0].id)}
  async function generateAiSpeech(){
    if(!speechSelected)return;
    setSpeechLoading(true);setSpeechError("");setSpeechCached(false);
    try{
      const d=await fetchQuote(speechSelected.secid,true);const price=d.price;const market=speechSelected.market;
      const profile=await fetch(`/api/profile?code=${market}${d.code}`).then(async r=>r.ok?await r.json() as StockProfile:null).catch(()=>null);
      const clean=(x:ProfileItem)=>String(x.name||"").replace(/[（(].*?(?:补充|其他).*?[）)]/g,"").trim();
      const useful=(x:ProfileItem)=>Boolean(clean(x))&&!/(其他|补充|合计|主营业务|抵销)/.test(x.name)&&Number(x.revenueRatio||0)>=.03;
      const concepts=[...new Set(String(d.concepts||"").split(",").map(x=>x.trim().replace(/概念$/,""))).values()].filter(x=>x&&!/(板块|融资|转融|重仓|沪股通|深股通|高送转|预亏|预增|基金|社保|MSCI|富时)/.test(x));
      const aiInput:AiGenerateInput={name:d.name,code:d.code,price,industry:profile?.industry||d.industry||"",concepts,segments:(profile?.segments||[]).filter(useful).slice(0,5),products:(profile?.products||[]).filter(useful).slice(0,5)};
      const cacheKey=aiCacheKey(aiInput);let result:{logic?:string;error?:string;cached?:boolean}|null=null;
      try{const saved=localStorage.getItem(cacheKey);if(saved){const entry=JSON.parse(saved) as AiCacheEntry;if(entry.logic&&entry.expiresAt>Date.now())result={logic:entry.logic,cached:true};else localStorage.removeItem(cacheKey)}}catch{}
      if(!result){const response=await fetch("/api/generate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(aiInput)});result=await response.json() as {logic?:string;error?:string;cached?:boolean};if(!response.ok||!result.logic)throw new Error(result.error||"AI 暂时无法生成，请稍后重试");try{localStorage.setItem(cacheKey,JSON.stringify({logic:result.logic,expiresAt:Date.now()+AI_BROWSER_CACHE_MS}))}catch{}}
      if(!result.logic)throw new Error(result.error||"AI 暂时无法生成，请稍后重试");
      setSpeech(`${d.name}（${d.code}）：${result.logic}，建仓一成，止损价建议设为${(price*.85).toFixed(2)}元左右`);setSpeechCached(Boolean(result.cached));
      setSpeechStock({secid:speechSelected.secid,code:d.code,name:d.name,market,price});setSpeechCost(price.toFixed(2));setSpeechQuery(`${d.name}  ${d.code}`);
    }catch(error){setSpeechError(error instanceof Error?error.message:"DeepSeek 暂时无法生成，请稍后重试")}
    finally{setSpeechLoading(false)}
  }
  async function generateSpeech(){
    if(aiMode){await generateAiSpeech();return}
    if(!speechSelected)return;
    setSpeechLoading(true);setSpeechError("");
    try{
      const d=await fetchQuote(speechSelected.secid,true);const price=d.price;const market=speechSelected.market;
      const profile=await fetch(`/api/profile?code=${market}${d.code}`).then(async r=>r.ok?await r.json() as StockProfile:null).catch(()=>null);
      const logic=fixedRuleLogic(d.code,profile,d);
      setSpeech(`${d.name}（${d.code}）：${logic}，建仓一成，止损价建议设为${(price*.85).toFixed(2)}元左右`);
      setSpeechStock({secid:speechSelected.secid,code:d.code,name:d.name,market,price});setSpeechCost(price.toFixed(2));setSpeechQuery(`${d.name}  ${d.code}`);
    }catch{setSpeechError("暂时无法取得该股票资料，请稍后重试")}
    finally{setSpeechLoading(false)}
  }
  function copySpeech(){if(speech)navigator.clipboard.writeText(speech)}
  function openSpeechAdd(){if(!speechStock)return;setTargetPortfolio(activeId);setNewPortfolioName("");setSpeechCost(speechStock.price.toFixed(2));setSpeechAddModal(true)}
  function addSpeechStock(){if(!speechStock||Number(speechCost)<=0)return;const holding:Holding={secid:speechStock.secid,code:speechStock.code,name:speechStock.name,market:speechStock.market,cost:Number(speechCost)};if(targetPortfolio==="__new"){const name=newPortfolioName.trim();if(!name)return;const id=`p-${Date.now()}`;setPortfolios(ps=>[...ps,{id,name,holdings:[holding]}]);setActiveId(id)}else{setPortfolios(ps=>ps.map(p=>p.id===targetPortfolio?{...p,holdings:[...p.holdings.filter(h=>h.secid!==holding.secid),holding]}:p));setActiveId(targetPortfolio)}setSpeechAddModal(false);setTimeout(()=>document.getElementById("holdings")?.scrollIntoView({behavior:"smooth"}),80)}

  return <main>
    <header className="topbar"><div className="brand"><span className="brandMark">↗</span><span>鑫汇盈</span></div><div className="market"><i/>A股行情 <span>{loading?"更新中…":`更新于 ${updated}`}</span></div></header>

    <section className={`generator ${aiMode?"aiGenerator":""}`}><div className="generatorCopy"><p className="eyebrow">{aiMode?"XINHUIYING · DEEPSEEK AI":"XINHUIYING SCRIPT"}</p><h1>{aiMode?"鑫汇盈 AI 话术生成器":"鑫汇盈话术生成器"}</h1><p>{aiMode?"结合实时行情、主营构成与 DeepSeek Flash，生成20字以内、更有辨识度的荐股逻辑。":"输入股票名称或代码，即刻生成简洁的买入逻辑与参考止损价。"}</p></div><div className="generatorPanel">
      <label>股票名称 / 股票代码</label><div className="generatorInput"><span>⌕</span><input value={speechQuery} placeholder="例如：中国核电 / 601985" onChange={e=>{setSpeechQuery(e.target.value);setSpeechSelected(null);setSpeech("")}}/><button disabled={!speechSelected||speechLoading} onClick={generateSpeech}>{speechLoading?"生成中":aiMode?"AI 生成":"生成话术"}</button></div>
      {!!speechSuggestions.length&&<div className="suggestions generatorSuggestions">{speechSuggestions.map(s=><button key={s.secid} onClick={()=>{setSpeechSelected(s);setSpeechQuery(`${s.name}  ${s.code}.${s.market}`);setSpeechSuggestions([])}}><span><b>{s.name}</b><small>{s.code}.{s.market}</small></span><i>选择</i></button>)}</div>}
      {speechError&&<p className="formError">{speechError}</p>}{speech&&<div className="speechResult"><span>{aiMode?(speechCached?"已复用智能缓存 · 未消耗模型 TOKEN":"DEEPSEEK FLASH 智能逻辑已生成"):"智能逻辑已生成"}</span><p>{speech}</p><div className="speechButtons"><button onClick={copySpeech}>复制话术</button><button className="addPosition" onClick={openSpeechAdd}>＋ 加入持仓</button></div></div>}
      <small className="generatorNote">{aiMode?"荐股逻辑严格控制在20字以内 · 重复个股7天内优先复用缓存 · 止损价始终按最新现价85%计算":"主营业务优先 · 行业信息其次 · 概念仅作辅助 · 止损价按最新现价85%计算"}</small>
    </div></section>

    <div className="sectionDivider"><span>PORTFOLIO</span></div>
    <section className="hero portfolioHero" id="holdings"><div><p className="eyebrow">PORTFOLIO PULSE</p><h1>鑫汇盈持仓</h1><p className="subtitle">用不同组合管理策略，同一股票可记录不同成本。</p></div><button className="primary" onClick={()=>setHoldingModal(true)}>＋ 添加个股</button></section>
    <section className="portfolioBar"><div className="portfolioTabs">{portfolios.map(p=><button key={p.id} className={p.id===activeId?"active":""} onClick={()=>setActiveId(p.id)}>{p.name}<span>{p.holdings.length}</span></button>)}<button className="newGroup" onClick={()=>{setGroupName("");setGroupModal("new")}}>＋ 新建组合</button></div><div className="portfolioActions"><button onClick={()=>{setGroupName(active.name);setGroupModal("rename")}}>重命名</button><button disabled={portfolios.length<=1} onClick={deleteGroup}>删除组合</button></div></section>
    <section className="summary"><div><span>{active.name} · 平均持仓收益</span><strong className={stats.profitPct>=0?"up":"down"}>{signed(stats.profitPct)}</strong><small>按个股等权计算</small></div><div><span>持仓数量</span><strong>{holdings.length}</strong><small>只股票</small></div><div><span>今日平均涨幅</span><strong className={stats.todayPct>=0?"up":"down"}>{signed(stats.todayPct)}</strong><small>实时行情 · 盘中</small></div></section>
    <section className="card"><div className="cardHead"><div><h2>{active.name}</h2><p>{error||"每 15 秒自动刷新 · 公开行情数据仅供参考"}</p></div><button className="refresh" onClick={refresh} disabled={loading}>{loading?"刷新中":"↻ 刷新"}</button></div><div className="tableWrap"><table><thead><tr><th>代码 / 名称</th><th>成本</th><th>现价</th><th>持仓收益</th><th>当日涨幅</th><th/></tr></thead><tbody>
      {holdings.map(h=>{const q=quotes[h.secid];const price=q?.price||0;const gain=h.cost?(price-h.cost)/h.cost*100:0;return <tr key={h.secid}><td><b>{q?.name||h.name}</b><span>{h.code}.{h.market}</span></td><td>{money(h.cost)}</td><td>{q?<b>{money(price)}</b>:<span className="skeleton">获取中</span>}</td><td className={gain>=0?"up":"down"}><b>{q?signed(gain):"—"}</b></td><td><em className={`pill ${(q?.changePct||0)>=0?"up":"down"}`}>{q?signed(q.changePct):"—"}</em></td><td><button className="remove" aria-label={`删除${h.name}`} onClick={()=>updateActive(items=>items.filter(x=>x.secid!==h.secid))}>×</button></td></tr>})}
      {!holdings.length&&<tr><td colSpan={6} className="empty"><b>这个组合还没有持仓</b><span>同一股票可以在不同组合记录不同成本。</span><button onClick={()=>setHoldingModal(true)}>添加第一只</button></td></tr>}
    </tbody></table></div></section>
    <footer>投资有风险，市场行情可能存在延迟，本页面不构成投资建议。</footer>

    {holdingModal&&<div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&closeHolding()}><div className="modal" role="dialog" aria-modal="true"><button className="close" onClick={closeHolding}>×</button><p className="eyebrow">NEW POSITION</p><h2>添加到「{active.name}」</h2><p className="modalLead">输入股票名称或 6 位代码，我们会自动匹配。</p><label>股票</label><div className="searchBox"><span>⌕</span><input autoFocus value={query} placeholder="例如：中国核电 / 601985" onChange={e=>{setQuery(e.target.value);setSelected(null)}}/></div>{!!suggestions.length&&<div className="suggestions">{suggestions.map(s=><button key={s.secid} onClick={()=>{setSelected(s);setQuery(`${s.name}  ${s.code}.${s.market}`);setSuggestions([])}}><span><b>{s.name}</b><small>{s.code}.{s.market}</small></span><i>选择</i></button>)}</div>}<div className="formRow"><div><label>持仓成本（元）</label><input type="number" min="0" step="0.01" value={cost} placeholder="8.90" onChange={e=>setCost(e.target.value)}/></div></div><button className="submit" disabled={!selected||Number(cost)<=0} onClick={addHolding}>添加到组合</button></div></div>}
    {groupModal&&<div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setGroupModal(null)}><div className="modal smallModal" role="dialog" aria-modal="true"><button className="close" onClick={()=>setGroupModal(null)}>×</button><p className="eyebrow">PORTFOLIO GROUP</p><h2>{groupModal==="new"?"新建自选组合":"重命名组合"}</h2><p className="modalLead">例如：凤山、武林、稳健组合</p><label>组合名称</label><div className="searchBox"><input autoFocus maxLength={12} value={groupName} placeholder="输入组合名称" onChange={e=>setGroupName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveGroup()}/></div><button className="submit" disabled={!groupName.trim()} onClick={saveGroup}>保存组合</button></div></div>}
    {speechAddModal&&speechStock&&<div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setSpeechAddModal(false)}><div className="modal smallModal" role="dialog" aria-modal="true"><button className="close" onClick={()=>setSpeechAddModal(false)}>×</button><p className="eyebrow">ADD TO PORTFOLIO</p><h2>加入鑫汇盈持仓</h2><p className="modalLead">{speechStock.name} · {speechStock.code}.{speechStock.market}</p><label>选择组合</label><select className="portfolioSelect" value={targetPortfolio} onChange={e=>setTargetPortfolio(e.target.value)}>{portfolios.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}<option value="__new">＋ 新建组合</option></select>{targetPortfolio==="__new"&&<div className="linkedField"><label>新组合名称</label><div className="searchBox"><input autoFocus maxLength={12} value={newPortfolioName} placeholder="例如：凤山、武林" onChange={e=>setNewPortfolioName(e.target.value)}/></div></div>}<div className="linkedField"><label>持仓成本（元）</label><div className="searchBox"><input type="number" min="0" step="0.01" value={speechCost} onChange={e=>setSpeechCost(e.target.value)}/></div><small>已自动填入当前价格，可自行修改</small></div><button className="submit" disabled={Number(speechCost)<=0||(targetPortfolio==="__new"&&!newPortfolioName.trim())} onClick={addSpeechStock}>确认加入</button></div></div>}
  </main>
}

export default function Home(){return <Dashboard/>}
