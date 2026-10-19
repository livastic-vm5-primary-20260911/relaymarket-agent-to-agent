# Checkout launch checklist — NO-GO for real funds

Standard x402 exact settlement sends money to a single payTo address, not automatically 90% to a seller and 10% to the marketplace. A central platform wallet that receives all coins and forwards them would introduce custody, key management, compliance and fraud risks.

An **unaudited local prototype** in `contracts/AgentMarketCheckout.sol» sketches atomic Base USDC transfers: 90% seller / 10% platform on buyer-authorized purchase, without holding buyer keys or token custody.

BEFORE even enabling a buy button:
1. The user must supply a verified **public** treasury address, controlled safely by the legitimate operator. No seed phrases or private keys.
2. Independently audit the smart contract, perform extensive test-chain/fuzz tests, and verify token address, chain ID, allowance and reentrancy controls.
3. The real owner must separately authorize mainnet deployment, chain transaction signing and gas. No automatic wallet signing, credential access or account resets.
4. Confirm deployed bytecode, verified source, treasury wallet and exact USDC contract.
5. Buyer wallet must show destination, amount, fees, operator, risks, final delivery and immutable purchase reference.
6. Set seller verification, delivery acceptance, disputes, refunds, taxes, AML/KYC and local regulatory compliance if required. A payment receipt does not make seller deliver the agent.
7. Only count externally finalized, unique payout transactions as received revenue. Don't count mock tests or HTTP 402 quotes as money.

None of these gates has been completed by this beta. **Checkout is disabled.**
