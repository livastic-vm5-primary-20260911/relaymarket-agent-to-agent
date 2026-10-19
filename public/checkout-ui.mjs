import {REPO_URL,fetchCuratedListings} from "./catalog.mjs";
import {
 BASE_CHAIN_ID, BASE_USDC,checkoutPolicy,planPayment,walletRequest,
 verifyCallBatch,verifyReceipt,isTxHash,fromUnits
} from "./payment.mjs";

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
  const r=await fetch("/checkout-config.json",{cache:"no-store"});
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
  const dialog=$("checkout-dialog");
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
  btn("wallet-send").dataset.locked="true";btn("wallet-verify").dataset.locked="true";
  btn("wallet-connect").dataset.locked="true";
  status("Loading current payment policy…");
  dialog.showModal();
  try {
    const [config,inventory]=await Promise.all([freshConfig(),fetchCuratedListings()]);
    const live=inventory.find(x=>x.id===item.id);
    if(!live || JSON.stringify(live)!==JSON.stringify(item))throw new Error("Listing changed since initial view. Refresh before any payment.");
    const policy=checkoutPolicy(config,live);
    allowPayment=policy.enabled;
    if(allowPayment){
      btn("wallet-connect").dataset.locked="false";btn("wallet-connect").disabled=false;
      status("This operator-reviewed listing supports wallet-based atomic USDC checkout. Read the no-escrow terms before paying.");
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
  btn("wallet-send").dataset.locked="false";btn("wallet-send").disabled=false;
  status("Wallet ready: "+acc[0].slice(0,8)+"…"+acc[0].slice(-5)+". A single atomic batch will pay the seller "+fromUnits(currentPlan.sellerProceeds)+" USDC and platform "+fromUnits(currentPlan.fee)+" USDC.");
  pendingClient=provider;
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
  btn("wallet-send").dataset.locked="true";
  status("Awaiting explicit wallet approval. Do not click Pay again while the transaction state is uncertain.");
  try{
    const res=await pendingClient.request({method:"wallet_sendCalls",params:[walletRequest(currentPlan)]});
    if(typeof res?.id!=="string"||!res.id.startsWith("0x"))throw new Error("Wallet accepted a request but did not return a valid batch identifier; check the wallet before retrying.");
    paymentBatchId=res.id;
    btn("wallet-verify").dataset.locked="false";btn("wallet-verify").disabled=false;
    status("Batch submitted. Check its onchain status. Never assume a submitted order is paid until both transfers verify.");
  }catch(e){
    status("Wallet request not confirmed: "+e.message+". Verify your wallet history before any manual retry.");
  }
}
async function verifyPayment(){
  if(!currentPlan||!paymentBatchId||!pendingClient)throw new Error("No in-progress wallet batch.");
  const batch=await pendingClient.request({method:"wallet_getCallsStatus",params:[paymentBatchId]});
  const tx=verifyCallBatch(batch);
  const [receipt,latest]=await Promise.all([getRpc("eth_getTransactionReceipt",[tx]),getRpc("eth_blockNumber",[])]);
  if(!receipt)throw new Error("Transaction not found yet on Base. Try verification later.");
  if(receipt.transactionHash.toLowerCase()!==tx.toLowerCase())throw new Error("Independent RPC transaction hash differs from wallet.");
  const proof=verifyReceipt(receipt,currentPlan);
  const confirms=BigInt(latest)-proof.blockNumber+1n;
  if(confirms<BigInt(settings?.minConfirmations||3))throw new Error("Found onchain transfer pair but waiting for "+(settings?.minConfirmations||3)+" confirmations.");
  pendingTxHash=proof.hash;
  const publicRecord={
    id:currentListing.id,
    buyer:currentPlan.from,
    seller:currentPlan.payee,
    treasury:currentPlan.feeRecipient,
    txHash:proof.hash,
    priceUSDC:proof.gross,
    sellerUSDC:proof.seller,
    commissionUSDC:proof.fee,
    verifiedAt:new Date().toISOString()
  };
  try{
    const old=JSON.parse(localStorage.getItem("relaymarket_orders")||"[]");
    const safe=Array.isArray(old)?old.filter(v=>v.txHash!==proof.hash):[];
    safe.unshift(publicRecord);localStorage.setItem("relaymarket_orders",JSON.stringify(safe.slice(0,40)));
  }catch{}
  window.dispatchEvent(new Event("relaymarket:verified"));
  const a=$("receipt-link");a.href="https://basescan.org/tx/"+proof.hash;a.hidden=false;
  btn("wallet-verify").dataset.locked="true";btn("wallet-send").dataset.locked="true";
  status("BASE ONCHAIN VERIFIED: seller "+proof.seller+" USDC and marketplace "+proof.fee+" USDC in one tx. This confirms payment, not service fulfillment. Send the public tx receipt to the seller.",true);
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
  btn("copy-checkout-proof").addEventListener("click",()=>{
    if(!pendingTxHash)return status("No independently verified transaction has been recorded.");
    navigator.clipboard.writeText("https://basescan.org/tx/"+pendingTxHash).then(()=>status("Public receipt URL copied. Share it privately with the seller.")).catch(()=>status("Copy unavailable; use the receipt link."));
  });
}
