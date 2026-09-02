type ProfileItem={name?:unknown;revenueRatio?:unknown;grossMargin?:unknown};
type GenerateInput={name?:unknown;code?:unknown;price?:unknown;industry?:unknown;concepts?:unknown;segments?:unknown;products?:unknown};

const WINDOW_MS=60*60*1000;
const MAX_REQUESTS=30;
const requests=new Map<string,{count:number;resetAt:number}>();

function text(value:unknown,max=80){return typeof value==="string"?value.trim().slice(0,max):""}
function number(value:unknown){const n=Number(value);return Number.isFinite(n)?n:0}
function items(value:unknown){return Array.isArray(value)?value.slice(0,5).map((item:ProfileItem)=>({name:text(item?.name,40),revenueRatio:number(item?.revenueRatio),grossMargin:number(item?.grossMargin)})).filter(item=>item.name):[]}
function clientIp(request:Request){return request.headers.get("cf-connecting-ip")||request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown"}
function limited(ip:string){const now=Date.now();const entry=requests.get(ip);if(!entry||entry.resetAt<=now){requests.set(ip,{count:1,resetAt:now+WINDOW_MS});return false}entry.count+=1;return entry.count>MAX_REQUESTS}
function json(data:unknown,status=200){return Response.json(data,{status,headers:{"cache-control":"no-store"}})}

export async function POST(request:Request){
  if(limited(clientIp(request)))return json({error:"当前设备生成次数较多，请稍后再试"},429);
  const apiKey=process.env.DEEPSEEK_API_KEY;
  if(!apiKey)return json({error:"DeepSeek 智能版尚未配置 API Key"},503);

  let body:GenerateInput;
  try{body=await request.json() as GenerateInput}catch{return json({error:"请求格式不正确"},400)}
  const name=text(body.name,20);const code=text(body.code,6);const price=number(body.price);
  if(!name||!/^[0-9]{6}$/.test(code)||price<=0)return json({error:"股票资料不完整，请重新选择股票"},400);

  const stock={name,code,price,industry:text(body.industry,80),concepts:Array.isArray(body.concepts)?body.concepts.slice(0,8).map(x=>text(x,30)).filter(Boolean):[],segments:items(body.segments),products:items(body.products)};
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),25000);
  try{
    const upstream=await fetch("https://api.deepseek.com/chat/completions",{method:"POST",headers:{"content-type":"application/json","authorization":`Bearer ${apiKey}`},signal:controller.signal,body:JSON.stringify({model:process.env.DEEPSEEK_MODEL||"deepseek-v4-flash",thinking:{type:"disabled"},stream:false,max_tokens:120,response_format:{type:"json_object"},messages:[{role:"system",content:"你是严谨的A股研究文案助手。只能依据用户提供的行业、主营产品、收入占比、毛利率和概念信息，生成一句自然、具体的公司逻辑。逻辑控制在15至45个汉字，不含股票名称、代码、建仓比例、止损价，不写收益保证。优先写清核心业务及对应产业催化，避免单独使用‘受益于行业景气提升’、‘双轮驱动’等空泛套话。只有资料充分支持时才能使用‘龙头’或‘领先’。必须输出JSON，格式为{\"logic\":\"一句话逻辑\"}。"},{role:"user",content:`请根据以下JSON资料生成逻辑：${JSON.stringify(stock)}`}]}),});
    if(!upstream.ok){if(upstream.status===401)return json({error:"DeepSeek API Key 无效或已过期"},502);if(upstream.status===402)return json({error:"DeepSeek 账户余额不足"},502);if(upstream.status===429)return json({error:"DeepSeek 请求繁忙，请稍后重试"},503);return json({error:"DeepSeek 服务暂时不可用，请稍后重试"},502)}
    const result=await upstream.json() as {choices?:Array<{message?:{content?:string}}>};
    const content=result.choices?.[0]?.message?.content||"";
    let parsed:{logic?:unknown};try{parsed=JSON.parse(content) as {logic?:unknown}}catch{return json({error:"DeepSeek 返回内容异常，请重新生成"},502)}
    const logic=text(parsed.logic,60).replace(/[。；;，,]+$/g,"");
    if(logic.length<8)return json({error:"DeepSeek 未生成有效逻辑，请重新生成"},502);
    return json({logic,model:process.env.DEEPSEEK_MODEL||"deepseek-v4-flash"});
  }catch(error){return json({error:error instanceof Error&&error.name==="AbortError"?"DeepSeek 响应超时，请稍后重试":"DeepSeek 连接失败，请稍后重试"},502)}
  finally{clearTimeout(timeout)}
}
