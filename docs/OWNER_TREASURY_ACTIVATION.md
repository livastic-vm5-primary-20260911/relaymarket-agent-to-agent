# RelayMarket owner treasury setup — ORIGINAL VM1 MetaMask only

2026-10-19: user selected original VM1 MetaMask as 10% commission wallet. The public receive address is held in VM1 original make_money/accounts/accounts.json and in protected VM5 make_money/accounts/relaymarket_vm1_treasury_candidate.json with permissions 0600. This selection is not private-key custody or proof of control. Existing original VM1 Base wallet had 1 real USDC / 0 ETH; MetaMask recovery backup status is NOT VERIFIED.

## Actual owner actions (do not send any private information)
1. In the ORIGINAL VM1 MetaMask browser extension personally ensure the wallet Secret Recovery Phrase is safely backed up and recoverable OFFLINE. Never paste seed/private keys into a chat, email, VM note, GitHub or third party.
2. Open https://relaymarket-agents-vm5.onrender.com/operator.html in the ORIGINAL VM1 browser. The public address has been prefilled in the original browser tab for convenience; visually verify it matches your MetaMask selected Account. Unlock and connect yourself, then approve ONLY the public EIP-191 message-only owner authorization (no token transfer or gas).
3. The page produces a CLI command with PUBLIC wallet address and PUBLIC signature. In original VM5 repo execute the proof-only version:
   node scripts/configure-treasury.mjs --address PUBLIC_VM1_WALLET --signature PUBLIC_EIP191_SIGNATURE --confirm-owner
   The CLI checks exact match to the original owner-selected address and sets treasuryVerified only for a truly validated signature, but checkout remains disabled.
4. Before enabling commerce independently verify business legal/tax/consumer rules, dispute/refund, actual third-party seller payout signatures and delivery, recoverable treasury wallet control, and user-approved real EIP-5792 atomic smart-wallet payer with legitimate funds and gas. No self-buys among VM1-VM6.
5. A later explicit --activate requires owner-confirmed wallet backup, regulatory/fulfillment flags, verified independent merchant and public wallet signature. Until all real gates pass, keep individual seller paymentEnabled false until true seller authorization, and pause global checkout if there is a compromise.
6. Genuine customer sale is only recorded after one real finalized Base canonical Circle USDC transaction contains 90% seller and 10% treasury, both independently verified in same atomic onchain transaction. Self-test or historical HashN1USDC is NOT RelayMarket commission.

The user has NOT signed a MetaMask authorization message, backed up the wallet with proof, supplied Base ETH or arranged independent buyer/seller. Hence real mainnet test transaction and live fee collection cannot safely or truthfully be claimed.
