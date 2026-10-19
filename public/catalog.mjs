// GitHub Issue-based public listing registry; no platform secret required.
export const REPO = "livastic-vm5-primary-20260911/relaymarket-agent-to-agent";
export const ISSUES_URL = "https://api.github.com/repos/" + REPO + "/issues?state=open&labels=approved&per_page=100";
export const REPO_URL = "https://github.com/" + REPO;
export const TYPE_LABELS = Object.freeze({ hire: "Hire agent", api: "Agent API", license: "Agent license" });
const PRIVATE_HOST = /^(localhost|.*\.localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|::1)$/i;
export function safeHttpsUrl(value) {
  if (typeof value !== "string" || value.length > 1500) return "";
  try {
    const result = new URL(value.trim());
    if (result.protocol !== "https:" || result.username || result.password || !result.hostname.includes(".") || PRIVATE_HOST.test(result.hostname)) return "";
    return result.toString();
  } catch { return ""; }
}
export function validateListing(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("Expected a JSON object.");
  const name = String(obj.name || "").trim();
  const description = String(obj.description || "").trim();
  const type = String(obj.type || "").trim().toLowerCase();
  const agent_url = safeHttpsUrl(obj.agent_url);
  const contact_url = safeHttpsUrl(obj.contact_url);
  const price_usdc = Number(obj.price_usdc);
  const seller_wallet = String(obj.seller_wallet || "").trim();
  const tags = (Array.isArray(obj.tags) ? obj.tags : String(obj.tags || "").split(","))
    .map(s => String(s).trim().toLowerCase()).filter(Boolean).slice(0, 5);
  if (name.length < 3 || name.length > 70) throw new Error("Agent name must be 3–70 characters.");
  if (description.length < 30 || description.length > 650) throw new Error("Description must be 30–650 characters.");
  if (!TYPE_LABELS[type]) throw new Error("Unsupported listing type.");
  if (!agent_url || !contact_url) throw new Error("Public service and contact URLs must use HTTPS.");
  if (!Number.isFinite(price_usdc) || price_usdc < 0.01 || price_usdc > 100000 || Math.abs(Math.round(price_usdc * 100) - price_usdc * 100) > 1e-8) throw new Error("Price must be 0.01–100,000 USDC with at most two decimals.");
  if (seller_wallet && !/^0x[0-9a-fA-F]{40}$/.test(seller_wallet)) throw new Error("Wallet must be 0x + 40 hexadecimal characters.");
  if (tags.some(tag => tag.length > 32)) throw new Error("Tags must be at most 32 characters.");
  return {name, description, type, agent_url, contact_url, price_usdc, seller_wallet, tags};
}
function fromIssueForm(body) {
  const chunks = {};
  for (const part of body.split(/^### /m).slice(1)) {
    const end = part.indexOf("\n");
    if (end < 0) continue;
    chunks[part.slice(0, end).trim().toLowerCase()] = part.slice(end + 1).trim();
  }
  if (!Object.keys(chunks).length) return null;
  const get = (...keys) => keys.map(k => chunks[k.toLowerCase()]).find(x => x && x !== "_No response_") || "";
  return {
    name:get("Agent / product name","Agent name"),
    type:get("Listing type","Type").toLowerCase(),
    description:get("What does your agent do?","Description"),
    agent_url:get("Public service / agent card URL","Agent URL"),
    contact_url:get("Public operator contact URL","Contact URL"),
    price_usdc:get("Base USDC proposed price","Price USDC"),
    seller_wallet:get("Public seller wallet (0x...)","Seller wallet"),
    tags:get("Tags")
  };
}
export function parseIssue(issue) {
  if (!issue || issue.pull_request || issue.state !== "open" || !issue.user?.login || !Number.isInteger(issue.number)) return null;
  if (!Array.isArray(issue.labels) || !issue.labels.some(v => (typeof v === "string" ? v : v.name) === "approved")) return null;
  const text = typeof issue.body === "string" ? issue.body : "";
  const fenced = text.match(/\x60{3}json\s*([\s\S]*?)\x60{3}/i);
  let raw;
  try { raw = fenced ? JSON.parse(fenced[1]) : fromIssueForm(text); } catch { return null; }
  if (!raw) return null;
  try {
    const listing = validateListing(raw);
    return {...listing,id:issue.number,owner:issue.user.login,issue_url:safeHttpsUrl(issue.html_url) || REPO_URL + "/issues/" + issue.number,created_at:issue.created_at || ""};
  } catch { return null; }
}
export async function fetchApprovedListings(fetcher = fetch) {
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(), 9000);
  try {
    const result = await fetcher(ISSUES_URL, {headers:{"Accept":"application/vnd.github+json"}, signal:controller.signal});
    if (!result.ok) throw new Error("Registry unavailable (HTTP " + result.status + ").");
    const items = await result.json();
    if (!Array.isArray(items)) throw new Error("Unexpected registry response.");
    const seen = new Set();
    return items.map(parseIssue).filter(item => {
      if (!item || seen.has(item.id)) return false;
      seen.add(item.id);return true;
    }).sort((a,b) => b.id-a.id);
  } finally {clearTimeout(handle);}
}
