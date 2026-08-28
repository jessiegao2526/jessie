export const dynamic="force-dynamic";
export async function GET(request:Request){
  const code=new URL(request.url).searchParams.get("code")?.toUpperCase()||"";
  if(!/^(SH|SZ)\d{6}$/.test(code))return Response.json({error:"invalid code"},{status:400});
  try{const r=await fetch(`https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/PageAjax?code=${code}`);if(!r.ok)throw new Error();const j:any=await r.json();const p=j?.jbzl?.[0]||{};return Response.json({businessScope:p.BUSINESS_SCOPE||"",profile:p.ORG_PROFILE||"",industry:p.EM2016||p.INDUSTRYCSRC1||""},{headers:{"Cache-Control":"public, max-age=300"}})}catch{return Response.json({businessScope:"",profile:"",industry:""})}
}
