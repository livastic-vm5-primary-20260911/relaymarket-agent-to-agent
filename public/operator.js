import {treasuryChallenge} from "./treasury-proof.mjs";
const $=id=>document.getElementById(id);
let command=null;
$("treasury-connect").addEventListener("click",async()=>{
  try{
    const p=window.ethereum;
    if(!p?.request)throw new Error("No compatible wallet extension found.");
    const addr=String($("treasury-address").value).trim();
    if(!/^0x[0-9a-fA-F]{40}$/.test(addr))throw new Error("Enter the PUBLIC wallet address first.");
    const list=await p.request({method:"eth_requestAccounts"});
    if(!Array.isArray(list)||String(list[0]).toLowerCase()!==addr.toLowerCase())throw new Error("Wallet connected to a different account; do not sign.");
    const challenge=treasuryChallenge(addr);
    const sig=await p.request({method:"personal_sign",params:[challenge,addr]});
    if(!/^0x[0-9a-fA-F]{130}$/.test(String(sig||"")))throw new Error("Unexpected signature returned.");
    command="node scripts/configure-treasury.mjs --address "+addr+" --signature "+sig+" --confirm-owner --activate";
    $("treasury-command").value=command;
    $("treasury-copy").disabled=false;
    $("treasury-status").textContent="Wallet ownership proof signed. This is a public signature only, not a transaction. Submit this command to the trusted VM5 repository operator after completing the launch safety checklist.";
  }catch(e){$("treasury-status").textContent="No treasury configured: "+e.message;}
});
$("treasury-copy").addEventListener("click",()=>{
  if(!command)return;
  navigator.clipboard.writeText(command).then(()=>$("treasury-status").textContent="Public signature setup command copied. Only authorized repo operator can publish it.").catch(()=>$("treasury-status").textContent="Copy failed; manually select the command text.");
});
