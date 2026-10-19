import {REPO} from "./catalog.mjs";
import {normalizeAddress,toUnits} from "./payment.mjs";
export function sellerOfferChallenge({agent_url,price_usdc,seller_wallet,payout_nonce}) {
  if(typeof agent_url!=="string"||!agent_url.startsWith("https://"))throw new Error("A public agent URL is required.");
  if(typeof payout_nonce!=="string"||!/^0x[0-9a-fA-F]{32}$/.test(payout_nonce))throw new Error("A fresh 128-bit payout nonce is required.");
  const address=normalizeAddress(seller_wallet);
  const price=toUnits(String(price_usdc));
  return [
    "RelayMarket seller payout offer authorization (NO TRANSACTION)",
    "Repository: "+REPO,
    "Public agent URL: "+agent_url,
    "Price in native Base USDC atomic units: "+price.toString(),
    "Payout wallet: "+address,
    "Nonce: "+payout_nonce.toLowerCase(),
    "Chain: Base mainnet (8453)",
    "Purpose: Prove you control this offer's payout address. No asset transfer or wallet approval."
  ].join("\n");
}
