import test from "node:test";
import assert from "node:assert/strict";
import {buildBuyerIssueURL,validateBuyerRequest} from "../public/buyer-requests.mjs";
import {readFileSync} from "node:fs";
const validListing={
 id:"issue-1",name:"OpenAPI Linter",
 issue_url:"https://github.com/livastic-vm5-primary-20260911/relaymarket-agent-to-agent/issues/1"
};
test("scoped public inquiry has zero-value requested state and authenticated GitHub submission URL",()=>{
 const req={scope:"Please review a public OpenAPI schema and provide machine-readable findings with line numbers within two business days.",buyer_agent_url:"https://customer.example.com/agent",max_budget_usdc:"6.50",public_acknowledgment:true};
 const s=validateBuyerRequest(req);
 assert.equal(s.max_budget_usdc,"6.5");
 assert.equal(s.status,"REQUESTED_UNPAID");
 const url=buildBuyerIssueURL(validListing,req);
 assert.ok(url.startsWith("https://github.com/livastic-vm5-primary-20260911/relaymarket-agent-to-agent/issues/new?"));
 const u=new URL(url);
 assert.match(u.searchParams.get("title"),/ORDER REQUEST: issue-1/);
 const body=u.searchParams.get("body");
 assert.match(body,/"status"|"requested_state": "REQUESTED_UNPAID"/);
 assert.match(body,/NO PAYMENT, NO BUYER ACCEPTANCE/);
 assert.ok(body.includes("Please review a public OpenAPI"));
});
test("quote requests reject private urls, empty instructions, and missing publication consent",()=>{
 const req={scope:"Please review a public OpenAPI schema and provide findings with trustworthy references.",
  public_acknowledgment:true};
 assert.throws(()=>validateBuyerRequest({...req,buyer_agent_url:"http://127.0.0.1:3000/agent"}));
 assert.throws(()=>validateBuyerRequest({...req,public_acknowledgment:false}));
 assert.throws(()=>validateBuyerRequest({...req,scope:"help"}));
 assert.throws(()=>validateBuyerRequest({...req,max_budget_usdc:"0.000001"}));
 assert.throws(()=>buildBuyerIssueURL({...validListing,id:"issue-0"},req));
});
test("buyer quote UI never sends onchain coins or creates fake contracts",()=>{
 const source=readFileSync(new URL("../public/buyer-request-ui.mjs",import.meta.url),"utf8");
 assert.match(source,/buildBuyerIssueURL/);
 assert.doesNotMatch(source,/wallet_sendCalls|eth_sendTransaction|personal_sign/);
 const html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
 assert.match(html,/id="buyer-request-form"/);
 assert.match(html,/PUBLIC GitHub Issue/);
});
