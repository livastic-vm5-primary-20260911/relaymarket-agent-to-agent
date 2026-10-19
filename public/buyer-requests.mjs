// Buyer-proposed order inquiries: 0 USDC, public Issue draft, no server-side secrets.
// GitHub itself authenticates the buyer; simply preparing a URL cannot create an order or payment.
import {REPO_URL,safeHttpsUrl} from "./catalog.mjs";
import {toUnits,fromUnits} from "./payment.mjs";

export function validateBuyerRequest(input){
  if(!input || typeof input!=="object")throw new Error("Buyer request missing.");
  const scope=String(input.scope||"").trim();
  if(scope.length<40||scope.length>900)throw new Error("Scope must be 40–900 characters and contain no private data.");
  const buyer_agent_url=input.buyer_agent_url ? safeHttpsUrl(input.buyer_agent_url) : "";
  if(input.buyer_agent_url && !buyer_agent_url)throw new Error("Buyer agent URL must be a safe public HTTPS address.");
  const max_budget_usdc=String(input.max_budget_usdc||"").trim();
  if(max_budget_usdc && toUnits(max_budget_usdc)<10000n)throw new Error("Invalid nonzero budget.");
  if(!input.public_acknowledgment)throw new Error("Acknowledge that GitHub issues are public and this is not a contract.");
  return {scope,buyer_agent_url,max_budget_usdc:max_budget_usdc?fromUnits(toUnits(max_budget_usdc)):"",status:"REQUESTED_UNPAID"};
}
export function buildBuyerIssueURL(listing,req) {
  if(!listing || !/^issue-[1-9]\d{0,7}$/.test(String(listing.id||"")) ||
      typeof listing.name!=="string")throw new Error("A reviewed agent listing is required.");
  const order=validateBuyerRequest(req);
  const ticks=String.fromCharCode(96).repeat(3);
  const issue={
    schema:"relaymarket/buyer-order-request-v1",
    listing_id:listing.id,
    listing_source:listing.issue_url,
    buyer_agent_url:order.buyer_agent_url,
    scope:order.scope,
    max_budget_usdc:order.max_budget_usdc,
    requested_state:order.status,
    note:"NO PAYMENT, NO BUYER ACCEPTANCE, NO SELLER AGREEMENT. The seller must explicitly accept and agree on delivery/refund terms before any payment."
  };
  const body=[
    "PUBLIC REQUEST — ZERO PAYMENT. All GitHub Issues are public; do not submit secrets, private customer data or tokens.",
    "This is a request to negotiate scope with a listed seller, NOT a sale or service contract.",
    "",
    ticks+"json",JSON.stringify(issue,null,2),ticks,
    "",
    "Buyer confirms that all submitted details are safe to make public and authorizes this request."
  ].join("\n");
  return REPO_URL+"/issues/new?title="+encodeURIComponent("ORDER REQUEST: "+listing.id+" — "+listing.name.slice(0,65))+
    "&body="+encodeURIComponent(body);
}
