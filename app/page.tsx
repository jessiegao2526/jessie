"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Holding = { secid:string; code:string; name:string; market:string; cost:number };
type Quote = { secid:string; code:string; name:string; price:number; prevClose:number; changePct:number; time:string };
type Suggestion = { secid:string; code:string; name:string; market:string };

const seed: Holding[] = [{ secid:"1.601985", code:"601985", name:"中国核电", market:"SH", cost:8.9 }];
const money = (n:number) => new Intl.NumberFormat("zh-CN",{style:"currency",currency:"CNY",minimumFractionDigits:2}).format(n);
const signed = (n:number,suffix="%") => `${n>0?"+":n<0?"−":""}${Math.abs(n).toFixed(2)}${suffix}`;

export default function Home() {
  const [holdings,setHoldings] = useState<Holding[]>(seed);
  const [quotes,setQuotes] = useState<Record<string,Quote>>({});
  const [modal,setModal] = useState(false);
  const [query,setQuery] = useState("");
  const [suggestions,setSuggestions] = useState<Suggestion[]>([]);
  const [selected,setSelected] = useState<Suggestion|null>(null);
  const [cost,setCost] = useState("");
  const [loading,setLoading] = useState(false);
  const [updated,setUpdated] = useState("正在连接行情");
  const [error,setError] = useState("");

  useEffect(()=>{const saved=localStorage.getItem("mingshi-holdings"); if(saved){try{setHoldings(JSON.parse(saved))}catch{}}},[]);
  useEffect(()=>{localStorage.setItem("mingshi-holdings",JSON.stringify(holdings))},[holdings]);

  const refresh = useCallback(async()=>{
    if(!holdings.length) return;
    setLoading(true); setError("");
    try{
      const liveQuotes:Quote[]=await Promise.all(holdings.map(async h=>{
        const url=`https://push2.eastmoney.com/api/qt/stock/get?secid=${encodeURIComponent(h.secid)}&fields=f57,f58,f43,f60,f170&_=${Date.now()}`;
        const res=await fetch(url);
        if(!res.ok) throw new Error("quote unavailable");
        const json=await res.json(); const d=json?.data;
        if(!d||!Number.isFinite(Number(d.f43))) throw new Error("invalid quote");
        return {secid:h.secid,code:d.f57,name:d.f58,price:Number(d.f43)/100,prevClose:Number(d.f60)/100,changePct:Number(d.f170)/100,time:new Date().toISOString()};
      }));
      setQuotes(Object.fromEntries(liveQuotes.map(q=>[q.secid,q])));
      setUpdated(new Date().toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",second:"2-digit"}));
    } catch { setError("行情连接暂时中断，稍后自动重试"); }
    finally { setLoading(false); }
  },[holdings]);
  useEffect(()=>{refresh(); const t=setInterval(refresh,15000); return()=>clearInterval(t)},[refresh]);

  useEffect(()=>{
    if(selected||query.trim().length<2){setSuggestions([]);return}
    if(/^\d{6}$/.test(query.trim())){
      const code=query.trim(); const isShanghai=code.startsWith("5")||code.startsWith("6")||code.startsWith("9");
      setSuggestions([{secid:`${isShanghai?"1":"0"}.${code}`,code,name:"按代码添加",market:isShanghai?"SH":"SZ"}]); return;
    }
    const t=setTimeout(async()=>{try{const r=await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);const d=await r.json();setSuggestions(d.results||[])}catch{}},260);
    return()=>clearTimeout(t);
  },[query,selected]);

  const stats=useMemo(()=>{
    const active=holdings.map(h=>({h,q:quotes[h.secid]})).filter(x=>x.q);
    const profitPct=active.length?active.reduce((s,{h,q})=>s+(q.price-h.cost)/h.cost*100,0)/active.length:0;
    const todayPct=active.length?active.reduce((s,{q})=>s+q.changePct,0)/active.length:0;
    return {profitPct,todayPct};
  },[holdings,quotes]);

  function close(){setModal(false);setQuery("");setSelected(null);setCost("");setSuggestions([])}
  function add(){if(!selected||Number(cost)<=0)return;setHoldings(v=>[...v.filter(h=>h.secid!==selected.secid),{...selected,cost:Number(cost)}]);close()}
  function choose(s:Suggestion){setSelected(s);setQuery(`${s.name}  ${s.code}.${s.market}`);setSuggestions([])}

  return <main>
    <header className="topbar"><div className="brand"><span className="brandMark">↗</span><span>鑫汇盈持仓</span></div><div className="market"><i /> A股行情 <span>{loading?"更新中…":`更新于 ${updated}`}</span></div></header>
    <section className="hero"><div><p className="eyebrow">PORTFOLIO PULSE</p><h1>看清每一次涨跌</h1><p className="subtitle">把关注的持仓放在一起，价格、涨幅和收益一目了然。</p></div><button className="primary" onClick={()=>setModal(true)}>＋ 添加个股</button></section>
    <section className="summary">
      <div><span>平均持仓收益</span><strong className={stats.profitPct>=0?"up":"down"}>{signed(stats.profitPct)}</strong><small>按个股等权计算</small></div>
      <div><span>持仓数量</span><strong>{holdings.length}</strong><small>只股票</small></div>
      <div><span>今日平均涨幅</span><strong className={stats.todayPct>=0?"up":"down"}>{signed(stats.todayPct)}</strong><small>实时行情 · 盘中</small></div>
    </section>
    <section className="card">
      <div className="cardHead"><div><h2>我的持仓</h2><p>{error||"每 15 秒自动刷新 · 公开行情数据仅供参考"}</p></div><button className="refresh" onClick={refresh} disabled={loading}>{loading?"刷新中":"↻ 刷新"}</button></div>
      <div className="tableWrap"><table><thead><tr><th>代码 / 名称</th><th>成本</th><th>现价</th><th>持仓收益</th><th>当日涨幅</th><th /></tr></thead><tbody>
        {holdings.map(h=>{const q=quotes[h.secid];const price=q?.price||0;const gain=h.cost?(price-h.cost)/h.cost*100:0;return <tr key={h.secid}><td><b>{q?.name||h.name}</b><span>{h.code}.{h.market}</span></td><td>{money(h.cost)}</td><td>{q?<b>{money(price)}</b>:<span className="skeleton">获取中</span>}</td><td className={gain>=0?"up":"down"}><b>{q?signed(gain):"—"}</b></td><td><em className={`pill ${(q?.changePct||0)>=0?"up":"down"}`}>{q?signed(q.changePct):"—"}</em></td><td><button className="remove" aria-label={`删除${h.name}`} onClick={()=>setHoldings(v=>v.filter(x=>x.secid!==h.secid))}>×</button></td></tr>})}
        {!holdings.length&&<tr><td colSpan={6} className="empty"><b>还没有持仓</b><span>添加一只股票，行情会自动出现在这里。</span><button onClick={()=>setModal(true)}>添加第一只</button></td></tr>}
      </tbody></table></div>
    </section>
    <footer>投资有风险，市场行情可能存在延迟，本看板不构成投资建议。</footer>
    {modal&&<div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&close()}><div className="modal" role="dialog" aria-modal="true" aria-label="添加持仓"><button className="close" onClick={close}>×</button><p className="eyebrow">NEW POSITION</p><h2>添加一只持仓</h2><p className="modalLead">输入股票名称或 6 位代码，我们会自动匹配。</p>
      <label>股票</label><div className="searchBox"><span>⌕</span><input autoFocus value={query} placeholder="例如：中国核电 / 601985" onChange={e=>{setQuery(e.target.value);setSelected(null)}} /></div>
      {!!suggestions.length&&<div className="suggestions">{suggestions.map(s=><button key={s.secid} onClick={()=>choose(s)}><span><b>{s.name}</b><small>{s.code}.{s.market}</small></span><i>选择</i></button>)}</div>}
      <div className="formRow"><div><label>持仓成本（元）</label><input type="number" min="0" step="0.01" value={cost} placeholder="8.90" onChange={e=>setCost(e.target.value)} /></div></div>
      <button className="submit" disabled={!selected||Number(cost)<=0} onClick={add}>添加到看板</button>
    </div></div>}
  </main>
}
