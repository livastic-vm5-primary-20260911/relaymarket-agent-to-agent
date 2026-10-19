import {REPO_URL,fetchCuratedListings} from "./catalog.mjs";
import {
 BASE_CHAIN_ID, BASE_USDC,checkoutPolicy,planPayment,walletRequest,
 verifyCallBatch,verifyReceipt,isTxHash,fromUnits
} from "./payment.mjs";
import {createPending,pendingMatchesPlan,readConfirmedBaseTx,verifiedOrderRecord} from "./receipt-tools.mjs";
import {getPending,setPending,clearPendingIfMatches,storeVerifiedOrder} from "./receipt-ui.mjs";
import {prepareBuyerRequest} from "./buyer-request-ui.mjs";

const RPC_URL="https://mainnet.base.org";
const $=id=>document.getElementById(id);
const fmt=(n)=>Number(n).toLocaleString("en-US",{maximumFractionDigits:6});
let settings=null;
let currentListing=null;
let currentPlan=null;
let paymentBatchId=null;
let pendingTxHash=null;
let pendingClient=null;
let allowPayment=false;

function htmlEsc(s){return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");}
function btn(id){return $(id);}
function status(message,success=false){
  const box=$("checkout-status");
  box.textContent=message;box.dataset.success=success?"true":"false";
}
function setLoading(loading){
  for(const id of ["wallet-connect","wallet-send","wallet-verify"])if(btn(id))btn(id).disabled=loading||btn(id).dataset.locked==="true";
}
async function freshConfig() {
  const r=await fetch("/checkout-config.json?strict_fresh="+Date.now(),{cache:"no-store",headers:{"Cache-Control":"no-cache"}});
  if(!r.ok)throw new Error("Unable to load public checkout configuration.");
  const data=await r.json();
  if(data.chainId!==8453 || data.token?.toLowerCase()!==BASE_USDC.toLowerCase()||data.feeBps!==1000)
    throw new Error("Payment config does not match pinned Base native USDC 10% split.");
  settings=data;
  return data;
}
function getEthereum(){
  if(typeof window.ethereum?.request!=="function")throw new Error("Compatible EIP-5792 smart wallet not found. Do not send a manual transfer.");
  return window.ethereum;
}
function makeRow(label,text){
  const row=document.createElement("div");row.className="checkout-row";
  const left=document.createElement("span");left.textContent=label;
  const right=document.createElement("b");right.textContent=text;
  row.append(left,right);return row;
}
function updateLinks(item){
  const seller=$("checkout-seller-link");
  seller.href=item.contact_url;seller.textContent="Contact seller ↗";
  const source=$("checkout-source-link");
  source.href=item.issue_url;source.textContent="Review listing source ↗";
}
export async function openCheckout(item){
  currentListing=item;currentPlan=null;paymentBatchId=null;pendingTxHash=null;pendingClient=null;allowPayment=false;
  prepareBuyerRequest(item);
  const dialog=$("checkout-dialog");
  const destination=$("checkout-operator-address");
  destination.textContent="Checking published owner-selected commission receiver…";
  const addressLink=$("checkout-operator-basescan");
  addressLink.hidden=true;
  $("checkout-name").textContent=item.name;
  $("checkout-description").textContent=item.description;
  $("checkout-review").textContent="Operator @"+item.owner+" · Reviewed snapshot "+item.id;
  $("checkout-delivery").textContent=item.delivery_terms||"Delivery terms have not yet been verified; contact the seller before placing any payment.";
  const box=$("checkout-breakdown");box.replaceChildren();
  const gross=Number(item.price_usdc);
  box.append(makeRow("Listed price",fmt(gross)+" USDC"),makeRow("Seller receives (90%)",fmt(gross*0.9)+" USDC"),makeRow("Marketplace fee (10%)",fmt(gross*0.1)+" USDC"));
  updateLinks(item);
  $("wallet-accept").checked=false;
  $("receipt-link").hidden=true;
  $("wallet-reset-pending").hidden=!getPending();
  btn("wallet-send").dataset.locked="true";btn("wallet-verify").dataset.locked="true";
  btn("wallet-connect").dataset.locked="true";
  status("Loading current payment policy…");
  dialog.showModal();
  try {
    const [config,inventory]=await Promise.all([freshConfig(),fetchCuratedListings()]);
    const live=inventory.find(x=>x.id===item.id);
    if(!live || JSON.stringify(live)!==JSON.stringify(item))throw new Error("Listing changed since initial view. Refresh before any payment.");
    const publicReceiver=String(config.treasury||"");
    destination.textContent=/^0x[0-9a-fA-F]{40}$/.test(publicReceiver)?publicReceiver:"NO CONFIGURED RECEIVER";
    addressLink.hidden=!/^0x[0-9a-fA-F]{40}$/.test(publicReceiver);
    if(!addressLink.hidden)addressLink.href="https://basescan.org/address/"+publicReceiver;
    const policy=checkoutPolicy(config,live);
    allowPayment=policy.enabled;
    if(allowPayment){
      btn("wallet-connect").dataset.locked="false";btn("wallet-connect").disabled=false;
      const prior=getPending();
      status(prior
        ? "An earlier wallet payment request remains unresolved ("+prior.listingId+"). Connect your wallet to verify it, or use the read-only receipt recovery below. Do not pay again."
        : "This reviewed listing supports wallet-based atomic USDC checkout. Read the no-escrow terms before paying.");
    } else {
      status("USDC checkout unavailable: "+policy.reason+" This is still a usable public listing; contact the seller for availability.");
    }
  }catch(e){status("Checkout disabled: "+e.message);}
}
async function getRpc(method,params){
  const response=await fetch(RPC_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),cache:"no-store"});
  if(!response.ok)throw new Error("Base mainnet RPC error HTTP "+response.status+".");
  const json=await response.json();
  if(json.error)throw new Error("Base RPC: "+String(json.error.message||json.error.code));
  return json.result;
}
async function connectWallet(){
  if(!allowPayment||!currentListing)throw new Error("Checkout disabled by marketplace policy.");
  const provider=getEthereum();
  const acc=await provider.request({method:"eth_requestAccounts"});
  if(!Array.isArray(acc)||!acc[0])throw new Error("No wallet account selected.");
  const chain=await provider.request({method:"eth_chainId"});
  if(String(chain).toLowerCase()!==BASE_CHAIN_ID)throw new Error("Switch your wallet to Base mainnet (8453) before proceeding; no payment was requested.");
  const capabilities=await provider.request({method:"wallet_getCapabilities",params:[acc[0],[BASE_CHAIN_ID]]});
  const atomic=capabilities?.[BASE_CHAIN_ID]?.atomic?.status;
  if(!["supported","ready"].includes(atomic))throw new Error("This wallet cannot guarantee atomic batches on Base. No sequential payment fallback is allowed.");
  const config=await freshConfig();
  const policy=checkoutPolicy(config,currentListing);
  if(!policy.enabled)throw new Error("Offer no longer available for commission checkout.");
  currentPlan=planPayment({buyer:acc[0],seller:currentListing.seller_wallet,treasury:config.treasury,price:String(currentListing.price_usdc),listingId:currentListing.id});
  pendingClient=provider;
  const oldPending=getPending();
  if(oldPending){
    btn("wallet-send").dataset.locked="true";
    if(!pendingMatchesPlan(oldPending,currentPlan)){
      status("An earlier wallet request for "+oldPending.listingId+" remains unresolved. No new payment can be sent; verify that transaction in your wallet or use read-only receipt recovery.");
      return;
    }
    if(oldPending.phase==="submitted" && oldPending.batchId) {
      paymentBatchId=oldPending.batchId;
      btn("wallet-verify").dataset.locked="false";btn("wallet-verify").disabled=false;
      status("Resumed your previously submitted wallet batch. Click Verify on Base; do NOT pay again.");
    }else{
      status("A previous wallet request has an unknown outcome. Find its Base tx hash in your wallet and use the read-only receipt importer. No duplicate payment is permitted.");
    }
    return;
  }
  btn("wallet-send").dataset.locked="false";btn("wallet-send").disabled=false;
  status("Wallet ready: "+acc[0].slice(0,8)+"…"+acc[0].slice(-5)+". An atomic batch will pay seller "+fromUnits(currentPlan.sellerProceeds)+" USDC and platform "+fromUnits(currentPlan.fee)+" USDC.");
}
async function sendPayment(){
  if(!currentPlan || !pendingClient || !allowPayment)throw new Error("Wallet was not independently checked for atomic batching.");
  const [liveConfig,liveListings]=await Promise.all([freshConfig(),fetchCuratedListings()]);
  const latest=liveListings.find(x=>x.id===currentListing.id);
  if(!latest || JSON.stringify(latest)!==JSON.stringify(currentListing))throw new Error("Approved listing changed. Close and reopen the offer; no payment sent.");
  const currentPolicy=checkoutPolicy(liveConfig,latest);
  if(!currentPolicy.enabled || String(liveConfig.treasury).toLowerCase()!==currentPlan.feeRecipient ||
     String(latest.seller_wallet).toLowerCase()!==currentPlan.payee)
    throw new Error("Buyer checkout recipient or policy changed; no payment sent.");
  const [accounts,chain]=await Promise.all([
    pendingClient.request({method:"eth_accounts"}),
    pendingClient.request({method:"eth_chainId"})
  ]);
  if(!Array.isArray(accounts)||String(accounts[0]||"").toLowerCase()!==currentPlan.from ||
     String(chain).toLowerCase()!==BASE_CHAIN_ID)
    throw new Error("Wallet account/network changed since the verified quote; no payment sent.");
  if(!$("wallet-accept").checked)throw new Error("Confirm you understand the no-escrow and irreversible payment terms first.");
  if(getPending())throw new Error("A previous wallet attempt is still unresolved. Refusing to send another payment.");
  // Durable checkpoint BEFORE showing the wallet send approval. If response is lost, the browser blocks duplicate sends.
  setPending(createPending(currentPlan,"awaiting"));
  $("wallet-reset-pending").hidden=false;
  btn("wallet-send").dataset.locked="true";
  status("Awaiting explicit wallet approval. Do not click Pay again while the transaction state is uncertain.");
  try{
    const res=await pendingClient.request({method:"wallet_sendCalls",params:[walletRequest(currentPlan)]});
    if(typeof res?.id!=="string"||!res.id.startsWith("0x"))throw new Error("Wallet accepted a request but did not return a valid batch identifier; check the wallet before retrying.");
    paymentBatchId=res.id;
    setPending(createPending(currentPlan,"submitted",paymentBatchId));
    $("wallet-reset-pending").hidden=false;
    btn("wallet-verify").dataset.locked="false";btn("wallet-verify").disabled=false;
    status("Batch submitted. Check its onchain status. Never assume a submitted order is paid until both transfers verify.");
  }catch(e){
    const explicitlyRejected=Number(e?.code)===4001 || String(e?.code||"")==="ACTION_REJECTED";
    if(explicitlyRejected){
      clearPendingIfMatches(currentPlan.listingId,currentPlan.from);
      $("wallet-reset-pending").hidden=true;
      btn("wallet-send").dataset.locked="false";
      btn("wallet-send").disabled=false;
    }
    status("Wallet request "+(explicitlyRejected?"rejected before approval":"outcome uncertain")+": "+e.message+
      (explicitlyRejected?". No funds were authorized.":". Do not retry or pay again until wallet history is checked. Use read-only receipt recovery."));
  }
}
async function verifyPayment(){
  if(!currentPlan||!paymentBatchId||!pendingClient)throw new Error("No previous wallet batch is available for verification.");
  const batch=await pendingClient.request({method:"wallet_getCallsStatus",params:[paymentBatchId]});
  if(String(batch?.id||"").toLowerCase()!==paymentBatchId.toLowerCase() ||
     String(batch?.chainId||"").toLowerCase()!==BASE_CHAIN_ID)
    throw new Error("The wallet returned a batch from a different ID or chain.");
  const tx=verifyCallBatch(batch);
  const proof=await readConfirmedBaseTx({
    rpc:getRpc,txHash:tx,plan:currentPlan,minConfirmations:settings?.minConfirmations??3
  });
  pendingTxHash=proof.hash;
  const record=verifiedOrderRecord(currentListing,currentPlan,proof);
  const saved=storeVerifiedOrder(record);
  clearPendingIfMatches(currentListing.id,currentPlan.from);
  $("wallet-reset-pending").hidden=true;
  const receiptLink=$("receipt-link");
  receiptLink.href="https://basescan.org/tx/"+proof.hash;
  receiptLink.hidden=false;
  btn("wallet-verify").dataset.locked="true";btn("wallet-send").dataset.locked="true";
  status("BASE ONCHAIN VERIFIED: seller "+proof.seller+" USDC + platform "+proof.fee+" USDC, "+proof.confirmations+
    " confirmations. "+(saved?"Receipt stored in this browser. ":"Local storage failed; save the public tx hash.")+
    " This confirms payment only, not agent delivery. Send receipt to the seller.",true);
}
export function installCheckout(){
  const close=()=>$("checkout-dialog").close();
  btn("checkout-close").addEventListener("click",close);
  $("checkout-dialog").addEventListener("click",event=>{if(event.target===$("checkout-dialog"))close()});
  btn("wallet-connect").addEventListener("click",async()=>{
    setLoading(true);try{await connectWallet()}catch(e){status(e.message)}finally{setLoading(false)}
  });
  btn("wallet-send").addEventListener("click",async()=>{
    setLoading(true);try{await sendPayment()}catch(e){status(e.message)}finally{setLoading(false)}
  });
  btn("wallet-verify").addEventListener("click",async()=>{
    setLoading(true);try{await verifyPayment()}catch(e){status(e.message)}finally{setLoading(false)}
  });
  btn("wallet-reset-pending").addEventListener("click",()=>{
    const prior=getPending();
    if(!prior) {btn("wallet-reset-pending").hidden=true;return;}
    const answer=window.prompt(
      "This wallet attempt could still settle onchain. First inspect wallet and Basescan history, and use receipt recovery above if it paid. ONLY after verifying there was no payment, type NO_PAYMENT_CONFIRMED exactly to clear your local pending guard."
    );
    if(answer!=="NO_PAYMENT_CONFIRMED"){
      status("Pending transaction kept. No new wallet payment permitted while its outcome is unresolved.");
      return;
    }
    try{localStorage.removeItem("relaymarket_pending_v1")}catch(e){status("Unable to clear local pending state: "+e.message);return}
    paymentBatchId=null;currentPlan=null;pendingClient=null;
    btn("wallet-reset-pending").hidden=true;
    btn("wallet-send").dataset.locked="true";
    btn("wallet-verify").dataset.locked="true";
    btn("wallet-send").disabled=true;btn("wallet-verify").disabled=true;
    status("Local pending guard cleared at your explicit request after wallet review. Connect your wallet again to start a new purchase, only after confirming the earlier request was not paid.");
  });
  btn("copy-checkout-proof").addEventListener("click",()=>{
    if(!pendingTxHash)return status("No independently verified transaction has been recorded.");
    navigator.clipboard.writeText("https://basescan.org/tx/"+pendingTxHash).then(()=>status("Public receipt URL copied. Share it privately with the seller.")).catch(()=>status("Copy unavailable; use the receipt link."));
  });
}
