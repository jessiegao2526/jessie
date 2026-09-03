type ProfileItem={name?:unknown;revenueRatio?:unknown;grossMargin?:unknown};
type GenerateInput={name?:unknown;code?:unknown;price?:unknown;industry?:unknown;concepts?:unknown;segments?:unknown;products?:unknown};
type CachedLogic={logic:string;model:string;expiresAt:number};

const WINDOW_MS=60*60*1000;
const MAX_REQUESTS=30;
const DEFAULT_CACHE_TTL_MS=7*24*60*60*1000;
const MAX_CACHE_ITEMS=1000;
const PROMPT_VERSION="flash-v2";
const requests=new Map<string,{count:number;resetAt:number}>();
const logicCache=new Map<string,CachedLogic>();
const pending=new Map<string,Promise<CachedLogic>>();

function text(value:unknown,max=80){return typeof value==="string"?value.trim().slice(0,max):""}
function number(value:unknown){const n=Number(value);return Number.isFinite(n)?n:0}
function items(value:unknown){return Array.isArray(value)?value.slice(0,5).map((item:ProfileItem)=>({name:text(item?.name,40),revenueRatio:number(item?.revenueRatio),grossMargin:number(item?.grossMargin)})).filter(item=>item.name):[]}
function clientIp(request:Request){return request.headers.get("cf-connecting-ip")||request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown"}
function limited(ip:string){const now=Date.now();const entry=requests.get(ip);if(!entry||entry.resetAt<=now){requests.set(ip,{count:1,resetAt:now+WINDOW_MS});return false}entry.count+=1;return entry.count>MAX_REQUESTS}
function json(data:unknown,status=200,cache="no-store"){return Response.json(data,{status,headers:{"cache-control":cache}})}
function unique(values:string[]){return [...new Set(values.map(value=>value.trim()).filter(Boolean))]}
function cacheTtl(){const hours=Number(process.env.DEEPSEEK_CACHE_TTL_HOURS);return Number.isFinite(hours)&&hours>0?hours*60*60*1000:DEFAULT_CACHE_TTL_MS}
function cacheKey(stock:{code:string;industry:string;concepts:string[];segments:ProfileItem[];products:ProfileItem[]},model:string){
  return JSON.stringify({v:PROMPT_VERSION,model,code:stock.code,industry:stock.industry,concepts:[...stock.concepts].sort(),segments:stock.segments.map(x=>x.name),products:stock.products.map(x=>x.name)});
}
function cached(key:string){const value=logicCache.get(key);if(!value)return null;if(value.expiresAt<=Date.now()){logicCache.delete(key);return null}return value}
function remember(key:string,value:CachedLogic){
  if(logicCache.size>=MAX_CACHE_ITEMS){const oldest=logicCache.keys().next().value;if(oldest)logicCache.delete(oldest)}
  logicCache.set(key,value);
}
function compactFacts(stock:{name:string;code:string;industry:string;concepts:string[];segments:ProfileItem[];products:ProfileItem[]}){
  const business=unique([...stock.segments,...stock.products].map(item=>text(item.name,24))).slice(0,5);
  const concepts=unique(stock.concepts).slice(0,5);
  return [`股票：${stock.name}（${stock.code}）`,`行业：${stock.industry||"未知"}`,`主营：${business.join("、")||"未知"}`,`相关方向：${concepts.join("、")||"无可靠数据"}`].join("\n");
}
function normalizeLogic(value:unknown){
  let logic=text(value,80)
    .replace(/^[“"']|[”"']$/g,"")
    .replace(/[。；;]+$/g,"")
    .replace(/受益于于/g,"受益于")
    .replace(/概念概念/g,"概念")
    .replace(/行业景气(?:度)?(?:持续)?(?:提升|改善)/g,"产业需求增长")
    .replace(/双轮驱动|协同发展|盈利质量高/g,"")
    .replace(/，{2,}/g,"，")
    .replace(/^，|，$/g,"");
  if(Array.from(logic).length>20)logic=logic.replace(/持续|有望|明显|加速发展|产业发展|市场需求/g,"");
  if(Array.from(logic).length>20){
    const clauses=logic.split(/[，,]/).filter(Boolean);const first=clauses[0]||"";const second=clauses[1]||"";
    const available=Math.max(0,19-Array.from(first).length);
    logic=available>0?`${first}，${Array.from(second).slice(0,available).join("")}`:Array.from(first).slice(0,20).join("");
  }
  return logic.replace(/[，,。；;]+$/g,"");
}

const systemPrompt=`你是资深A股投研编辑。任务是仅根据资料写一句10至20个字符的具体荐股逻辑。
要求：
1. 必须点出一个具体主营业务、行业地位或产品，再点出一个与该业务直接相关的需求催化；
2. 资料可信度按“主营>行业>概念”排序，概念只能辅助判断，不能把概念误写成主营；
3. 可灵活使用“龙头/领先/深耕/聚焦/受益/乘势”等表达，只有资料能支持时才写龙头；每家公司措辞要自然、有辨识度；
4. 禁止虚构订单、政策、客户或业绩，禁止“行业景气提升、双轮驱动、协同发展、盈利质量高、概念概念、其他（补充）”等空话；
5. 不写股票名称、代码、建仓、止损、收益保证；不超过20个字符，不解释。
好例：光模块龙头，受益AI算力扩容 / 核电运营龙头，受益核准提速 / 深耕洁净室工程，受益晶圆厂扩产。
只输出JSON：{"logic":"..."}`;

async function requestLogic(apiKey:string,model:string,stock:{name:string;code:string;industry:string;concepts:string[];segments:ProfileItem[];products:ProfileItem[]}){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),25000);
  try{
    const upstream=await fetch("https://api.deepseek.com/chat/completions",{method:"POST",headers:{"content-type":"application/json","authorization":`Bearer ${apiKey}`},signal:controller.signal,body:JSON.stringify({model,thinking:{type:"disabled"},stream:false,temperature:.35,max_tokens:48,response_format:{type:"json_object"},messages:[{role:"system",content:systemPrompt},{role:"user",content:compactFacts(stock)}]})});
    if(!upstream.ok){if(upstream.status===401)throw new Error("DeepSeek API Key 无效或已过期");if(upstream.status===402)throw new Error("DeepSeek 账户余额不足");if(upstream.status===429)throw new Error("DeepSeek 请求繁忙，请稍后重试");throw new Error("DeepSeek 服务暂时不可用，请稍后重试")}
    const result=await upstream.json() as {choices?:Array<{message?:{content?:string}}>};
    const content=result.choices?.[0]?.message?.content||"";
    let parsed:{logic?:unknown};try{parsed=JSON.parse(content) as {logic?:unknown}}catch{throw new Error("DeepSeek 返回内容异常，请重新生成")}
    const logic=normalizeLogic(parsed.logic);
    if(Array.from(logic).length<8||/产业需求增长|行业景气|双轮驱动|协同发展/.test(logic))throw new Error("DeepSeek 未生成有效逻辑，请重新生成");
    return {logic,model,expiresAt:Date.now()+cacheTtl()};
  }catch(error){if(error instanceof Error&&error.name==="AbortError")throw new Error("DeepSeek 响应超时，请稍后重试");throw error}
  finally{clearTimeout(timeout)}
}

export async function POST(request:Request){
  if(request.headers.get("x-xinhuiying-ai-site")!=="1")return json({error:"not found"},404);
  let body:GenerateInput;
  try{body=await request.json() as GenerateInput}catch{return json({error:"请求格式不正确"},400)}
  const name=text(body.name,20);const code=text(body.code,6);const price=number(body.price);
  if(!name||!/^[0-9]{6}$/.test(code)||price<=0)return json({error:"股票资料不完整，请重新选择股票"},400);

  const stock={name,code,industry:text(body.industry,80),concepts:Array.isArray(body.concepts)?unique(body.concepts.slice(0,8).map(x=>text(x,30))).filter(x=>!/(其他|补充|概念概念)/.test(x)):[],segments:items(body.segments),products:items(body.products)};
  const model=process.env.DEEPSEEK_MODEL||"deepseek-v4-flash";
  const key=cacheKey(stock,model);
  const hit=cached(key);
  if(hit)return json({logic:hit.logic,model:hit.model,cached:true},200,"private, max-age=60");

  const existing=pending.get(key);
  if(existing){try{const value=await existing;return json({logic:value.logic,model:value.model,cached:true})}catch(error){return json({error:error instanceof Error?error.message:"DeepSeek 连接失败，请稍后重试"},502)}}
  if(limited(clientIp(request)))return json({error:"当前设备生成次数较多，请稍后再试"},429);
  const apiKey=process.env.DEEPSEEK_API_KEY;
  if(!apiKey)return json({error:"DeepSeek 智能版尚未配置 API Key"},503);

  const job=requestLogic(apiKey,model,stock);pending.set(key,job);
  try{const value=await job;remember(key,value);return json({logic:value.logic,model:value.model,cached:false})}
  catch(error){return json({error:error instanceof Error?error.message:"DeepSeek 连接失败，请稍后重试"},502)}
  finally{pending.delete(key)}
}
export const dynamic = "force-dynamic";
