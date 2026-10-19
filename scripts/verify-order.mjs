#!/usr/bin/env node
// Independently verifies a real buyer-paid Base USDC two-transfer tx. Does not sign or spend.
import {readFileSync,writeFileSync} from "node:fs";
import {planPayment,verifyReceipt,isTxHash,normalizeAddress,fromUnits,BASE_USDC} from "../public/payment.mjs";
const args=process.argv.slice(2),[listingId,buyer,txHash]=args;
if(!/^issue-[1-9]\d{0,7}$/.test(String(listingId||""))||!isTxHash(txHash)||!buyer){
 console.error("Usage: node scripts/verify-order.mjs issue-N 0xBUYER 0xTXHASH [--record]");
 process.exit(2);
}
const read=url=>JSON.parse(readFileSync(new URL(url,import.meta.url),"utf8"));
const registry=read("../public/registry/listings.json"),config=read("../public/checkout-config.json");
const listing=registry.listings.find(x=>x.id===listingId);
if(!listing || !listing.paymentEnabled || !listing.payoutVerified || !listing.deliveryTermsVerified)throw new Error("Unknown or unsigned seller listing. Refuse payment recognition.");
if(!config.treasuryVerified || !config.treasury || !config.enabled)throw new Error("Operator treasury not live. Past receipts require historical approved config.");
if(config.chainId!==8453||config.token.toLowerCase()!==BASE_USDC.toLowerCase()||config.feeBps!==1000)throw new Error("Noncanonical chain/token/fee.");
const plan=planPayment({buyer,seller:listing.seller_wallet,treasury:config.treasury,price:String(listing.price_usdc),listingId});
async function rpc(method,params=[]){
 const response=await fetch("https://mainnet.base.org",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
 if(!response.ok)throw new Error("RPC HTTP"+response.status);
 const x=await response.json();if(x.error)throw new Error(String(x.error.message));return x.result;
}
const chain=await rpc("eth_chainId");
if(String(chain).toLowerCase()!=="0x2105")throw new Error("Wrong chain returned by RPC.");
const [receipt,head]=await Promise.all([rpc("eth_getTransactionReceipt",[txHash]),rpc("eth_blockNumber")]);
if(!receipt)throw new Error("Transaction not mined.");
if(receipt.transactionHash?.toLowerCase()!==txHash.toLowerCase())throw new Error("Receipt hash differs.");
const result=verifyReceipt(receipt,plan);
const confirmations=BigInt(head)-result.blockNumber+1n;
if(confirmations<BigInt(config.minConfirmations||3))throw new Error("Waiting for block confirmations.");
const ledger=read("../public/ledger.json");
if(ledger.version!==1 || !Array.isArray(ledger.transactions))throw new Error("Invalid ledger file.");
if(ledger.transactions.some(x=>String(x.txHash).toLowerCase()===txHash.toLowerCase()))throw new Error("Duplicate paid transaction is already recorded.");
const entry={
  listingId,
  buyer:normalizeAddress(buyer),
  seller:normalizeAddress(listing.seller_wallet),
  treasury:normalizeAddress(config.treasury),
  txHash:result.hash.toLowerCase(),
  blockNumber:Number(result.blockNumber),
  grossUSDC:result.gross,
  sellerUSDC:result.seller,
  commissionUSDC:result.fee,
  independentlyVerifiedAt:new Date().toISOString(),
  deliveryVerified:false
};
console.log(JSON.stringify({status:"ONCHAIN_VERIFIED_TWO_TRANSFERS",entry,confirmations:Number(confirmations),action:args.includes("--record")?"APPEND_TO_PUBLIC_LEDGER":"PREVIEW_ONLY"},null,2));
if(args.includes("--record")){
 ledger.transactions.push(entry);ledger.updatedAt=new Date().toISOString();
 writeFileSync(new URL("../public/ledger.json",import.meta.url),JSON.stringify(ledger,null,2)+"\n");
 console.log("Recorded. Commit/push the verified proof from the authorized VM5 repository; do not double-book another tx.");
}
