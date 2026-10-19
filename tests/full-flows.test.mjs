import test from "node:test";
import assert from "node:assert/strict";
import {Wallet} from "ethers";
import {readFileSync} from "node:fs";
import {sellerOfferChallenge} from "../public/offer-proof.mjs";
import {treasuryChallenge} from "../public/treasury-proof.mjs";
import {verifySellerOfferSignature} from "../scripts/attestation.mjs";
import {validateCuratedListing} from "../public/catalog.mjs";

test("seller wallet signature binds exact original URL, offer amount and independent nonce",async()=>{
  const wallet=Wallet.createRandom();
  const candidate={
    seller_wallet:wallet.address, agent_url:"https://owned-agent.example.com/spec",
    price_usdc:15.75,payout_nonce:"0x"+"12".repeat(16)
  };
  const payload=sellerOfferChallenge(candidate);
  const sig=await wallet.signMessage(payload);
  assert.equal(verifySellerOfferSignature({...candidate,payout_signature:sig}),true);
  assert.equal(verifySellerOfferSignature({...candidate,price_usdc:16.75,payout_signature:sig}),false);
  assert.equal(verifySellerOfferSignature({...candidate,agent_url:"https://impostor.example.com",payout_signature:sig}),false);
  assert.equal(verifySellerOfferSignature({...candidate,payout_nonce:"0x"+"34".repeat(16),payout_signature:sig}),false);
  assert.equal(verifySellerOfferSignature({...candidate,seller_wallet:"0x"+"f".repeat(40),payout_signature:sig}),false);
});
test("operator treasury public signature is consent-only, not a wallet spend permit",()=>{
  const challenge=treasuryChallenge("0x"+"1".repeat(40));
  assert.match(challenge,/NO TRANSACTION/);
  assert.match(challenge,/Commission: 10%/);
  assert.match(challenge,/DOES NOT authorize a token transfer/);
});
test("catalog cannot enable wallet payment by merely changing an Issue or adding blank terms",()=>{
  const registered={
   id:"issue-53",number:53,owner:"agent-operator",issue_url:"https://github.com/livastic-vm5-primary-20260911/relaymarket-agent-to-agent/issues/53",
   name:"Fake agent for QA",type:"api",
   description:"A sample AI agent for tests that would otherwise request payments incorrectly from visitors.",
   agent_url:"https://example.net/agent.json",contact_url:"https://github.com/acme/agent/issues",
   price_usdc:2,tags:["api"],seller_wallet:"",paymentEnabled:true,payoutVerified:false,deliveryTermsVerified:false
  };
  assert.throws(()=>validateCuratedListing(registered),/Unverified paid/);
});
test("real UI has complete and unambiguous local source and buyer protection controls",()=>{
  const html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../public/checkout-ui.mjs",import.meta.url),"utf8");
  for(const id of ["checkout-dialog","wallet-connect","wallet-send","wallet-verify","wallet-accept","checkout-status","listing-form","sign-seller-wallet","count-sales","total-commission"])
    assert.ok(html.includes('id="'+id+'"'),"missing "+id);
  assert.match(ui,/wallet_getCapabilities/);
  assert.match(ui,/wallet_sendCalls/);
  assert.match(ui,/wallet_getCallsStatus/);
  assert.match(ui,/eth_getTransactionReceipt/);
  assert.match(ui,/checkoutPolicy/);
  assert.match(ui,/fetchCuratedListings/);
  assert.match(html,/Non-custodial and non-escrow/);
});
