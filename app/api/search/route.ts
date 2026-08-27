export const dynamic = "force-dynamic";
export async function GET(request:Request){
  const q=new URL(request.url).searchParams.get("q")?.trim()||""; if(q.length<2)return Response.json({results:[]});
  const url=`https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(q)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8`;
  const r=await fetch(url); const j:any=await r.json();
  const data=(j?.QuotationCodeTable?.Data||[]).filter((x:any)=>x.Classify==="AStock").slice(0,6);
  return Response.json({results:data.map((x:any)=>({secid:x.QuoteID,code:x.Code,name:x.Name,market:x.MktNum==="1"?"SH":"SZ"}))},{headers:{"Cache-Control":"public, max-age=30"}});
}
