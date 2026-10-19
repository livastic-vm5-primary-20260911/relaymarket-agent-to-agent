// Pure Base USDC atomic wallet batching / independently auditable receipt checks.
// No account keys, fees, escrow or network requests here.
export const BASE_CHAIN_ID = "0x2105"; // 8453
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const VM1_OWNER_TREASURY = "0x4e3106520E40af30870caFE78da1B1e7110eD98E"; // Selected explicitly by marketplace owner, 2026-10-19
export const USDC_DECIMALS = 6n;
export const BPS = 10000n;
export const FEE_BPS = 1000n;
export const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX_TX = /^0x[0-9a-fA-F]{64}$/;

export function normalizeAddress(value) {
  if (typeof value !== "string" || !HEX_ADDRESS.test(value)) throw new Error("Invalid public EVM address.");
  return value.toLowerCase();
}
export function isTxHash(value) {return typeof value==="string" && HEX_TX.test(value);}
export function toUnits(value) {
  const raw=String(value);
  if (!/^(0|[1-9]\d{0,5})(?:\.\d{1,6})?$/.test(raw)) throw new Error("USDC amount must have at most 6 decimals.");
  const [whole,fraction=""]=raw.split(".");
  const n=BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,"0")||"0");
  if (n<10000n || n>100000000000n) throw new Error("Price must be from 0.01 to 100,000 USDC.");
  return n;
}
export function fromUnits(n) {
  const val=BigInt(n);
  if(val<0n)throw new Error("Amount cannot be negative.");
  const whole=val/1000000n;
  const frac=String(val%1000000n).padStart(6,"0").replace(/0+$/,"");
  return String(whole)+(frac?"."+frac:"");
}
export function planPayment({buyer,seller,treasury,price,listingId}) {
  const from=normalizeAddress(buyer), payee=normalizeAddress(seller), feeRecipient=normalizeAddress(treasury);
  if(from===payee || from===feeRecipient || payee===feeRecipient) throw new Error("Buyer, seller and marketplace must be independent addresses.");
  if(typeof listingId!=="string" || !/^issue-[1-9]\d{0,7}$/.test(listingId))throw new Error("Unknown catalog listing ID.");
  const gross=toUnits(price);
  const fee=gross*FEE_BPS/BPS;
  const sellerProceeds=gross-fee;
  if(fee<1n || sellerProceeds<1n)throw new Error("The amount is too small to split.");
  return Object.freeze({
    listingId,from,payee,feeRecipient,token:normalizeAddress(BASE_USDC),
    gross,fee,sellerProceeds,
    calls:Object.freeze([
      Object.freeze({to:BASE_USDC,data:encodeTransfer(payee,sellerProceeds),value:"0x0"}),
      Object.freeze({to:BASE_USDC,data:encodeTransfer(feeRecipient,fee),value:"0x0"})
    ])
  });
}
export function encodeTransfer(to,amount) {
  const to40=normalizeAddress(to).slice(2);
  const value=BigInt(amount);
  if(value<=0n||value>=(1n<<256n))throw new Error("Invalid token transfer value.");
  return "0xa9059cbb"+to40.padStart(64,"0")+value.toString(16).padStart(64,"0");
}
export function walletRequest(plan) {
  // EIP-5792 wallet may reject unsupported atomic batching. Never fall back to sequential tx.
  if(!plan?.calls||plan.calls.length!==2)throw new Error("Invalid pre-validated payment plan.");
  return {version:"2.0.0",chainId:BASE_CHAIN_ID,from:plan.from,atomicRequired:true,calls:[...plan.calls]};
}
function wordAddress(topic) {
  if(typeof topic!=="string"||!/^0x[0-9a-fA-F]{64}$/.test(topic))return null;
  if(!/^0x0{24}/i.test(topic))return null;
  return "0x"+topic.slice(-40).toLowerCase();
}
export function verifyReceipt(receipt,plan) {
  if(!receipt||!plan)throw new Error("Missing receipt/plan.");
  if(receipt.status!=="0x1" && receipt.status!==1 && receipt.status!=="1")throw new Error("The Base transaction did not succeed.");
  if(!isTxHash(receipt.transactionHash))throw new Error("Transaction hash missing.");
  if(typeof receipt.blockHash!=="string"||!isTxHash(receipt.blockHash))throw new Error("No onchain mined block confirmation.");
  const matches={seller:0,fee:0};
  for(const log of (Array.isArray(receipt.logs)?receipt.logs:[])){
    if(typeof log?.address!=="string"||log.address.toLowerCase()!==plan.token)continue;
    if(!Array.isArray(log.topics)||log.topics.length!==3||log.topics[0]?.toLowerCase()!==ERC20_TRANSFER_TOPIC)continue;
    const from=wordAddress(log.topics[1]),to=wordAddress(log.topics[2]);
    if(from!==plan.from||!to||typeof log.data!=="string"||!/^0x[0-9a-fA-F]{64}$/.test(log.data))continue;
    const amount=BigInt(log.data);
    if(to===plan.payee&&amount===plan.sellerProceeds)matches.seller++;
    if(to===plan.feeRecipient&&amount===plan.fee)matches.fee++;
  }
  if(matches.seller!==1||matches.fee!==1)throw new Error("Missing or ambiguous seller and 10% marketplace USDC transfers.");
  return {hash:receipt.transactionHash,blockNumber:BigInt(receipt.blockNumber),gross:fromUnits(plan.gross),seller:fromUnits(plan.sellerProceeds),fee:fromUnits(plan.fee)};
}
export function verifyCallBatch(batch) {
  if(!batch||batch.atomic!==true||batch.status!==200)throw new Error("Wallet did not confirm atomic successful execution.");
  if(!Array.isArray(batch.receipts)||batch.receipts.length!==1)throw new Error("Expected exactly one atomic onchain receipt.");
  const r=batch.receipts[0];
  if(!isTxHash(r.transactionHash)||r.status!=="0x1")throw new Error("Atomic batch receipt failed.");
  return r.transactionHash;
}
export function operatorTreasuryAuthorized(config) {
  if(!config || !HEX_ADDRESS.test(String(config.treasury||""))) return false;
  if(config.treasurySelectedByUser===true){
    // Current owner directly authorized exactly the ORIGINAL VM1 account;
    // never accept a substituted recipient without a new explicit owner action.
    return normalizeAddress(config.treasury)===normalizeAddress(VM1_OWNER_TREASURY);
  }
  return config.treasuryVerified===true;
}

export function checkoutPolicy(config,listing) {
  if(!config||config.enabled!==true||!operatorTreasuryAuthorized(config))return {enabled:false,reason:"Original VM1 owner-selected commission wallet is not configured or marketplace payments are paused."};
  if(config.chainId!==8453||normalizeAddress(config.token)!==normalizeAddress(BASE_USDC)||Number(config.feeBps)!==1000)return {enabled:false,reason:"Checkout configuration is not pinned to Base native USDC and the approved 10% fee."};
  if(!listing||listing.paymentEnabled!==true||listing.payoutVerified!==true||listing.deliveryTermsVerified!==true||!HEX_ADDRESS.test(listing.seller_wallet||""))return {enabled:false,reason:"Seller payout wallet and delivery terms are not yet verified."};
  if(!listing.owner || !listing.issue_url)return {enabled:false,reason:"Seller identity and public listing evidence missing."};
  if(normalizeAddress(listing.seller_wallet)===normalizeAddress(config.treasury))return {enabled:false,reason:"Seller and platform payout wallets must differ."};
  return {enabled:true,reason:"Eligible for atomic-wallet checkout."};
}
