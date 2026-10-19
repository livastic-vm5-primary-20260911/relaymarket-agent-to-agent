import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  BASE_USDC,ERC20_TRANSFER_TOPIC,planPayment
} from "../public/payment.mjs";
import {
  parsePending,createPending,pendingMatchesPlan,receiptEligible,
  readConfirmedBaseTx,buildReceiptPlan,verifiedOrderRecord
} from "../public/receipt-tools.mjs";

const buyer="0x1111111111111111111111111111111111111111";
const seller="0x2222222222222222222222222222222222222222";
const treasury="0x3333333333333333333333333333333333333333";
const tx="0x"+"a5".repeat(32);
const hex=n=>"0x"+BigInt(n).toString(16).padStart(64,"0");
const addr=a=>"0x"+a.slice(2).toLowerCase().padStart(64,"0");
const listing={
  id:"issue-13",owner:"seller-operator",issue_url:"https://github.com/livastic-vm5-primary-20260911/relaymarket-agent-to-agent/issues/13",
  name:"Research assistant",price_usdc:16.50,seller_wallet:seller,
  payoutVerified:true,deliveryTermsVerified:true,paymentEnabled:true
};
const config={chainId:8453,token:BASE_USDC,feeBps:1000,treasury,treasuryVerified:true,enabled:false};
const plan=planPayment({buyer,seller,treasury,price:"16.5",listingId:"issue-13"});
function receipt() {
  const transfer=(to,value)=>({address:BASE_USDC,topics:[ERC20_TRANSFER_TOPIC,addr(buyer),addr(to)],data:hex(value)});
  return {
    transactionHash:tx,blockHash:"0x"+"cd".repeat(32),
    status:"0x1",blockNumber:"0x100",
    logs:[transfer(seller,plan.sellerProceeds),transfer(treasury,plan.fee)]
  };
}
function rpcWith(data={}){
  return async(method,params=[])=>{
    if(method==="eth_chainId")return data.chainId??"0x2105";
    if(method==="eth_getTransactionReceipt")return data.receipt===undefined?receipt():data.receipt;
    if(method==="eth_blockNumber")return data.head??"0x105";
    throw new Error("Unrecognized read-only method");
  };
}
test("buyer can independently recover a valid payment with 6 confirmed Base blocks",async()=>{
  const p=await readConfirmedBaseTx({rpc:rpcWith(),txHash:tx,plan,minConfirmations:3});
  assert.equal(p.confirmations,6);
  assert.equal(p.gross,"16.5");
  assert.equal(p.seller,"14.85");
  assert.equal(p.fee,"1.65");
  const record=verifiedOrderRecord(listing,plan,p);
  assert.equal(record.commissionUSDC,"1.65");
  assert.equal(record.txHash,tx);
});
test("reader rejects wrong chain, missing tx, wrong hash, not enough blocks",async()=>{
  await assert.rejects(readConfirmedBaseTx({rpc:rpcWith({chainId:"0x1"}),txHash:tx,plan}),/not Base/);
  await assert.rejects(readConfirmedBaseTx({rpc:rpcWith({receipt:null}),txHash:tx,plan}),/not yet/);
  await assert.rejects(readConfirmedBaseTx({rpc:rpcWith({head:"0x100"}),txHash:tx,plan,minConfirmations:3}),/Waiting for 3/);
  await assert.rejects(readConfirmedBaseTx({rpc:rpcWith(),txHash:"0x123",plan}),/genuine/);
  const fake=receipt();fake.transactionHash="0x"+"de".repeat(32);
  await assert.rejects(readConfirmedBaseTx({rpc:rpcWith({receipt:fake}),txHash:tx,plan}),/wrong transaction/);
  const logless=receipt();logless.logs=[];
  await assert.rejects(readConfirmedBaseTx({rpc:rpcWith({receipt:logless}),txHash:tx,plan}),/Missing or ambiguous/);
});
test("historical receipt reader requires verified treasury + seller even if checkout has been paused",()=>{
  assert.equal(receiptEligible(config,listing),true);
  assert.equal(buildReceiptPlan(config,listing,buyer).fee,1650000n);
  assert.equal(receiptEligible({...config,treasuryVerified:false},listing),false);
  assert.equal(receiptEligible({...config,token:buyer},listing),false);
  assert.equal(receiptEligible(config,{...listing,payoutVerified:false}),false);
  assert.equal(receiptEligible(config,{...listing,paymentEnabled:false}),false);
});
test("durable wallet checkpoint refuses malformed user-controlled storage",()=>{
  const awaiting=createPending(plan,"awaiting");
  assert.equal(awaiting.phase,"awaiting");
  assert.equal(awaiting.batchId,null);
  assert.equal(awaiting.price,"16.5");
  assert.equal(pendingMatchesPlan(awaiting,plan),true);
  const submitted=createPending(plan,"submitted","0x"+"ab".repeat(48));
  assert.equal(submitted.phase,"submitted");
  assert.equal(pendingMatchesPlan(submitted,plan),true);
  assert.equal(parsePending({...submitted,buyer:"not-an-address"}),null);
  assert.equal(parsePending({...submitted,price:"0.000001"}),null);
  assert.equal(parsePending({...submitted,phase:"submitted",batchId:null}),null);
  assert.equal(parsePending({...submitted,listingId:"/api"}),null);
  assert.equal(parsePending({...submitted,createdAt:Date.now()+600000}),null);
  assert.equal(pendingMatchesPlan({...submitted,treasury:seller},plan),false);
});
test("buyer pay flow saves pending approval before initiating wallet_sendCalls; no sequential fallback",()=>{
  const source=readFileSync(new URL("../public/checkout-ui.mjs",import.meta.url),"utf8");
  const pendingIndex=source.indexOf('setPending(createPending(currentPlan,"awaiting"))');
  const walletIndex=source.indexOf('method:"wallet_sendCalls"');
  assert.ok(pendingIndex>0 && walletIndex>pendingIndex);
  assert.match(source,/if\(getPending\(\)\)throw new Error/);
  assert.match(source,/oldPending\.phase==="submitted"/);
  assert.match(source,/wallet_getCallsStatus/);
  assert.match(source,/readConfirmedBaseTx/);
  assert.doesNotMatch(source,/eth_sendTransaction/);
});
test("receipt recovery is independent of buyer's wallet extension",()=>{
  const recovery=readFileSync(new URL("../public/receipt-ui.mjs",import.meta.url),"utf8");
  const html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
  assert.match(recovery,/readConfirmedBaseTx/);
  assert.doesNotMatch(recovery,/window\.ethereum|eth_requestAccounts|personal_sign|wallet_sendCalls/);
  assert.match(html,/id="verify-transaction-form"/);
  assert.match(html,/id="verify-hash"/);
  assert.match(html,/id="verify-buyer"/);
});
