// Base receipt-only recovery and independent public sale proof.
// Read-only RPC: never connect, sign, send or approve any wallet transaction.
import {fetchCuratedListings} from "./catalog.mjs";
import {buildReceiptPlan,readConfirmedBaseTx,verifiedOrderRecord,parsePending} from "./receipt-tools.mjs";

export const PENDING_KEY="relaymarket_pending_v1";
const HISTORY_KEY="relaymarket_orders";
const RPC_URL="https://mainnet.base.org";
const $=id=>document.getElementById(id);

async function baseRpc(method,params=[]){
  const r=await fetch(RPC_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),cache:"no-store"});
  if(!r.ok)throw new Error("Base RPC responded with HTTP "+r.status);
  const payload=await r.json();
  if(payload.error)throw new Error("Base RPC: "+String(payload.error.message||payload.error.code));
  return payload.result;
}
export function getPending(){
  try{return parsePending(JSON.parse(localStorage.getItem(PENDING_KEY)||"null"))}catch{return null}
}
export function setPending(record){
  const clean=parsePending(record);
  if(!clean)throw new Error("Unsafe payment checkpoint; wallet request not allowed.");
  try{
    localStorage.setItem(PENDING_KEY,JSON.stringify(clean));
    const reread=getPending();
    if(!reread||reread.listingId!==clean.listingId||reread.phase!==clean.phase||reread.batchId!==clean.batchId)
      throw new Error("Unable to verify pending transaction checkpoint.");
  }catch {throw new Error("Browser storage is unavailable; payment cannot safely track pending wallet requests. No payment sent.")}
}
export function clearPendingIfMatches(listingId,buyer){
  const p=getPending();
  if(p && p.listingId===listingId && p.buyer===String(buyer).toLowerCase()){
    try{localStorage.removeItem(PENDING_KEY)}catch{}
  }
}
export function storeVerifiedOrder(record){
  let saved=false;
  try{
    const existing=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");
    const previous=Array.isArray(existing)?existing.filter(x=>String(x.txHash||"").toLowerCase()!==record.txHash.toLowerCase()):[];
    previous.unshift(record);
    localStorage.setItem(HISTORY_KEY,JSON.stringify(previous.slice(0,40)));
    saved=true;
  }catch{}
  window.dispatchEvent(new Event("relaymarket:verified"));
  return saved;
}
async function currentConfig(){
  const r=await fetch("/checkout-config.json?strict_fresh="+Date.now(),{cache:"no-store",headers:{"Cache-Control":"no-cache"}});
  if(!r.ok)throw new Error("Current marketplace treasury proof is unavailable.");
  const conf=await r.json();
  return conf;
}
export async function importExistingReceipt({listingId,buyer,txHash}){
  const [config,catalog]=await Promise.all([currentConfig(),fetchCuratedListings()]);
  const item=catalog.find(x=>x.id===listingId);
  if(!item)throw new Error("The listing is not in the current operator-approved catalog.");
  const plan=buildReceiptPlan(config,item,buyer);
  const proof=await readConfirmedBaseTx({rpc:baseRpc,txHash,plan,minConfirmations:config.minConfirmations??3});
  const record=verifiedOrderRecord(item,plan,proof);
  const saved=storeVerifiedOrder(record);
  clearPendingIfMatches(item.id,plan.from);
  return {record,confirmations:proof.confirmations,saved};
}
export async function populateImportListings() {
  const s=$("verify-listing");
  if(!s)return;
  s.replaceChildren();
  const initial=document.createElement("option");initial.value="";initial.textContent="Select a previously payable service";s.append(initial);
  const catalog=await fetchCuratedListings();
  const filtered=catalog.filter(x=>x.paymentEnabled&&x.payoutVerified&&x.deliveryTermsVerified);
  for(const item of filtered){
    const o=document.createElement("option");o.value=item.id;o.textContent=item.name+" ("+item.id+", "+item.price_usdc+" USDC)";
    s.append(o);
  }
  if(!filtered.length){
    initial.textContent="No payable sellers have been verified yet";
    $("verify-import-status").textContent="No eligible marketplace purchase exists yet. Seller wallet and operator treasury approval are required first.";
  }
}
export function installReceiptImporter(){
  const form=$("verify-transaction-form");
  if(!form)return;
  populateImportListings().catch(e=>{$("verify-import-status").textContent="Catalog unavailable: "+e.message});
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    if(!form.reportValidity())return;
    const out=$("verify-import-status"),submit=$("verify-existing-payment");
    submit.disabled=true;out.dataset.success="false";out.textContent="Checking Base mainnet receipts. This is read-only: no coins or wallet approvals will be sent.";
    try {
      const proof=await importExistingReceipt({
        listingId:$("verify-listing").value,buyer:$("verify-buyer").value.trim(),txHash:$("verify-hash").value.trim()
      });
      out.dataset.success="true";
      out.replaceChildren();
      out.append(document.createTextNode(
        "Verified both onchain transfers: seller "+proof.record.sellerUSDC+" USDC + platform "+proof.record.commissionUSDC+
        " USDC ("+proof.confirmations+" confirmations). "+(proof.saved?"Saved in this browser. ":"Browser storage blocked; record this public link. ")
      ));
      const link=document.createElement("a");link.target="_blank";link.rel="noopener noreferrer";
      link.href="https://basescan.org/tx/"+proof.record.txHash;link.textContent="Open Base receipt ↗";
      out.append(link);
    }catch(e){out.textContent="Not verified: "+e.message+" No paid marketplace order was recorded."}
    finally{submit.disabled=false;}
  });
}
