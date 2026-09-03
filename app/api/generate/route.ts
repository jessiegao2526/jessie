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
  const model=process.env.DEEPSEEK_MODEL||"deepseek-v4-pro";
  const systemPrompt="你是资深A股投研编辑。根据股票名称、行业、主营产品、收入结构、毛利率和概念，提炼有辨识度的荐股逻辑。logic必须为12至20个字符，中文、字母、数字和标点都计入字符数；优先使用‘核心业务或行业地位，受益明确产业催化’的结构。不要写股票名称、代码、建仓、止损、收入占比、毛利率或收益保证；禁止‘行业景气提升’‘双轮驱动’‘盈利质量高’‘协同发展’等空泛表述。资料充分时可写龙头或领先，否则用深耕、聚焦等准确措辞；不得虚构订单、政策或公司业务。参考风格：‘光模块龙头，受益AI算力扩容’‘核电运营龙头，受益核准提速’‘半导体封测领先，受益国产替代’。只输出JSON，格式为{\"logic\":\"荐股逻辑\"}。";
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),25000);
  try{
    const upstream=await fetch("https://api.deepseek.com/chat/completions",{method:"POST",headers:{"content-type":"application/json","authorization":`Bearer ${apiKey}`},signal:controller.signal,body:JSON.stringify({model,thinking:{type:"disabled"},stream:false,max_tokens:80,response_format:{type:"json_object"},messages:[{role:"system",content:systemPrompt},{role:"user",content:`请根据以下JSON资料生成逻辑：${JSON.stringify(stock)}`}]}),});
    if(!upstream.ok){if(upstream.status===401)return json({error:"DeepSeek API Key 无效或已过期"},502);if(upstream.status===402)return json({error:"DeepSeek 账户余额不足"},502);if(upstream.status===429)return json({error:"DeepSeek 请求繁忙，请稍后重试"},503);return json({error:"DeepSeek 服务暂时不可用，请稍后重试"},502)}
    const result=await upstream.json() as {choices?:Array<{message?:{content?:string}}>};
    const content=result.choices?.[0]?.message?.content||"";
    let parsed:{logic?:unknown};try{parsed=JSON.parse(content) as {logic?:unknown}}catch{return json({error:"DeepSeek 返回内容异常，请重新生成"},502)}
    let logic=text(parsed.logic,60).replace(/[。；;，,]+$/g,"");
    if(Array.from(logic).length>20){
      const rewrite=await fetch("https://api.deepseek.com/chat/completions",{method:"POST",headers:{"content-type":"application/json","authorization":`Bearer ${apiKey}`},signal:controller.signal,body:JSON.stringify({model,thinking:{type:"disabled"},stream:false,max_tokens:60,response_format:{type:"json_object"},messages:[{role:"system",content:"你是A股文案精修编辑。把输入逻辑压缩到20个字符以内，保留核心业务和最明确催化，不添加新事实。只输出JSON，格式为{\"logic\":\"精简逻辑\"}。"},{role:"user",content:logic}]})});
      if(rewrite.ok){const rewritten=await rewrite.json() as {choices?:Array<{message?:{content?:string}}>};try{logic=text((JSON.parse(rewritten.choices?.[0]?.message?.content||"{}") as {logic?:unknown}).logic,40).replace(/[。；;，,]+$/g,"")}catch{return json({error:"DeepSeek 精简内容异常，请重新生成"},502)}}
    }
    if(Array.from(logic).length>20)logic=Array.from(logic).slice(0,20).join("").replace(/[。；;，,]+$/g,"");
    if(logic.length<8)return json({error:"DeepSeek 未生成有效逻辑，请重新生成"},502);
    return json({logic,model});
  }catch(error){return json({error:error instanceof Error&&error.name==="AbortError"?"DeepSeek 响应超时，请稍后重试":"DeepSeek 连接失败，请稍后重试"},502)}
  finally{clearTimeout(timeout)}
}
