import "dotenv/config";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const METRICS_FILE = path.resolve(__dirname, process.env.METRICS_FILE || "./data/metrics.json");
const LEADS_FILE = path.resolve(__dirname, process.env.LEADS_FILE || "./data/leads.json");
const KNOWLEDGE_FILE = path.resolve(__dirname, "./knowledge-base.md");
const MAX_BODY_BYTES = 120000;
const ACTIVE_WINDOW_MS = 90000;
const visitorHeartbeats = new Map();
const consultationHeartbeats = new Map();
const rateLimits = new Map();
let knowledgeCache = null;

const SYSTEM_PROMPT = `你是“菜谱专家”的餐饮视觉智能客服。你只能基于已知业务信息和联网检索结果回答，不要编造案例、价格、数据或承诺。

菜谱专家成立于2006年，位于江西南昌，是餐饮盈利全场景广告落地服务商，提供餐饮灯箱、软膜灯箱、灯片灯箱、明档整体视觉、明档灯箱、美食摄影、菜谱全案设计、iPad电子菜单、扫码点单视觉、菜品动态GIF、菜品短视频、门店全场景广告物料等服务。

品牌优势：20年餐饮垂直经验，服务10000+餐饮门店，自有设计团队、摄影团队、数码印刷工厂和百万张赣菜原创素材图库。重点服务江西菜、江西小炒、人文赣菜、宴席酒楼及全国连锁餐饮品牌。

办公地址：江西省南昌市解放东路88号10号楼301室。工厂地址：江西省南昌市青山湖区东泰大道888号A2栋2层。商务咨询：18879116195。人工咨询：18807917700。

回答规则：使用简洁中文；先直接回答，再给可执行建议；涉及最新行业信息、市场数据、竞品或区域门店时，优先使用联网搜索；如果无法确认，明确说“需要人工核实”；结尾可以提示用户联系商务顾问。`;

function headers(origin = "*") {
  const allowed = process.env.ALLOWED_ORIGIN || "*";
  const actualOrigin = allowed === "*" ? "*" : (origin === allowed ? origin : allowed);
  return {"access-control-allow-origin":actualOrigin,"access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type","content-type":"application/json;charset=UTF-8","vary":"Origin"};
}

function sendJson(response, status, data, request) {
  response.writeHead(status, headers(request.headers.origin || "*"));
  response.end(JSON.stringify(data));
}

function clientIp(request) {
  return String(request.headers["x-forwarded-for"] || request.socket.remoteAddress || "unknown").split(",")[0].trim();
}

function allowedRequest(request) {
  const key = clientIp(request);
  const now = Date.now();
  const window = rateLimits.get(key) || {start:now,count:0};
  if (now - window.start > 60000) { window.start = now; window.count = 0; }
  window.count += 1;
  rateLimits.set(key, window);
  return window.count <= 40;
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("请求内容过大。");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function cleanMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-12).map((message) => ({role:message?.role === "assistant" ? "assistant" : "user",content:[{type:"input_text",text:String(message?.content || "").slice(0,1500)}]})).filter((message) => message.content[0].text.trim());
}

function extractResponse(data) {
  const citations = [];
  const parts = [];
  for (const item of data.output || []) for (const content of item.content || []) {
    if (content.type !== "output_text" || !content.text) continue;
    parts.push(content.text);
    for (const annotation of content.annotations || []) if (annotation.type === "url_citation" && annotation.url) citations.push({url:annotation.url,title:annotation.title || annotation.url});
  }
  return {reply:data.output_text || parts.join("\n").trim(),citations:[...new Map(citations.map((item) => [item.url,item])).values()]};
}

function extractChatCompletion(data) {
  const message = data.choices?.[0]?.message || {};
  const content = Array.isArray(message.content) ? message.content.map((item) => item.text || "").join("") : String(message.content || "");
  const citations = (message.annotations || []).filter((item) => item.type === "url_citation" && item.url).map((item) => ({url:item.url,title:item.title || item.url}));
  return {reply:content.trim(),citations:[...new Map(citations.map((item) => [item.url,item])).values()]};
}

