import {REPO} from "./catalog.mjs";
import {normalizeAddress} from "./payment.mjs";
export function treasuryChallenge(wallet) {
  const addr=normalizeAddress(wallet);
  return [
    "RelayMarket owner treasury authorization (NO TRANSACTION)",
    "Repository: "+REPO,
    "Payout wallet: "+addr,
    "Chain: Base mainnet (8453)",
    "Commission: 10% (1000/10000)",
    "Purpose: Public declaration of commission wallet control; this DOES NOT authorize a token transfer."
  ].join("\n");
}
