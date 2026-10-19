// RelayMarket LOCAL EVM REAL signed transaction integration (NOT Base mainnet).
// This runs Ganache in memory, mints fake local USDC and signs actual private-chain
// transactions from TEMP test-only Ganache accounts. NO user wallet, gas, keys, nor
// real tokens are touched. Does not claim marketplace revenue.
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {BASE_USDC,planPayment,verifyReceipt} from "../public/payment.mjs";
import {readConfirmedBaseTx} from "../public/receipt-tools.mjs";

const require=createRequire(import.meta.url);
const root=process.env.RELAYMARKET_EVM_LIBDIR;
if(!root || !root.startsWith("/tmp/")) {
  throw new Error("Set RELAYMARKET_EVM_LIBDIR=/tmp/relaymarket-local-evm-v03; never point to owner wallet files.");
}
const {provider:makeChain}=require(root+"/ganache");
const solc=require(root+"/solc");
const {ethers}=require(root+"/ethers");

const solidity=String.raw`// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract LocalMockUSDC {
    mapping(address=>uint256) public balanceOf;
    event Transfer(address indexed from,address indexed to,uint256 value);
    function mint(address to,uint256 value) external {balanceOf[to]+=value;emit Transfer(address(0),to,value);}
    function transfer(address to,uint256 value) external returns(bool) {
        require(balanceOf[msg.sender]>=value,"INSUFFICIENT_FUNDS");
        balanceOf[msg.sender]-=value;
        balanceOf[to]+=value;
        emit Transfer(msg.sender,to,value);
        return true;
    }
}
interface IToken {function transfer(address,uint256) external returns(bool);}
contract LocalAtomicSmartAccount {
    address public immutable owner;
    IToken public immutable token;
    constructor(address token_) {owner=msg.sender;token=IToken(token_);}
    function pay(address seller,address marketplace,uint256 gross) external {
        require(msg.sender==owner,"NOT_OWNER");
        require(seller!=marketplace && seller!=address(0) && marketplace!=address(0),"INVALID_PAYEE");
        uint256 fee=gross/10;
        require(fee>0,"FEE_TOO_SMALL");
        require(token.transfer(seller,gross-fee),"SELLER_FAILED");
        require(token.transfer(marketplace,fee),"FEE_FAILED");
    }
}
`;
const compiled=JSON.parse(solc.compile(JSON.stringify({
  language:"Solidity",
  sources:{"RelayMarketLocal.sol":{content:solidity}},
  settings:{optimizer:{enabled:true,runs:180},evmVersion:"shanghai",outputSelection:{"*":{"*":["abi","evm.bytecode"]}}}
})));
const errors=compiled.errors?.filter(x=>x.severity==="error")||[];
if(errors.length)throw new Error(errors.map(x=>x.formattedMessage).join("\n"));
const contracts=compiled.contracts["RelayMarketLocal.sol"];
const g=makeChain({chain:{chainId:8453,hardfork:"shanghai"},wallet:{totalAccounts:4,defaultBalance:100},logging:{quiet:true}});
const provider=new ethers.BrowserProvider(g);
const [owner,sellerSigner,treasurySigner]=await Promise.all([provider.getSigner(0),provider.getSigner(1),provider.getSigner(2)]);
const seller=await sellerSigner.getAddress(),treasury=await treasurySigner.getAddress();
const mockFactory=new ethers.ContractFactory(contracts.LocalMockUSDC.abi,contracts.LocalMockUSDC.evm.bytecode.object,owner);
const token=await mockFactory.deploy();await token.waitForDeployment();
const walletFactory=new ethers.ContractFactory(contracts.LocalAtomicSmartAccount.abi,contracts.LocalAtomicSmartAccount.evm.bytecode.object,owner);
const wallet=await walletFactory.deploy(await token.getAddress());await wallet.waitForDeployment();

await (await token.mint(await wallet.getAddress(),1000000n)).wait();
const actualTx=await wallet.pay(seller,treasury,1000000n,{gasLimit:600000});
const receipt=await actualTx.wait();
assert.equal(receipt.status,1);
await g.request({method:"evm_mine",params:[]});await g.request({method:"evm_mine",params:[]});

const plan=planPayment({
 buyer:await wallet.getAddress(),seller,treasury,price:"1",listingId:"issue-1"
});
const localPlan={...plan,token:(await token.getAddress()).toLowerCase()};
const rpc=(method,params=[])=>g.request({method,params});
const proof=await readConfirmedBaseTx({rpc,txHash:actualTx.hash,plan:localPlan,minConfirmations:3});
assert.equal(proof.gross,"1");
assert.equal(proof.seller,"0.9");
assert.equal(proof.fee,"0.1");
assert.equal(await token.balanceOf(seller),900000n);
assert.equal(await token.balanceOf(treasury),100000n);
assert.equal(await token.balanceOf(await wallet.getAddress()),0n);

// Try a second payment with only 0.95 mock USDC: the first transfer would be 0.9,
// but the second 0.1 MUST revert, leaving BOTH sellers/treasury unchanged.
await (await token.mint(await wallet.getAddress(),950000n)).wait();
let reverted=false,failedTxHash=null;
try {
 const failing=await wallet.pay(seller,treasury,1000000n,{gasLimit:600000});
 failedTxHash=failing.hash;
 await failing.wait();
}catch(e){
 reverted=true;
 if(!failedTxHash && e?.receipt?.hash)failedTxHash=e.receipt.hash;
}
assert.ok(reverted,"Expected an atomic failed transaction.");
assert.equal(await token.balanceOf(seller),900000n);
assert.equal(await token.balanceOf(treasury),100000n);
assert.equal(await token.balanceOf(await wallet.getAddress()),950000n);
if(failedTxHash){
 const failed=await g.request({method:"eth_getTransactionReceipt",params:[failedTxHash]});
 assert.equal(failed.status,"0x0");
 assert.throws(()=>verifyReceipt(failed,localPlan),/did not succeed/);
}
console.log(JSON.stringify({
 scope:"PRIVATE_GANACHE_EPHEMERAL_TEST_CHAIN_ONLY_NOT_BASE_MAINNET",
 baseChainIdEmulated:8453,
 productionBaseUSDCNotUsed:true,
 testCurrency:"FAKE_LOCAL_MOCK_USDC",
 signedRealEvmTestTransaction:true,
 explorerUrl:null,
 localTransactionHash:actualTx.hash,
 mockSellerReceived:"0.900000",
 mockPlatformReceived:"0.100000",
 independentReceiptVerification:"PASS",
 atomicSecondLegInsufficientFundsRollback:"PASS",
 testCases:2,
 userWalletKeysRead:false,
 userWalletUsed:false,
 userETHSpent:"0",
 userUSDCSpent:"0",
 actualMarketplaceRevenue:"0"
},null,2));