function wantsHumanFollowup(text) {
  return /(联系|电话|人工|客服|报价|预算|定制|制作|设计|拍摄|灯箱|明档|菜单|摄影|短视频|动图|合作|门店升级|想做|需要做|帮我做)/i.test(text);
}

async function loadKnowledge() {
  if (knowledgeCache !== null) return knowledgeCache;
  knowledgeCache = await fs.readFile(KNOWLEDGE_FILE,"utf8").catch(() => "");
  return knowledgeCache;
}

async function chat(request, response) {
  if (!process.env.OPENAI_API_KEY) return sendJson(response,503,{error:"服务器尚未配置 OPENAI_API_KEY。"},request);
  const body = await readBody(request);
  const messages = cleanMessages(body.messages);
  if (!messages.length) return sendJson(response,400,{error:"请输入咨询内容。"},request);
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content?.[0]?.text || "";
  const knowledge = await loadKnowledge();
  const prompt = `${SYSTEM_PROMPT}\n\n以下是菜谱专家提供的企业知识库。涉及公司、服务、地址、电话、品牌优势和业务范围时，优先依据此知识库；不要补写知识库没有的价格、案例或承诺。\n\n${knowledge.slice(0,60000)}`;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const isChatCompletion = (process.env.AI_API_FORMAT || (model.toLowerCase().includes("deepseek") ? "chat_completions" : "responses")) === "chat_completions";
  const baseUrl = (process.env.AI_BASE_URL || (model.toLowerCase().includes("deepseek") ? "https://dashscope.aliyuncs.com/compatible-mode/v1" : "https://api.openai.com/v1")).replace(/\/$/, "");
  const requestBody = isChatCompletion
    ? {model,stream:false,messages:[{role:"system",content:prompt},...messages.map((message) => ({role:message.role,content:message.content[0].text}))],...(process.env.AI_ENABLE_SEARCH === "true" ? {enable_search:true} : {})}
    : {model,store:false,tools:[{type:"web_search_preview"}],input:[{role:"system",content:[{type:"input_text",text:prompt}]} , ...messages]};
  let upstream;
  try {
    upstream = await fetch(`${baseUrl}/${isChatCompletion ? "chat/completions" : "responses"}`,{method:"POST",headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"content-type":"application/json"},body:JSON.stringify(requestBody)});
  } catch (error) {
    console.error("AI upstream fetch failed",error.message);
    return sendJson(response,502,{error:"AI 服务连接失败，请检查服务器网络、AI_BASE_URL 和 API Key 配置。"},request);
  }
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const upstreamError = String(data.error?.message || "");
    const errorMessage = /incorrect api key|apikey-error|invalid.*key/i.test(upstreamError)
      ? "AI 服务密钥无效，请在阿里云百炼控制台生成 DashScope API Key 后更新服务器配置。"
      : upstreamError || "AI 服务暂时不可用，请检查模型和 API 配置。";
    return sendJson(response,502,{error:errorMessage},request);
  }
  const result = isChatCompletion ? extractChatCompletion(data) : extractResponse(data);
  const leadForm = wantsHumanFollowup(`${lastUserMessage} ${JSON.stringify(body.messages || "")}`);
  return sendJson(response,200,{...result,leadForm},request);
}

function normalizeMetrics(metrics) {
  const totalVisits = Number(metrics?.totalVisits);
  return {
    ...(metrics && typeof metrics === "object" ? metrics : {}),
    totalVisits: Number.isFinite(totalVisits) && totalVisits >= 0 ? Math.floor(totalVisits) : 0
  };
}

async function readMetrics() {
  try { return normalizeMetrics(JSON.parse(await fs.readFile(METRICS_FILE,"utf8"))); } catch (_) { return {totalVisits:0}; }
}

async function writeMetrics(metrics) {
  await fs.mkdir(path.dirname(METRICS_FILE),{recursive:true});
  const temporaryFile = `${METRICS_FILE}.${process.pid}.tmp`;
  await fs.writeFile(temporaryFile,JSON.stringify(normalizeMetrics(metrics),null,2),"utf8");
  await fs.rename(temporaryFile,METRICS_FILE);
}

let metricsQueue = Promise.resolve();

function withMetricsLock(operation) {
  const result = metricsQueue.then(operation);
  metricsQueue = result.catch(() => {});
  return result;
}

