# RelayMarket operations — VM5, 19 Oct 2026

Production: https://relaymarket-agents-vm5.onrender.com/
Source: https://github.com/livastic-vm5-primary-20260911/relaymarket-agent-to-agent
Original VM5 workspace: make_money/work/vm5-agent-market
Independent Render FREE Static Site ID: srv-dbatcu61egvs73c2lou0

The VM5 original x402 API is a separate service. Do NOT modify it or restart Golem/AIOZ/CPU/GPU rental: the user prohibited resource resale.

## Developer releases (no paid plan)
- npm ci --no-audit --no-fund
- npm run check && npm test
- npm audit --omit=dev
- git diff --check; stage only expected source files, verify no credentials.
- git commit and git push to main from the original authorized VM5 GitHub identity.
- Verify the ACTUAL Render deployment commit. Even with On Commit in Render Settings, earlier public-Git-linked pushes did not trigger an automatic deploy. Manual Deploy latest commit in the specific RelayMarket static site may be needed. Never touch original vm5-openapi-x402 site.

## Permanent storage
- public/registry/listings.json: frozen curated seller offers and reviewed payout/terms.
- public/checkout-config.json: chain, token, approved platform public treasury, on/off.
- public/ledger.json: ONLY unique real verified Base USDC onchain payout pairs, no simulated sales.
- public/market.json, public/skill.md, public/openapi.json and .well-known/agent-market.json: truthful machine discovery.

## Seller acceptance
1. Seller submits a public GitHub Issue from its own legitimate human operator account. Rights to list/license must be verified; no agents stolen, accounts/keys resold, or fake Sybil sellers.
2. Seller signs no-gas EIP-191 ownership proof for any proposed public Base USDC payout address. Proof binds agent URL, price and random nonce. No private key enters website.
3. Operator independently checks source, identity, delivery/refund terms. Run: node scripts/review-issue.mjs N --confirm-rights --confirm-delivery
4. ONLY after review and verified signature, append the offer in operator-owned frozen curated registry using: node scripts/review-issue.mjs N --confirm-rights --confirm-delivery --publish
5. Review diff, commit, deploy. A GitHub approved label alone NEVER authorizes payment.

## Buyer inquiries and delivery
Buyer uses Inspect offer -> Request a specific agent job, then submits a PUBLIC GitHub Issue draft via own GitHub account. The request is REQUESTED_UNPAID, not a contract and not money. No private documents or secrets should be pasted in a public issue. Seller must separately accept job scope and refund terms. This marketplace does not execute vendor tools or guarantee delivery.

## Coin settlement activation: HUMAN ACTION REQUIRED
The actual operator needs a verified, personally controlled BACKED-UP public Base treasury wallet and a separately signed public EIP-191 treasury ownership proof. Operator can generate public-only proof on https://relaymarket-agents-vm5.onrender.com/operator.html ; never share mnemonic, seed or private key in AI chat. Then authorized owner can run scripts/configure-treasury.mjs with --address, --signature, --confirm-owner and --activate AFTER legal/compliance, seller verification, refunds, liability and tax obligations are addressed.

The marketplace uses native Circle Base USDC chain 8453, EIP-5792 wallet_sendCalls with atomicRequired true: two transfers in a SINGLE atomic batch (90% seller, 10% operator). Wallets that cannot guarantee atomicity are rejected. Do not split into unrelated transfers, create fake clients, send self-funds or deploy experimental Solidity contracts without audit/explicit authorization.

## Pending payments and receipts
Browser writes pending-wallet public-only checkpoint BEFORE requesting wallet transaction approval. If wallet result is uncertain, do NOT retry/pay again. Reconnect to the wallet and verify wallet_getCallsStatus, or use read-only receipt importer with original buyer address + existing Base transaction hash. The verifier checks network and both canonical USDC transfer logs in one successful tx with confirmations. A receipt confirms payment, NOT seller service delivery.

Only operator may book public real revenue:
- node scripts/verify-order.mjs issue-N 0xBUYER 0xREAL_BASE_TX
- node scripts/verify-order.mjs issue-N 0xBUYER 0xREAL_BASE_TX --record
Never count another VM's income or seller x402 direct sales as marketplace commission. Keep unique hash one time and calculate net only when expenses are measured.

## Incident safety
Disable public/checkout-config.json enabled flag and redeploy after testing; cache-bust sensitive policy reads. Keep evidence and real wallet custody with its original owner. Refuse unexplained wallet/signature changes and report compromised sellers without sharing private info publicly. No gas, fund transfers or account changes by the AI without separate real operator consent.

Currently real marketplace sales = 0, verified platform commission = 0 USDC. All non-financial code paths may be live, but financial checkout must remain disabled until real ownership and compliance gates are passed.
