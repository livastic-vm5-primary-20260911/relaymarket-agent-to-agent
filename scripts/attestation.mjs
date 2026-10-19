// RelayMarket attestations: no private keys ever saved, only public wallet signatures.
// GitHub owner still decides whether seller is authorized to offer rights/capabilities.
import {verifyMessage} from "ethers";
import {normalizeAddress} from "../public/payment.mjs";
import {REPO} from "../public/catalog.mjs";
import {sellerOfferChallenge} from "../public/offer-proof.mjs";

export function sellerChallenge(issueNumber,wallet) {
  if(!Number.isSafeInteger(Number(issueNumber))||Number(issueNumber)<1)throw new Error("Invalid issue number.");
  const addr=normalizeAddress(wallet);
  return [
    "RelayMarket seller payout authorization (NO TRANSACTION)",
    "Repository: "+REPO,
    "GitHub issue: "+issueNumber,
    "Payee wallet: "+addr,
    "Chain: Base mainnet (8453)",
    "Purpose: Verify payout wallet ownership; this DOES NOT authorize a token transfer."
  ].join("\n");
}
export {treasuryChallenge} from "../public/treasury-proof.mjs";
export function verifySignedAttestation(message,signature,address) {
  if(typeof signature!=="string"||!/^0x[0-9a-fA-F]{130}$/.test(signature))return false;
  try{return normalizeAddress(verifyMessage(message,signature))===normalizeAddress(address)}catch{return false;}
}

export function verifySellerOfferSignature(input) {
  if(!input?.seller_wallet || !input?.payout_signature || !input?.payout_nonce)return false;
  try{return verifySignedAttestation(sellerOfferChallenge(input),input.payout_signature,input.seller_wallet)}catch{return false;}
}
