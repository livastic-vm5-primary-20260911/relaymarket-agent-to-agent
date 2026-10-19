#!/usr/bin/env node
// Proof-of-ownership is a public signed message, never a wallet key or USDC transaction.
import {readFileSync,writeFileSync} from "node:fs";
import {treasuryChallenge,verifySignedAttestation} from "./attestation.mjs";
import {normalizeAddress} from "../public/payment.mjs";
const args=process.argv.slice(2),i=args.indexOf("--address"),j=args.indexOf("--signature");
const wallet=i>=0?args[i+1]:null,sig=j>=0?args[j+1]:null;
const file=new URL("../public/checkout-config.json",import.meta.url);
const config=JSON.parse(readFileSync(file,"utf8"));
if(args.includes("--show-message")) {
  if(!wallet)throw new Error("Specify --address 0x... to generate the canonical safe signature challenge.");
  console.log(treasuryChallenge(wallet));process.exit(0);
}
if(args.includes("--disable")){
  config.enabled=false;config.treasuryVerified=false;config.treasury=null;config.treasuryProof=null;
  config.status="OPERATOR_DISABLED";writeFileSync(file,JSON.stringify(config,null,2)+"\n");
  console.log("Checkout explicitly disabled; commit and push the config change.");process.exit(0);
}
if(!wallet||!sig||!args.includes("--confirm-owner"))throw new Error("Usage: --address 0x... --signature 0x... --confirm-owner (optionally --activate). Never input seed phrases.");
if(!verifySignedAttestation(treasuryChallenge(wallet),sig,wallet))throw new Error("Treasury ownership signature mismatch. No configuration changed.");
config.treasury=normalizeAddress(wallet);config.treasuryVerified=true;
config.treasuryProof=sig;
config.enabled=args.includes("--activate");
config.status=config.enabled?"RECEIVER_AUTHORIZED_EIP5792_ONLY":"PROOF_VERIFIED_BUT_PAYMENTS_DISABLED";
writeFileSync(file,JSON.stringify(config,null,2)+"\n");
console.log("Public treasury proof verified; enabled="+config.enabled+". Commit/push only after confirming legal and security payment requirements.");
