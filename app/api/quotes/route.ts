export const dynamic = "force-dynamic";
export async function GET(request:Request){
  const secids=new URL(request.url).searchParams.get("secids")?.split(",").filter(Boolean).slice(0,30)||[];
  const quotes=await Promise.all(secids.map(async secid=>{
    const url=`https://push2.eastmoney.com/api/qt/stock/get?secid=${encodeURIComponent(secid)}&fields=f57,f58,f43,f60,f170`;
    const r=await fetch(url); const j:any=await r.json(); const d=j.data;
    return {secid,code:d.f57,name:d.f58,price:Number(d.f43)/100,prevClose:Number(d.f60)/100,changePct:Number(d.f170)/100,time:new Date().toISOString()};
  }));
  return Response.json({quotes},{headers:{"Cache-Control":"no-store"}});
}
