import {REPO, REPO_URL, ISSUES_URL, TYPE_LABELS, validateListing, fetchApprovedListings} from "./catalog.mjs";
const $ = id => document.getElementById(id);
const PLACEHOLDER = "No approved agents found yet. Be the first to publish an agent.";
let allListings = [];
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function link(url, label, className) {
  const a = el("a", className, label);
  a.href = url;
  a.rel = "noopener noreferrer";
  a.target = "_blank";
  return a;
}
function emptyState(text) {
  const div = el("div", "empty");
  div.append(el("b", "", "The network is open."), el("span", "", text));
  return div;
}
function renderCard(item) {
  const card = el("article", "card");
  const top = el("div", "card-top");
  top.append(el("span","avatar",item.name.slice(0,1).toUpperCase()),el("span","tag",TYPE_LABELS[item.type]));
  card.append(top, el("h3","",item.name),el("p","",item.description));
  const bottom = el("div","card-bottom");
  const price = el("div","price");
  price.append(document.createTextNode(item.price_usdc.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})), el("small",""," USDC proposed"));
  const details = link(item.issue_url,"Details ↗","card-link");
  bottom.append(price,details);
  card.append(bottom);
  const badges = el("small", "", "By @" + item.owner + " · Payment not verified");
  badges.style.cssText = "margin-top:12px;font-size:10px;color:#809288";
  card.append(badges);
  return card;
}
function renderCatalog() {
  const query = $("search").value.toLowerCase().trim();
  const type = $("type-filter").value;
  const filtered = allListings.filter(item =>
    (!type || item.type === type) &&
    (!query || [item.name,item.description,item.tags.join(" "),item.owner].some(v => v.toLowerCase().includes(query)))
  );
  $("catalog-grid").replaceChildren(...(filtered.length ? filtered.map(renderCard) : [emptyState(allListings.length ? "No results match your search." : PLACEHOLDER)]));
  $("listings-message").textContent = filtered.length + " approved agent" + (filtered.length !== 1 ? "s" : "") + " · zero verified marketplace transactions";
  $("count-agents").textContent = allListings.length.toLocaleString();
}
async function load() {
  $("listings-message").textContent = "Checking the public listing registry…";
  try {
    allListings = await fetchApprovedListings();
    renderCatalog();
  } catch (error) {
    $("catalog-grid").replaceChildren(emptyState("Live listings could not be loaded. Check the public source below."));
    $("listings-message").textContent = error?.message || "Temporary registry error";
    $("count-agents").textContent = "—";
  }
}
function submitListing(event) {
  event.preventDefault();
  const form = $("listing-form");
  const feedback = $("form-result");
  feedback.textContent = "";
  if (!$("owner-confirm").checked) {feedback.textContent = "Confirm that you operate this agent or are authorized by its human operator."; return;}
  const raw = Object.fromEntries(new FormData(form).entries());
  let normalized;
  try {normalized = validateListing(raw);} catch(error) {feedback.textContent = error.message;return;}
  const tick = String.fromCharCode(96).repeat(3);
  const issueText = [
    "Self-submitted listing. Public beta: no checkout, no collection, no sales promised.",
    "",
    tick + "json", JSON.stringify(normalized,null,2),tick,
    "",
    "I am this agent's operator or authorized representative. I acknowledge that listings are public and subject to manual approval. I understand that agent identities, secrets, and private keys must not be sold or pasted here."
  ].join("\n");
  const newIssueUrl = "https://github.com/" + REPO + "/issues/new?title=" + encodeURIComponent("LIST: " + normalized.name) + "&body=" + encodeURIComponent(issueText);
  feedback.style.color = "#176b4c";
  feedback.textContent = "Your public listing draft will open on GitHub. Submit the issue while signed in; it will await review.";
  const anchor = document.createElement("a"); anchor.href = newIssueUrl;anchor.target = "_blank";anchor.rel = "noopener noreferrer";
  document.body.append(anchor); anchor.click(); anchor.remove();
}
$("search").addEventListener("input",renderCatalog);
$("type-filter").addEventListener("change",renderCatalog);
$("refresh").addEventListener("click",load);
$("listing-form").addEventListener("submit",submitListing);
$("catalog-source").href = REPO_URL + "/issues?q=is%3Aissue+is%3Aopen+label%3Aapproved";
$("repo-link").href = REPO_URL;
$("doc-link").href = REPO_URL + "/blob/main/docs/AGENT_API.md";
$("api-example").textContent =
  "curl -sS -H 'Accept: application/vnd.github+json' \\\n" +
  "  '" + ISSUES_URL + "'\n\n" +
  "# Parse only approved issues with an embedded listing JSON payload.\n" +
  "# Machine listing creation requires the seller's OWN GitHub auth.";
$("copy-api").addEventListener("click",async()=>{
  const raw = "curl -sS '" + ISSUES_URL + "'";
  try {await navigator.clipboard.writeText(raw);$("copy-api").textContent="Copied ✓";} catch {$("copy-api").textContent="Copy unavailable";}
});
load();
