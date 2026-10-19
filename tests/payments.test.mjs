import test from "node:test";
import assert from "node:assert/strict";
import {Wallet} from "ethers";
import {readFileSync} from "node:fs";
import {
 BASE_CHAIN_ID,BASE_USDC,ERC20_TRANSFER_TOPIC,toUnits,fromUnits,normalizeAddress,
 planPayment,walletRequest,encodeTransfer,verifyCallBatch,verifyReceipt,checkoutPolicy
} from "../public/payment.mjs";
import {sellerChallenge,treasuryChallenge,verifySignedAttestation} from "../scripts/attestation.mjs";
import {validateCuratedListing,fetchCuratedListings} from "../public/catalog.mjs";
const seller="0x1111111111111111111111111111111111111111";
const buyer="0x2222222222222222222222222222222222222222";
const treasury="0x3333333333333333333333333333333333333333";
const tx="0x"+"ab".repeat(32);
const blockhash="0x"+"cd".repeat(32);
const pad=a=>"0x"+a.slice(2).toLowerCase().padStart(64,"0");
const wd=n=>"0x"+BigInt(n).toString(16).padStart(64,"0");
const listing={
  id:"issue-123",owner:"real-seller",issue_url:"https://github.com/livastic-vm5-primary-20260911/relaymarket-agent-to-agent/issues/123",
  name:"Agent API test",type:"api",price_usdc:8.25,seller_wallet:seller,
  description:"A paid test agent that returns a bounded dataset to a real client with source references.",
  agent_url:"https://api.example.org/v1/spec",contact_url:"https://github.com/example/agent/issues",
  tags:["api"],payoutVerified:true,deliveryTermsVerified:true,paymentEnabled:true,
  delivery_terms:"Deliver a source-cited JSON report within 48h. Refunds negotiated by contract in writing."
};
const validConfig={enabled:true,treasuryVerified:true,treasury,chainId:8453,token:BASE_USDC,feeBps:1000};
const purchase=planPayment({buyer,seller,treasury,price:"8.25",listingId:"issue-123"});
const receipt=()=>{
  const log=(recipient,atomic)=>({address:BASE_USDC,topics:[ERC20_TRANSFER_TOPIC,pad(buyer),pad(recipient)],data:wd(atomic)});
  return {transactionHash:tx,status:"0x1",blockHash:blockhash,blockNumber:"0x200",logs:[
    log(seller,purchase.sellerProceeds),log(treasury,purchase.fee)
  ]};
};
test("USDC decimal conversion precise at boundaries",()=>{
  assert.equal(toUnits("0.01"),10000n);
  assert.equal(toUnits("8.25"),8250000n);
  assert.equal(fromUnits(8250000n),"8.25");
  assert.equal(fromUnits(1n),"0.000001");
  for(const x of ["0.0000001","0","-5","1e10","100000.01","0.001"])assert.throws(()=>toUnits(x));
});
test("fee exact 10% and only TWO canon USDC transfer calls",()=>{
  assert.equal(purchase.gross,8250000n);
  assert.equal(purchase.fee,825000n);
  assert.equal(purchase.sellerProceeds,7425000n);
  assert.equal(purchase.calls.length,2);
  for(const call of purchase.calls){assert.equal(normalizeAddress(call.to),normalizeAddress(BASE_USDC));assert.equal(call.value,"0x0");assert.equal(call.data.slice(0,10),"0xa9059cbb");}
  assert.equal(encodeTransfer(seller,7425000n),purchase.calls[0].data);
});
test("never silently fall back to non-atomic sequential payments",()=>{
  const request=walletRequest(purchase);
  assert.equal(request.atomicRequired,true);
  assert.equal(request.chainId,BASE_CHAIN_ID);
  assert.equal(request.calls.length,2);
  assert.equal(Object.prototype.hasOwnProperty.call(request,"experimental_fallback"),false);
});
test("payment requires distinct buyer, seller, treasury and immutable listing id",()=>{
  for(const v of [
    {buyer:seller,seller,treasury,price:"8",listingId:"issue-123"},
    {buyer,seller:treasury,treasury,price:"8",listingId:"issue-123"},
    {buyer,seller,treasury,price:"8",listingId:"issue-0"},
  ])assert.throws(()=>planPayment(v));
});
test("wallet result only accepted with atomic true, status 200 and one mined tx",()=>{
  const batch={status:200,atomic:true,receipts:[{transactionHash:tx,status:"0x1"}]};
  assert.equal(verifyCallBatch(batch),tx);
  assert.throws(()=>verifyCallBatch({...batch,atomic:false}));
  assert.throws(()=>verifyCallBatch({...batch,status:100}));
  assert.throws(()=>verifyCallBatch({...batch,receipts:[]}));
  assert.throws(()=>verifyCallBatch({...batch,receipts:[batch.receipts[0],batch.receipts[0]]}));
});
test("real receipt validation requires BOTH exact USDC transfer events, same buyer",()=>{
  const proof=verifyReceipt(receipt(),purchase);
  assert.deepEqual({gross:proof.gross,seller:proof.seller,fee:proof.fee},{gross:"8.25",seller:"7.425",fee:"0.825"});
  assert.throws(()=>verifyReceipt({...receipt(),logs:receipt().logs.slice(0,1)},purchase),/Missing/);
  assert.throws(()=>verifyReceipt({...receipt(),logs:[receipt().logs[0],receipt().logs[0],receipt().logs[1]]},purchase),/ambiguous/);
  assert.throws(()=>verifyReceipt({...receipt(),status:"0x0"},purchase),/did not succeed/);
  const forged=receipt();forged.logs[1].topics[2]=pad("0x4444444444444444444444444444444444444444");
  assert.throws(()=>verifyReceipt(forged,purchase),/Missing/);
  const wrong=receipt();wrong.logs[0].address="0x5555555555555555555555555555555555555555";
  assert.throws(()=>verifyReceipt(wrong,purchase),/Missing/);
});
test("payment policy fails closed until independent operator/seller evidence",()=>{
  assert.equal(checkoutPolicy(validConfig,listing).enabled,true);
  assert.equal(checkoutPolicy({...validConfig,enabled:false},listing).enabled,false);
  assert.equal(checkoutPolicy({...validConfig,treasuryVerified:false},listing).enabled,false);
  assert.equal(checkoutPolicy({...validConfig,token:treasury},listing).enabled,false);
  assert.equal(checkoutPolicy(validConfig,{...listing,payoutVerified:false}).enabled,false);
  assert.equal(checkoutPolicy(validConfig,{...listing,deliveryTermsVerified:false}).enabled,false);
  assert.equal(checkoutPolicy(validConfig,{...listing,paymentEnabled:false}).enabled,false);
});
test("curated registry is immutable even if self-submitted issue body changes",async()=>{
  const base=JSON.parse(readFileSync(new URL("../public/registry/listings.json",import.meta.url)));
  const received=await fetchCuratedListings(async(url)=>({ok:true,json:async()=>base}));
  assert.equal(received.length,1);
  assert.equal(received[0].paymentEnabled,false);
  assert.equal(received[0].seller_wallet,"");
  assert.throws(()=>validateCuratedListing({...listing,paymentEnabled:true,payoutVerified:false}));
  await assert.rejects(fetchCuratedListings(async()=>({ok:true,json:async()=>({version:2,listings:[listing,listing]})})),/duplicate/);
});
test("signed seller and operator wallet proofs without reading private keys",async()=>{
  const signer=Wallet.createRandom();
  const message=sellerChallenge(15,signer.address);
  const sig=await signer.signMessage(message);
  assert.equal(verifySignedAttestation(message,sig,signer.address),true);
  assert.equal(verifySignedAttestation(message,sig,treasury),false);
  assert.equal(verifySignedAttestation(sellerChallenge(16,signer.address),sig,signer.address),false);
  const tc=treasuryChallenge(signer.address);
  assert.equal(verifySignedAttestation(tc,await signer.signMessage(tc),signer.address),true);
  assert.equal(verifySignedAttestation(tc,sig,signer.address),false);
});
test("operator receiving rail enabled but no unverified seller can collect marketplace commissions",()=>{
  const config=JSON.parse(readFileSync(new URL("../public/checkout-config.json",import.meta.url)));
  assert.equal(config.enabled,true);
  assert.equal(config.treasuryVerified,false);
  assert.equal(config.treasury.toLowerCase(),"0x4e3106520e40af30870cafe78da1b1e7110ed98e");
  assert.equal(config.treasurySelectedByUser,true);
  const market=JSON.parse(readFileSync(new URL("../public/market.json",import.meta.url)));
  assert.equal(market.actualCommissionReceivedUSDC,0);
});