async function updateMetrics(operation) {
  return withMetricsLock(async () => {
    const stored = await readMetrics();
    await operation(stored);
    await writeMetrics(stored);
    return stored;
  });
}

async function leads(request, response) {
  const body = await readBody(request);
  const name = String(body.name || "").trim().slice(0,50);
  const phone = String(body.phone || "").trim().slice(0,30);
  const city = String(body.city || "").trim().slice(0,80);
  const storeType = String(body.storeType || "").trim().slice(0,80);
  const requirement = String(body.requirement || "").trim().slice(0,2000);
  const services = Array.isArray(body.services) ? body.services.map((item) => String(item).slice(0,40)).slice(0,12) : [];
  if (!name || !/^[-+()\s\d]{7,30}$/.test(phone) || !requirement) return sendJson(response,400,{error:"请填写姓名、有效电话和项目需求。"},request);
  let data;
  try { data = JSON.parse(await fs.readFile(LEADS_FILE,"utf8")); } catch (_) { data = {leads:[]}; }
  if (!Array.isArray(data.leads)) data.leads = [];
  const lead = {id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,createdAt:new Date().toISOString(),name,phone,city,storeType,services,requirement,source:String(body.source || "智能客服").slice(0,50),status:"待联系"};
  data.leads.unshift(lead);
  data.leads = data.leads.slice(0,1000);
  await fs.mkdir(path.dirname(LEADS_FILE),{recursive:true});
  await fs.writeFile(LEADS_FILE,JSON.stringify(data,null,2),"utf8");
  if (process.env.LEAD_WEBHOOK_URL) fetch(process.env.LEAD_WEBHOOK_URL,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({msg_type:"text",content:{text:`菜谱专家新咨询：${name} ${phone} ${city} ${requirement}`}})}).catch(() => {});
  return sendJson(response,201,{ok:true,message:"需求已提交，稍后会有专人与您联系。"},request);
}

async function metrics(request, response) {
  const body = await readBody(request);
  const id = String(body.visitorId || "anonymous").slice(0,100);
  const now = Date.now();
  const cutoff = now - ACTIVE_WINDOW_MS;
  for (const [key, timestamp] of visitorHeartbeats) if (timestamp < cutoff) visitorHeartbeats.delete(key);
  for (const [key, timestamp] of consultationHeartbeats) if (timestamp < cutoff) consultationHeartbeats.delete(key);
  if (body.event === "leave") { visitorHeartbeats.delete(id); consultationHeartbeats.delete(id); }
  else { visitorHeartbeats.set(id,now); if (body.consulting) consultationHeartbeats.set(id,now); else consultationHeartbeats.delete(id); }
  const stored = await updateMetrics((metrics) => {
    // Only a new page visit increments the persistent counter. Heartbeats and
    // leave events only maintain the temporary online-user maps above.
    if (body.event === "visit") metrics.totalVisits += 1;
  });
  return sendJson(response,200,{activeVisitors:visitorHeartbeats.size,activeConsultations:consultationHeartbeats.size,totalVisits:stored.totalVisits},request);
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") { response.writeHead(204,headers(request.headers.origin || "*")); return response.end(); }
  if (!allowedRequest(request)) return sendJson(response,429,{error:"请求过于频繁，请稍后再试。"},request);
  const url = new URL(request.url || "/","http://localhost");
  try {
    if (url.pathname === "/health" && request.method === "GET") return sendJson(response,200,{ok:true,service:"caipu-zhuanjia-api"},request);
    if (url.pathname === "/api/chat" && request.method === "POST") return await chat(request,response);
    if (url.pathname === "/api/metrics" && request.method === "POST") return await metrics(request,response);
    if (url.pathname === "/api/leads" && request.method === "POST") return await leads(request,response);
    return sendJson(response,404,{error:"Not found"},request);
  } catch (error) { return sendJson(response,500,{error:error.message || "服务暂时不可用。"},request); }
});

server.on("error", (error) => { console.error("Caipu API server error", error); process.exit(1); });
server.listen(PORT,"127.0.0.1",() => console.log(`Caipu API listening on 127.0.0.1:${PORT}`));
