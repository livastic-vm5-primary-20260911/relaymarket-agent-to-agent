import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("user-selected original VM1 MetaMask treasury is enforced by original-VM-only protected account metadata",()=>{
  const source=readFileSync(new URL("../scripts/configure-treasury.mjs",import.meta.url),"utf8");
  assert.match(source,/relaymarket_vm1_treasury_candidate\.json/);
  assert.match(source,/selectedAddress/);
  assert.match(source,/normalizeAddress\(wallet\)!==selectedAddress/);
  assert.match(source,/walletRecoveryBackupVerified/);
  assert.match(source,/confirm-regulatory-review/);
  assert.match(source,/confirm-real-seller/);
});
test("public operator UI only requests EIP-191 ownership proof, NEVER enables payments directly",()=>{
  const browser=readFileSync(new URL("../public/operator.js",import.meta.url),"utf8");
  assert.match(browser,/personal_sign/);
  assert.match(browser,/--confirm-owner/);
  assert.doesNotMatch(browser,/--activate/);
  assert.doesNotMatch(browser,/private_key|seed_phrase|eth_sendTransaction|wallet_sendCalls/);
});
test("owner-authorized VM1 payout can be configured but no unchecked seller collects funds",()=>{
  const config=JSON.parse(readFileSync(new URL("../public/checkout-config.json",import.meta.url),"utf8"));
  const registry=JSON.parse(readFileSync(new URL("../public/registry/listings.json",import.meta.url),"utf8"));
  const ledger=JSON.parse(readFileSync(new URL("../public/ledger.json",import.meta.url),"utf8"));
  assert.equal(config.enabled,true);
  assert.equal(config.treasuryVerified,false);
  assert.equal(config.treasury.toLowerCase(),"0x4e3106520e40af30870cafe78da1b1e7110ed98e");
  assert.equal(config.treasurySelectedByUser,true);
  assert.equal(registry.listings.filter(x=>x.paymentEnabled).length,0);
  assert.equal(ledger.transactions.length,0);
});
test("real local EVM trade script is clearly test-only and cannot access owner wallets",()=>{
  const source=readFileSync(new URL("./local-evm-actual-transaction.sim.mjs",import.meta.url),"utf8");
  assert.match(source,/LOCAL EVM REAL signed transaction/);
  assert.match(source,/ganache/);
  assert.match(source,/productionBaseUSDCNotUsed:true/);
  assert.match(source,/userWalletUsed:false/);
  assert.doesNotMatch(source,/MetaMask|0x4e3106520e40a/i);
});
