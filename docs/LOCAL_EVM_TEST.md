# RelayMarket: signed LOCAL EVM settlement test (not mainnet)

Date: 2026-10-19. A real signed onchain transaction in ephemeral Ganache was executed. This is a PRIVATE test blockchain (simulated chain ID 8453) using FAKE LocalMockUSDC and TEMPORARY test-only wallets. No Base mainnet USDC or user's MetaMask was used.

Test 1: in one transaction 1 mock USDC was split 0.900000 seller + 0.100000 platform. Actual mined receipt was read and verified through eth_getTransactionReceipt and eth_blockNumber and both ERC20 Transfer events.

Test 2: an independent signed transaction deliberately left only 0.95 mock USDC in the paying smart account, so 0.9 could be sent to seller but not 0.1 to platform. Both transfers reverted together and earlier seller/platform balances remained unchanged.

This proves local EVM atomicity and receipt-verifier compatibility for the test smart-account contract. It does NOT prove compatibility with an actual public EIP-5792 wallet or claim a real buyer, commission, deposit or successful Base mainnet payment.

## Reproduce only with temporary fake funds

    mkdir -p /tmp/relaymarket-local-evm-v03
    npm install --prefix /tmp/relaymarket-local-evm-v03 --no-save --no-audit --no-fund --ignore-scripts ganache@7.9.2 solc@0.8.30 ethers@6.17.0
    cd make_money/work/vm5-agent-market
    RELAYMARKET_EVM_LIBDIR=/tmp/relaymarket-local-evm-v03/node_modules node tests/local-evm-actual-transaction.sim.mjs

No public explorer URL exists for these ephemeral Ganache transactions. It is prohibited to use a VM1/VM5 original wallet/private key with this test.

## Live wallet status
User selected the existing original VM1 MetaMask public EVM account as intended 10% commission recipient. Original wallet public address is recorded in private VM5 metadata (accounts/relaymarket_vm1_treasury_candidate.json). At inspection: real Base balance 1.000000 USDC, gas ETH 0. Recovery phrase backup NOT VERIFIED. Owner signature NOT VERIFIED. Mainnet test transaction NOT PERFORMED. Actual RelayMarket received commission remains 0 USDC.
