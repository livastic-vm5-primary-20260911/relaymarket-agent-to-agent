import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  VM1_OWNER_TREASURY,BASE_USDC,operatorTreasuryAuthorized,
  checkoutPolicy,planPayment,toUnits
} from "../public/payment.mjs";
import {receiptEligible} from "../public/receipt-tools.mjs";
const config=JSON.parse(readFileSync(new URL("../public/checkout-config.json",import.meta.url)));
const catalog=JSON.parse(readFileSync(new URL("../public/registry/listings.json",import.meta.url)));
const ledger=JSON.parse(readFileSync(new URL("../public/ledger.json",import.meta.url)));

const merchant={
  id:"issue-22",name:"Independent specialist agent",
  type:"hire",owner:"separate-authorized-seller",
  issue_url:"https://github.com/livastic-vm5-primary-20260911/relaymarket-agent-to-agent/issues/22",
  seller_wallet:"0x2222222222222222222222222222222222222222",
  price_usdc:12.75,
  payoutVerified:true,deliveryTermsVerified:true,paymentEnabled:true
};
test("Original VM1 owner wallet is the ONLY accepted currently owner-selected 10% public recipient",()=>{
  assert.equal(config.enabled,true);
  assert.equal(config.treasurySelectedByUser,true);
  assert.equal(config.treasuryVerified,false); // no invented cryptographic signature
  assert.equal(config.treasury.toLowerCase(),VM1_OWNER_TREASURY.toLowerCase());
  assert.equal(operatorTreasuryAuthorized(config),true);
  assert.equal(operatorTreasuryAuthorized({...config,treasury:"0x4444444444444444444444444444444444444444"}),false);
  assert.equal(operatorTreasuryAuthorized({...config,treasurySelectedByUser:false}),false);
});
test("Owner-selected wallet can pass commerce policy ONLY for genuine individually approved seller",()=>{
  assert.equal(checkoutPolicy(config,merchant).enabled,true);
  assert.equal(checkoutPolicy(config,{...merchant,paymentEnabled:false}).enabled,false);
  assert.equal(checkoutPolicy(config,{...merchant,payoutVerified:false}).enabled,false);
  assert.equal(checkoutPolicy(config,{...merchant,deliveryTermsVerified:false}).enabled,false);
  assert.equal(checkoutPolicy(config,{...merchant,seller_wallet:config.treasury}).enabled,false);
  assert.equal(checkoutPolicy({...config,enabled:false},merchant).enabled,false);
  assert.equal(receiptEligible(config,merchant),true);
});
test("Precise operator 10% transfer always targets original VM1 public address",()=>{
  const plan=planPayment({buyer:"0x1111111111111111111111111111111111111111",seller:merchant.seller_wallet,treasury:config.treasury,price:String(merchant.price_usdc),listingId:merchant.id});
  assert.equal(plan.token,BASE_USDC.toLowerCase());
  assert.equal(plan.gross,toUnits("12.75"));
  assert.equal(plan.sellerProceeds,toUnits("11.475"));
  assert.equal(plan.fee,toUnits("1.275"));
  assert.equal(plan.feeRecipient,VM1_OWNER_TREASURY.toLowerCase());
  assert.equal(plan.calls[1].data,"0xa9059cbb"+VM1_OWNER_TREASURY.slice(2).toLowerCase().padStart(64,"0")+plan.fee.toString(16).padStart(64,"0"));
});
test("PUBLIC checkout still has no real buyer, no signed seller payout, no earned commission",()=>{
  assert.equal(catalog.listings.filter(x=>x.paymentEnabled&&x.payoutVerified&&x.deliveryTermsVerified).length,0);
  assert.equal(ledger.transactions.length,0);
  const market=JSON.parse(readFileSync(new URL("../public/market.json",import.meta.url)));
  assert.equal(market.live.checkoutInfrastructureEnabled,true);
  assert.equal(market.live.checkout,false);
  assert.equal(market.actualCommissionReceivedUSDC,0);
});
