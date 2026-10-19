#!/usr/bin/env node
// Fail-closed ORIGINAL VM5 treasury signer proof. Owner-selected VM1 MetaMask address is
// held in private VM5 account metadata and NEVER in public repo before signature.
// This CLI never reads a seed/private key and never signs or sends an onchain transaction.
import {readFileSync,writeFileSync} from "node:fs";
import {treasuryChallenge,verifySignedAttestation} from "./attestation.mjs";
import {normalizeAddress} from "../public/payment.mjs";

const args=process.argv.slice(2);
const i=args.indexOf("--address"),j=args.indexOf("--signature");
const wallet=i>=0?args[i+1]:null, signature=j>=0?args[j+1]:null;
const liveFile=new URL("../public/checkout-config.json",import.meta.url);
const selectedFile=new URL("../../../accounts/relaymarket_vm1_treasury_candidate.json",import.meta.url);
const config=JSON.parse(readFileSync(liveFile,"utf8"));
const write=()=>writeFileSync(liveFile,JSON.stringify(config,null,2)+"\n");

if(args.includes("--disable")){
  config.enabled=false;
  config.status="OWNER_EXPLICITLY_DISABLED_CHECKOUT";
  write();
  console.log("Checkout disabled. No assets moved. Push/deploy this change to apply public policy.");
  process.exit(0);
}
let selected;
try{
  selected=JSON.parse(readFileSync(selectedFile,"utf8"));
}catch{
  throw new Error("Original VM5 private owner-selected VM1 treasury metadata unavailable. Fail closed.");
}
const selectedAddress=normalizeAddress(selected.publicAddress);
if(selected.chainId!==8453 || selected.mainnetCheckoutEnabled!==false && !selected.walletRecoveryBackupVerified)
  throw new Error("Owner-selection metadata not eligible for new mainnet business.");
if(!wallet || normalizeAddress(wallet)!==selectedAddress){
  throw new Error("Treasury address must match the owner-selected original VM1 MetaMask public wallet. No change.");
}
if(args.includes("--show-message")){
  console.log(treasuryChallenge(wallet));process.exit(0);
}
if(!signature || !args.includes("--confirm-owner"))
  throw new Error("Usage: --address PUBLIC_VM1_WALLET --signature PUBLIC_EIP191_SIGNATURE --confirm-owner (without --activate for proof-only). Never paste a seed phrase.");
if(!verifySignedAttestation(treasuryChallenge(wallet),signature,wallet))
  throw new Error("EIP-191 signature does not prove control of the selected VM1 MetaMask address. No change.");

if(args.includes("--activate")){
  // A signature alone is NOT proof of backups, legal merchant readiness or a real buyer.
  if(!selected.walletRecoveryBackupVerified)
    throw new Error("ORIGINAL VM1 MetaMask recovery backup is unverified. Do not accept customer funds.");
  for(const name of ["--confirm-wallet-backup","--confirm-regulatory-review","--confirm-refunds-fulfillment","--confirm-real-seller"]) {
    if(!args.includes(name))throw new Error("Cannot activate: human operator has not approved "+name+".");
  }
  const catalog=JSON.parse(readFileSync(new URL("../public/registry/listings.json",import.meta.url),"utf8"));
  if(!Array.isArray(catalog.listings) || !catalog.listings.some(o=>o.paymentEnabled===true && o.payoutVerified===true && o.deliveryTermsVerified===true && normalizeAddress(o.seller_wallet)!==selectedAddress))
    throw new Error("Cannot activate: no independently verified merchant other than the owner treasury.");
}

config.treasury=selectedAddress;
config.treasuryVerified=true;
config.treasuryProof=signature;
// Proof-only MUST NOT accidentally disable owner-authorized merchant-ready status.
if(args.includes("--activate")) config.enabled=true;
config.status=config.enabled?"LIVE_OPERATOR_APPROVED_ATOMIC_USDC_ONLY":"SIGNED_OWNER_WALLET_PROOF_ACCEPTED_CHECKOUT_STILL_DISABLED";
write();
console.log("Genuine VM1 EIP-191 treasury proof verified. Checkout enabled="+config.enabled+". Wallet keys never accessed. Commit/push only after security+legal review.");
