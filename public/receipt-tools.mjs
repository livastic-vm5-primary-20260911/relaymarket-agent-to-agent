// Public read-only Base receipts and durable wallet batch identifiers.
// No signing keys, accounts, seed phrases, transaction submission, or token approvals.
import {
 BASE_USDC,normalizeAddress,isTxHash,toUnits,planPayment,verifyReceipt,operatorTreasuryAuthorized
} from "./payment.mjs";

const HASH=/^0x[0-9a-fA-F]{64}$/;
const BATCH=/^0x[0-9a-fA-F]{2,256}$/;

export function receiptEligible(config,item) {
  if(!config||config.chainId!==8453||
      String(config.token||"").toLowerCase()!==BASE_USDC.toLowerCase()||
      config.feeBps!==1000||!operatorTreasuryAuthorized(config)||!config.treasury) return false;
  if(!item || !item.paymentEnabled || !item.payoutVerified || !item.deliveryTermsVerified || !item.seller_wallet)return false;
  try {return normalizeAddress(item.seller_wallet)!==normalizeAddress(config.treasury)}
  catch{return false}
}

export function buildReceiptPlan(config,item,buyer) {
  if(!receiptEligible(config,item))throw new Error("The listing and platform do not have matching verified payment evidence.");
  return planPayment({
    buyer,seller:item.seller_wallet,treasury:config.treasury,price:String(item.price_usdc),listingId:item.id
  });
}

export function parsePending(value){
  if(!value || typeof value!=="object" || value.version!==1 ||
     !["awaiting","submitted"].includes(value.phase) ||
     !/^issue-[1-9]\d{0,7}$/.test(String(value.listingId||"")) ||
     !Number.isSafeInteger(value.createdAt)||value.createdAt<0 ||
     typeof value.buyer!=="string" ||
     typeof value.seller!=="string" ||
     typeof value.treasury!=="string")return null;
  let pending;
  try {
    pending={
      version:1,phase:value.phase,
      listingId:value.listingId,
      buyer:normalizeAddress(value.buyer),
      seller:normalizeAddress(value.seller),
      treasury:normalizeAddress(value.treasury),
      price:String(value.price),
      batchId:value.batchId==null?null:String(value.batchId),
      createdAt:value.createdAt
    };
    toUnits(pending.price);
    if(pending.phase==="submitted" && !BATCH.test(pending.batchId||""))return null;
    if(pending.batchId && !BATCH.test(pending.batchId))return null;
    if(pending.createdAt>Date.now()+60000)return null;
  }catch{return null}
  return pending;
}
export function createPending(plan,phase,batchId=null,now=Date.now()){
  const saved=parsePending({
    version:1,phase,listingId:plan.listingId,buyer:plan.from,
    seller:plan.payee,treasury:plan.feeRecipient,
    price:String(Number(plan.gross)/1000000), // two-decimal catalog offers only
    batchId,createdAt:now
  });
  if(!saved)throw new Error("Cannot persist a valid transaction batch checkpoint.");
  return saved;
}
export function pendingMatchesPlan(pending,plan){
  return !!pending && !!plan &&
    pending.listingId===plan.listingId &&
    pending.buyer===plan.from&&pending.seller===plan.payee&&
    pending.treasury===plan.feeRecipient&&toUnits(pending.price)===plan.gross;
}
export function verifiedOrderRecord(item,plan,proof,at=new Date().toISOString()) {
  if(!isTxHash(proof?.hash) || !pendingMatchesPlan(
    {listingId:item.id,buyer:plan.from,seller:plan.payee,treasury:plan.feeRecipient,price:String(item.price_usdc)},plan
  )) throw new Error("Cannot store unverified order evidence.");
  return Object.freeze({
    id:item.id,buyer:plan.from,seller:plan.payee,treasury:plan.feeRecipient,
    txHash:proof.hash,priceUSDC:proof.gross,sellerUSDC:proof.seller,
    commissionUSDC:proof.fee,verifiedAt:at
  });
}
export async function readConfirmedBaseTx({rpc,txHash,plan,minConfirmations=3}) {
  if(!HASH.test(String(txHash||"")))throw new Error("A genuine Base transaction hash is required.");
  if(typeof rpc!=="function")throw new Error("Read-only Base provider missing.");
  if(!Number.isSafeInteger(minConfirmations)||minConfirmations<1||minConfirmations>200)throw new Error("Invalid confirmation count.");
  const chain=await rpc("eth_chainId",[]);
  if(String(chain).toLowerCase()!=="0x2105")throw new Error("This RPC is not Base mainnet.");
  const [receipt,latest]=await Promise.all([
    rpc("eth_getTransactionReceipt",[txHash]),rpc("eth_blockNumber",[])
  ]);
  if(!receipt)throw new Error("Transaction has not yet been mined on Base.");
  if(String(receipt.transactionHash).toLowerCase()!==txHash.toLowerCase())throw new Error("Independent RPC returned the wrong transaction.");
  const proof=verifyReceipt(receipt,plan);
  const confirms=BigInt(latest)-proof.blockNumber+1n;
  if(confirms<0n)throw new Error("Transaction block is newer than RPC head.");
  if(confirms<BigInt(minConfirmations))throw new Error("Waiting for "+minConfirmations+" independent Base confirmations (currently "+confirms+").");
  return {...proof,confirmations:Number(confirms)};
}
