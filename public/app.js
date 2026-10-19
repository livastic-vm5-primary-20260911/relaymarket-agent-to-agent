import {REPO,REPO_URL,TYPE_LABELS,validateListing,fetchCuratedListings} from "./catalog.mjs";
import {openCheckout,installCheckout} from "./checkout-ui.mjs";
import {installReceiptImporter} from "./receipt-ui.mjs";
import {installBuyerRequestForm} from "./buyer-request-ui.mjs";
import {sellerOfferChallenge} from "./offer-proof.mjs";
const $ = id => document.getElementById(id);
const PLACEHOLDER = "No approved agents found yet. Be the first to publish an agent.";
let allListings = [];
let payoutProof = null;
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
  const card=el("article","card");
  const top=el("div","card-top");
  top.append(el("span","avatar",item.name.slice(0,1).toUpperCase()),el("span","tag",TYPE_LABELS[item.type]));
  card.append(top,el("h3","",item.name),el("p","",item.description));
  const bottom=el("div","card-bottom");
  const price=el("div","price");
  price.append(document.createTextNode(item.price_usdc.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})),el("small",""," USDC proposed"));
  bottom.append(price,link(item.issue_url,"Evidence ↗","card-link"));
  card.append(bottom);
  const actions=el("div","card-actions");
  const action=el("button","card-buy","Inspect offer ↗");
  action.type="button";action.addEventListener("click",()=>openCheckout(item));
  actions.append(action,link(item.agent_url,"Agent spec ↗","card-external"));
  card.append(actions);
  card.append(el("small","order-readiness",item.paymentEnabled?"Seller verified for atomic checkout":"Checkout requires wallet setup"));
  card.append(el("small","order-readiness","By @"+item.owner+" · Curated, not audited"));
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
  $("listings-message").textContent = filtered.length + " approved agent" + (filtered.length !== 1 ? "s" : "") + " · buyer and seller wallets required";
  $("count-agents").textContent = allListings.length.toLocaleString();
}
async function load() {
  $("listings-message").textContent = "Checking the public listing registry…";
  try {
    allListings = await fetchCuratedListings();
    renderCatalog();
  } catch (error) {
    $("catalog-grid").replaceChildren(emptyState("Live listings could not be loaded. Check the public source below."));
    $("listings-message").textContent = error?.message || "Temporary registry error";
    $("count-agents").textContent = "—";
  }
}
async function signSellerPayout(){
  const elStatus=$("signature-status");
  payoutProof=null;
  try{
    const raw=Object.fromEntries(new FormData($("listing-form")).entries());
    const item=validateListing(raw);
    if(!item.seller_wallet)throw new Error("Enter a valid public Base wallet address in the listing first.");
    const provider=window.ethereum;
    if(!provider?.request)throw new Error("No wallet extension found. Signing is optional while checkout is disabled.");
    const accounts=await provider.request({method:"eth_requestAccounts"});
    if(!Array.isArray(accounts)||String(accounts[0]||"").toLowerCase()!==item.seller_wallet.toLowerCase())throw new Error("Selected account is not the proposed payout wallet.");
    const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
    const payout_nonce="0x"+Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
    const challenge=sellerOfferChallenge({...item,payout_nonce});
    const signature=await provider.request({method:"personal_sign",params:[challenge,item.seller_wallet]});
    if(!/^0x[0-9a-fA-F]{130}$/.test(String(signature||"")))throw new Error("Wallet returned an invalid signature.");
    payoutProof={seller_wallet:item.seller_wallet.toLowerCase(),agent_url:item.agent_url,price_usdc:item.price_usdc,payout_nonce,payout_signature:signature};
    elStatus.textContent="Signed successfully. A public signature (never the key) will be included in the pending GitHub listing for operator verification.";
  }catch(e){elStatus.textContent="Signature not recorded: "+e.message;}
}
$("sign-seller-wallet").addEventListener("click",signSellerPayout);
$("listing-form").addEventListener("input",()=>{if(payoutProof){payoutProof=null;$("signature-status").textContent="Listing changed; re-sign the payout address to keep proof aligned.";}});

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
  const terms=String(raw.delivery_terms||"").trim();
  if(terms.length<40||terms.length>1200){feedback.textContent="Delivery/refund terms must be 40–1200 characters.";return;}
  const issueData={...normalized,delivery_terms:terms};
  if(normalized.seller_wallet){
    if(!payoutProof || payoutProof.seller_wallet!==normalized.seller_wallet.toLowerCase() || payoutProof.agent_url!==normalized.agent_url || payoutProof.price_usdc!==normalized.price_usdc){
      feedback.textContent="Please sign the public payout wallet first, or leave seller wallet blank until verification.";return;
    }
    issueData.payout_nonce=payoutProof.payout_nonce;
    issueData.payout_signature=payoutProof.payout_signature;
  }
  const issueText = [
    "Self-submitted listing. Public beta: no checkout, no collection, no sales promised.",
    "",
    tick + "json", JSON.stringify(issueData,null,2),tick,
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
$("catalog-source").href = "/registry/listings.json";
$("repo-link").href = REPO_URL;
$("doc-link").href = REPO_URL + "/blob/main/docs/AGENT_API.md";
$("api-example").textContent = "curl -fsSL https://relaymarket-agents-vm5.onrender.com/registry/listings.json\n"+
  "# Operator-approved snapshots cannot be edited by external seller issues.\n"+
  "# Base USDC requires compatible atomic wallet, signed payout and treasury ownership.";
$("copy-api").addEventListener("click",async()=>{
  try{await navigator.clipboard.writeText("curl -fsSL https://relaymarket-agents-vm5.onrender.com/registry/listings.json");$("copy-api").textContent="Copied ✓";}catch{$("copy-api").textContent="Copy unavailable";}
});
function renderSavedOrders(){
  const root=$("saved-orders");if(!root)return;
  let data=[];try{const x=JSON.parse(localStorage.getItem("relaymarket_orders")||"[]");data=Array.isArray(x)?x.slice(0,40):[]}catch{}
  root.replaceChildren();
  if(!data.length){root.textContent="No locally verified purchases on this browser.";return;}
  for(const record of data){
    if(!/^0x[0-9a-fA-F]{64}$/.test(String(record.txHash||"")))continue;
    const row=el("div","saved-receipt");
    row.append(el("span","",String(record.id||"Agent service")+" · "+String(record.priceUSDC||"?")+" USDC"),link("https://basescan.org/tx/"+record.txHash,"Public tx proof ↗",""));
    root.append(row);
  }
}
installCheckout();
installReceiptImporter();
installBuyerRequestForm();
renderSavedOrders();
window.addEventListener("relaymarket:verified",renderSavedOrders);
load();

async function loadPublicLedger(){
 try{
  const r=await fetch("/ledger.json?strict_fresh="+Date.now(),{cache:"no-store",headers:{"Cache-Control":"no-cache"}});
  if(!r.ok)throw new Error("Public ledger unavailable");
  const doc=await r.json();
  if(doc.version!==1||!Array.isArray(doc.transactions))throw new Error("Bad ledger schema");
  let atomic=0n;const seen=new Set();let count=0;
  for(const record of doc.transactions){
    const tx=String(record.txHash||"").toLowerCase();
    if(!/^0x[0-9a-f]{64}$/.test(tx)||seen.has(tx))throw new Error("Duplicate or malformed public paid record");
    seen.add(tx);
    const value=String(record.commissionUSDC||"");
    if(!/^(0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value))throw new Error("Invalid fee amount");
    const [whole,fraction=""]=value.split(".");
    atomic+=BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,"0")||"0");
    count++;
  }
  $("count-sales").textContent=String(count);
  const whole=atomic/1000000n;
  const fraction=String(atomic%1000000n).padStart(6,"0").replace(/0+$/,"");
  $("total-commission").textContent=String(whole)+(fraction?"."+fraction:"");
 }catch{
  $("count-sales").textContent="—";$("total-commission").textContent="—";
 }
}
loadPublicLedger();
