import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {validateListing,parseIssue,fetchApprovedListings,safeHttpsUrl,REPO,ISSUES_URL} from "../public/catalog.mjs";
const base = Object.freeze({
  name:"Example Autonomous Research",
  type:"hire",
  description:"I review licensed public sources and produce a cited briefing with defined acceptance criteria.",
  agent_url:"https://example.org/.well-known/agent-card.json",
  contact_url:"https://github.com/legitimate-user/repo/issues",
  price_usdc:5,
  tags:"research,qa",
  seller_wallet:""
});
const fakeIssue=(label="approved", raw=base)=>({
  number:17,state:"open",labels:[{name:label}],user:{login:"real-operator"},
  html_url:"https://github.com/" + REPO + "/issues/17",
  body:String.fromCharCode(96).repeat(3)+"json\n"+JSON.stringify(raw)+"\n"+String.fromCharCode(96).repeat(3)
});
test("accepts a genuine bounded opt-in listing",()=>{
  const output=validateListing(base);
  assert.equal(output.price_usdc,5);
  assert.deepEqual(output.tags,["research","qa"]);
});
test("requires real public HTTPS URLs, not localhost, javascript or credential URLs",()=>{
  for(const input of ["http://example.org/","javascript:alert(1)","https://localhost:123/","https://127.0.0.1/foo","https://10.5.1.2/foo","https://secret:pass@example.org/private","https://192.168.1.1/"]) {
    assert.equal(safeHttpsUrl(input),"",input);
  }
});
test("refuses bogus pricing and wallet formats",()=>{
  for(const price of [0,NaN,-5,0.001,1000000,"FREE"]) assert.throws(()=>validateListing({...base,price_usdc:price}));
  assert.throws(()=>validateListing({...base,seller_wallet:"0xabc"}));
});
test("rejects XSS-linking injected issue with invalid URL",()=>{
  assert.equal(parseIssue(fakeIssue("approved",{...base,contact_url:"javascript:alert(document.cookie)"})),null);
});
test("unapproved, closed, and pull request issues are excluded",()=>{
  assert.equal(parseIssue(fakeIssue("pending")),null);
  assert.equal(parseIssue({...fakeIssue(),state:"closed"}),null);
  assert.equal(parseIssue({...fakeIssue(),pull_request:{url:"https://api.github.com"}}),null);
});
test("valid approved seller is parsed and keeps provenance",()=>{
  const item=parseIssue(fakeIssue());
  assert.equal(item.owner,"real-operator");
  assert.equal(item.id,17);
  assert.equal(item.type,"hire");
  assert.equal(item.price_usdc,5);
});
test("parses native GitHub issue form headings",()=>{
  const body=[
    "### Agent / product name","Example Autonomous Research",
    "### Listing type","hire",
    "### What does your agent do?","I review licensed public sources and produce a cited briefing with defined acceptance criteria.",
    "### Public service / agent card URL","https://example.org/agent-card.json",
    "### Base USDC proposed price","5",
    "### Public operator contact URL","https://github.com/real-operator/docs/issues",
    "### Tags","research,qa"
  ].join("\n\n");
  assert.equal(parseIssue({...fakeIssue(),body})?.name,"Example Autonomous Research");
});
test("fetches only approved issues without counting duplicate or purchase",async()=>{
  const data=[fakeIssue(),fakeIssue(),fakeIssue("pending")];
  const result=await fetchApprovedListings(async()=>({ok:true,json:async()=>data}));
  assert.equal(result.length,1);
  assert.equal(ISSUES_URL.includes("labels=approved"),true);
});
test("beta must not advertise completed payment or collect keys",()=>{
  const config=JSON.parse(fs.readFileSync(new URL("../public/market.json",import.meta.url)));
  assert.equal(config.live.checkout,false);
  assert.equal(config.actualCommissionReceivedUSDC,0);
  assert.equal(config.plannedCommissionBps,1000);
  const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
  assert.match(html,/USDC checkout requires verified operator and seller wallets/);
  assert.doesNotMatch(html,/type="password"/);
});
test("the future contract is clearly an undeployed 90-10 split prototype",()=>{
  const source=fs.readFileSync(new URL("../contracts/AgentMarketCheckout.sol",import.meta.url),"utf8");
  assert.match(source,/NOT DEPLOYED/);
  assert.match(source,/COMMISSION_BPS = 1000/);
  assert.match(source,/transferFrom\(msg\.sender, seller, proceeds\)/);
  assert.match(source,/transferFrom\(msg\.sender, treasury, fee\)/);
});
