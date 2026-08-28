export const dynamic="force-dynamic";
export async function GET(request:Request){
  const code=new URL(request.url).searchParams.get("code")?.toUpperCase()||"";
  if(!/^(SH|SZ)\d{6}$/.test(code))return Response.json({error:"invalid code"},{status:400});
  try{
    const[surveyRes,businessRes]=await Promise.all([fetch(`https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/PageAjax?code=${code}`),fetch(`https://emweb.securities.eastmoney.com/PC_HSF10/BusinessAnalysis/PageAjax?code=${code}`)]);
    const survey:any=surveyRes.ok?await surveyRes.json():{};const business:any=businessRes.ok?await businessRes.json():{};const p=survey?.jbzl?.[0]||{};const rows=business?.zygcfx||[];const dates=rows.map((x:any)=>String(x.REPORT_DATE||"")).filter(Boolean).sort().reverse();const latest=dates[0]||"";const current=rows.filter((x:any)=>String(x.REPORT_DATE||"")===latest);const clean=(x:any)=>({name:String(x.ITEM_NAME||""),revenueRatio:Number(x.MBI_RATIO||0),grossMargin:Number(x.GROSS_RPOFIT_RATIO||0)});
    return Response.json({industry:p.EM2016||p.INDUSTRYCSRC1||"",reportDate:latest.slice(0,10),segments:current.filter((x:any)=>String(x.MAINOP_TYPE)==="1").sort((a:any,b:any)=>Number(b.MBI_RATIO)-Number(a.MBI_RATIO)).slice(0,4).map(clean),products:current.filter((x:any)=>String(x.MAINOP_TYPE)==="2").sort((a:any,b:any)=>Number(b.MBI_RATIO)-Number(a.MBI_RATIO)).slice(0,6).map(clean)},{headers:{"Cache-Control":"public, max-age=300"}})
  }catch{return Response.json({industry:"",reportDate:"",segments:[],products:[]})}
}
