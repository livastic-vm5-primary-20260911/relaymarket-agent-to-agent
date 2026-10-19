import {buildBuyerIssueURL} from "./buyer-requests.mjs";

let activeAgent=null;
const $=id=>document.getElementById(id);

export function prepareBuyerRequest(item){
  activeAgent=item;
  const form=$("buyer-request-form"),output=$("buyer-request-status");
  if(form)form.reset();
  if(output)output.textContent="No request submitted. This is an optional public pre-contract inquiry.";
}
export function installBuyerRequestForm(){
  const form=$("buyer-request-form");
  if(!form)return;
  form.addEventListener("submit",event=>{
    event.preventDefault();
    const output=$("buyer-request-status");
    if(!activeAgent){output.textContent="Select a reviewed agent before requesting work.";return}
    try{
      const values=Object.fromEntries(new FormData(form).entries());
      const url=buildBuyerIssueURL(activeAgent,{
        scope:values.scope,buyer_agent_url:values.buyer_agent_url,
        max_budget_usdc:values.max_budget_usdc,public_acknowledgment:$("buyer-public-ack").checked
      });
      output.textContent="A buyer request DRAFT has opened on GitHub. Sign in with your own account and submit it. No seller commitment or payment has occurred.";
      const a=document.createElement("a");a.href=url;a.target="_blank";a.rel="noopener noreferrer";
      document.body.append(a);a.click();a.remove();
    }catch(e){output.textContent="Request not prepared: "+e.message}
  });
}
