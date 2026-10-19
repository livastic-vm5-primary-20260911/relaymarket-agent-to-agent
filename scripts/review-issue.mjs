#!/usr/bin/env node
// Curate an immutable listing snapshot from a seller-owned public GitHub issue.
// All external seller issue edits remain unable to modify an already published price/wallet.
import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";
import {validateListing,REPO,REPO_URL} from "../public/catalog.mjs";
import {verifySellerOfferSignature} from "./attestation.mjs";
const args=process.argv.slice(2),id=Number(args.find(a=>/^[1-9]\d{0,7}$/.test(a)));
const checked=args.includes("--confirm-rights"),delivery=args.includes("--confirm-delivery");
const dryRun=!args.includes("--publish");
if(!id || args.includes("--help")) {
  console.log("Usage: node scripts/review-issue.mjs <issue-number> --confirm-rights [--confirm-delivery] [--publish]\nWithout --publish prints a SAFE read-only preview. Not an automated audit of seller rights.");
  process.exit(id?0:2);
}
if(!checked)throw new Error("Curator must affirm seller/operator rights using --confirm-rights.");
const raw=JSON.parse(execFileSync("gh",["api","repos/"+REPO+"/issues/"+id],{encoding:"utf8",maxBuffer:400000}));
if(!raw || raw.pull_request || raw.state!=="open" || !raw.user?.login || raw.number!==id)throw new Error("Expected one real open authored Issue.");
const match=String(raw.body||"").match(/\x60{3}json\s*([\s\S]*?)\x60{3}/i);
if(!match)throw new Error("Issue must contain explicit JSON fencing (not an arbitrary form).");
const input=JSON.parse(match[1]),listing=validateListing(input);
const sig=String(input.payout_signature||"");
const payoutVerified=!!listing.seller_wallet && verifySellerOfferSignature(input);
const approval={
  ...listing,id:"issue-"+id,number:id,owner:raw.user.login,issue_url:REPO_URL+"/issues/"+id,
  payoutVerified,deliveryTermsVerified:delivery&&typeof input.delivery_terms==="string"&&input.delivery_terms.trim().length>=40,
  delivery_terms:String(input.delivery_terms||"").slice(0,1200),
  paymentEnabled:false,review:"Curator manually confirmed public seller representation; payment enabled only after ownership and delivery checks.",
  reviewedAt:new Date().toISOString()
};
approval.paymentEnabled=approval.payoutVerified&&approval.deliveryTermsVerified;
const current=JSON.parse(readFileSync(new URL("../public/registry/listings.json",import.meta.url),"utf8"));
if(current.version!==2||!Array.isArray(current.listings))throw new Error("Invalid registry; refusing replacement.");
const existingIndex=current.listings.findIndex(x=>x.id===approval.id);
if(existingIndex>=0&&JSON.stringify(current.listings[existingIndex])!==JSON.stringify(approval)&&!args.includes("--replace-reviewed"))
  throw new Error("Existing reviewed snapshot must not be silently overwritten. Add --replace-reviewed after review.");
console.log(JSON.stringify({issue:approval.id,owner:approval.owner,payoutVerified,deliveryTermsVerified:approval.deliveryTermsVerified,paymentEnabled:approval.paymentEnabled,mode:dryRun?"PREVIEW_ONLY":"PUBLISH"},null,2));
if(dryRun)process.exit(0);
if(existingIndex>=0)current.listings.splice(existingIndex,1,approval);
else current.listings.push(approval);
current.updatedAt=new Date().toISOString();
writeFileSync(new URL("../public/registry/listings.json",import.meta.url),JSON.stringify(current,null,2)+"\n");
console.log("Local immutable listing snapshot saved; commit/push through the legitimate owner GitHub account. Never auto-approve buyer funds.");
