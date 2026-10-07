import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { OpenAICompatibleProvider, readUsage } from '../src/lib/evaluator/providers/openai-compatible.ts';
import { parseRegistry, selectProfiles, resolveConnection } from '../src/lib/evaluator/registry.ts';
import { loadStaticCases } from '../scripts/evals/datasets.mjs';
import { buildEvaluationInput } from '../src/lib/evaluator/input.ts';
import { runCase } from '../src/lib/evaluator/benchmark/runner.ts';
import { summarize } from '../src/lib/evaluator/benchmark/metrics.ts';
import { reportMarkdown } from '../scripts/evals/cli.mjs';

const registry=JSON.parse(await readFile(new URL('../config/evaluator-profiles.example.json',import.meta.url),'utf8'));
const profile={...parseRegistry(registry)[0],model:'test-model',enabled:true};
const env={EVAL_PROVIDER_A_API_KEY:'test-secret-do-not-log',EVAL_PROVIDER_A_BASE_URL:'https://provider.example/v1'};
const c=(await loadStaticCases()).find(c=>c.id==='reason-signal');
const input=buildEvaluationInput(c.problem,c.message);
const wire=(overrides={})=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(c.mockOutput)}}],usage:{prompt_tokens:120,completion_tokens:30,prompt_tokens_details:{cached_tokens:50}},...overrides});

test('registry requires explicit enabled profile selection; model/key values never live in domain logic',()=>{
  assert.equal(parseRegistry(registry)[0].enabled,false);assert.throws(()=>selectProfiles(parseRegistry(registry),['eval-cheap-a']),/disabled/);
  assert.throws(()=>selectProfiles([profile],[]),/Choose/);assert.deepEqual(selectProfiles([profile],['all']),[profile]);
  for(const mutation of [p=>p.apiKey='secret',p=>p.apiKeyEnv='NEXT_PUBLIC_API_KEY',p=>p.timeoutMs=-1,p=>p.enabled='yes',p=>p.headerEnv={Authorization:'HEADER'},p=>p.pricing={currency:'USD',inputPerMillion:-1,outputPerMillion:1,asOf:'today'}]){
    const bad=structuredClone(profile);mutation(bad);assert.throws(()=>parseRegistry({profiles:[bad]}),/Invalid/);
  }
  assert.throws(()=>parseRegistry({profiles:[profile,profile]}),/Invalid/);
});
test('connection fails closed without keys or safe URL, disallows credentials/query and never echoes values',()=>{
  for(const e of [{}, {...env,EVAL_PROVIDER_A_API_KEY:''}, {...env,EVAL_PROVIDER_A_BASE_URL:'http://example.com'}, {...env,EVAL_PROVIDER_A_BASE_URL:'https://user:secret@example.com'}, {...env,EVAL_PROVIDER_A_BASE_URL:'https://example.com?key=secret'}]){
    assert.throws(()=>resolveConnection(profile,e),e=>!e.message.includes('test-secret')&&!e.message.includes('user:secret'));
  }
});
test('compatible adapter sends capability-specific JSON contract, no tools and no expected labels',async()=>{
  let request;
  const p=new OpenAICompatibleProvider({env,fetch:async(url,options)=>{request={url,options};return Response.json(wire());}});
  const result=await p.evaluate(input,{...profile,capabilities:{...profile.capabilities,supportsJsonSchema:true}});
  assert.equal(request.url,'https://provider.example/v1/chat/completions');assert.equal(request.options.redirect,'error');assert.equal(request.options.headers.Authorization,'Bearer test-secret-do-not-log');
  const body=JSON.parse(request.options.body);assert.equal(body.model,'test-model');assert.equal(body.temperature,0);assert.equal(body.response_format.type,'json_schema');assert.equal(body.response_format.json_schema.strict,true);assert.equal(body.max_completion_tokens,2000);
  for(const key of ['tools','functions','tool_choice','progress','expected','mockOutput'])assert.equal(key in body,false);
  assert.ok(!request.options.body.includes('expectedResult'));assert.ok(!request.options.body.includes('referenceAnswer'));assert.ok(!request.options.body.includes('test-secret-do-not-log'));
  assert.deepEqual(result.usage,{status:'exact',inputTokens:120,outputTokens:30,cachedInputTokens:50});
});
test('json-mode/text-only providers do not receive unsupported options; optional headers resolve only from env',async()=>{
  for(const mode of ['json','text']) {
    let body,headers;
    const p=new OpenAICompatibleProvider({env:{...env,OPTIONAL_HEADER:'test-attribution'},fetch:async(_u,o)=>{body=JSON.parse(o.body);headers=o.headers;return Response.json(wire());}});
    await p.evaluate(input,{...profile,headerEnv:{'X-Title':'OPTIONAL_HEADER'},capabilities:{...profile.capabilities,supportsJsonSchema:false,supportsJsonMode:mode==='json',supportsTemperature:false,outputTokenParameter:'max_tokens'}});
    assert.equal('temperature' in body,false);assert.equal('max_completion_tokens' in body,false);assert.equal(body.max_tokens,2000);assert.equal(headers['X-Title'],'test-attribution');
    assert.equal(body.response_format?.type,mode==='json'?'json_object':undefined);
  }
});
test('usage reporting never invents missing token counts or cache usage',()=>{
  for(const raw of [null,{}, {prompt_tokens:4,completion_tokens:-1}, {prompt_tokens:4,completion_tokens:3,prompt_tokens_details:{cached_tokens:5}}])assert.equal(readUsage(raw).status,'unavailable');
  assert.deepEqual(readUsage({prompt_tokens:3,completion_tokens:0}),{status:'exact',inputTokens:3,outputTokens:0,cachedInputTokens:null});
});
test('HTTP status/timeout/network failures are typed and provider error text is discarded',async()=>{
  for(const [status,type] of [[401,'provider_auth_error'],[403,'provider_auth_error'],[429,'provider_rate_limit'],[500,'provider_error']]){
    const p=new OpenAICompatibleProvider({env,fetch:async()=>new Response('test-secret-do-not-log',{status})});await assert.rejects(p.evaluate(input,profile),e=>e.type===type&&e.providerDiagnostic.httpStatus===status&&!e.message.includes('secret'));
  }
  const p=new OpenAICompatibleProvider({env,fetch:async()=>{throw new Error('Authorization: test-secret-do-not-log');}});await assert.rejects(p.evaluate(input,profile),e=>e.type==='provider_error'&&e.providerDiagnostic===undefined);
  const timeout=new OpenAICompatibleProvider({env,fetch:async(_u,o)=>new Promise((_,reject)=>{const keepAlive=setTimeout(()=>reject(new Error('test timed out')),1000);o.signal.addEventListener('abort',()=>{clearTimeout(keepAlive);reject(o.signal.reason);});})});
  await assert.rejects(timeout.evaluate(input,{...profile,timeoutMs:10}),e=>e.type==='provider_timeout');
});
test('provider failure identifiers reach benchmark diagnostics without error prose or extra paid retries',async()=>{
  let requests=0;
  const p=new OpenAICompatibleProvider({env,fetch:async()=>{
    requests++;
    return Response.json({error:{code:'unsupported_value',type:'invalid_request_error',param:'reasoning_effort',message:'Authorization: test-secret-do-not-log; hidden prompt; entire interview'}},{status:400,headers:{'X-Request-ID':'test-secret-do-not-log'}});
  }});
  const result=await runCase(c,profile,p,1);
  assert.equal(requests,1);assert.equal(result.status,'failed');assert.equal(result.predicted,null);assert.equal(result.retryCount,0);
  const diagnostic={httpStatus:400,code:'unsupported_value',type:'invalid_request_error',param:'reasoning_effort'};
  assert.deepEqual(result.requests[0].providerDiagnostic,diagnostic);
  const metrics=summarize([result,result]);
  assert.deepEqual(metrics.providerFailures,[{errorType:'provider_error',...diagnostic,count:2}]);
  const report=reportMarkdown({mode:'live',profiles:{test:metrics}});
  assert.match(report,/HTTP 400; code=unsupported_value; type=invalid_request_error; param=reasoning_effort/);
  assert.match(report,/No validated evaluation was received/);
  assert.match(report,/Failed requests count as missed labels/);
  const serialized=JSON.stringify({result,metrics,report});
  for(const secret of ['test-secret-do-not-log','hidden prompt','entire interview','X-Request-ID'])assert.ok(!serialized.includes(secret),secret);
});
test('unknown provider error identifiers, HTML and oversized bodies retain only the HTTP status',async()=>{
  const bodies=[
    JSON.stringify({error:{message:'test-secret-do-not-log',code:'test-secret-do-not-log',type:'private_prompt',param:'api_key'}}),
    '<html>test-secret-do-not-log</html>',
    JSON.stringify({error:{code:'unsupported_value',type:'invalid_request_error',param:'reasoning_effort',message:'x'.repeat(17000)}}),
  ];
  for(const body of bodies){
    const p=new OpenAICompatibleProvider({env,fetch:async()=>new Response(body,{status:400})});
    await assert.rejects(p.evaluate(input,profile),e=>{
      assert.equal(e.type,'provider_error');
      assert.deepEqual(e.providerDiagnostic,{httpStatus:400,code:null,type:null,param:null});
      assert.equal(e.message,'provider_error');
      return true;
    });
  }
});
test('an interrupted HTTP error body cannot hide an already received rejection status',async()=>{
  const p=new OpenAICompatibleProvider({env,fetch:async(_url,options)=>{
    const body=new ReadableStream({start(controller){options.signal.addEventListener('abort',()=>controller.error(options.signal.reason),{once:true});}});
    return new Response(body,{status:429});
  }});
  const keepAlive=setTimeout(()=>{},1000);
  try{
    await assert.rejects(p.evaluate(input,{...profile,timeoutMs:10}),e=>e.type==='provider_rate_limit'&&e.providerDiagnostic.httpStatus===429);
  }finally{clearTimeout(keepAlive);}
});
test('tool calls, refusal and truncation are malformed results, retaining available usage for accounting',async()=>{
  for(const choice of [{finish_reason:'length',message:{content:'{}'}},{finish_reason:'stop',message:{refusal:'refused'}},{finish_reason:'tool_calls',message:{tool_calls:[{name:'shell'}]}},{finish_reason:'stop',message:{content:'{}',tool_calls:[]}}]){
    const p=new OpenAICompatibleProvider({env,fetch:async()=>Response.json(wire({choices:[choice]}))});const response=await p.evaluate(input,profile);assert.equal(response.raw,'');assert.equal(response.usage.inputTokens,120);
  }
});
test('oversized or non-JSON provider envelope is rejected, never written as a raw error',async()=>{
  for(const content of ['not JSON','x'.repeat(260000)]){
    const p=new OpenAICompatibleProvider({env,fetch:async()=>new Response(content)});await assert.rejects(p.evaluate(input,profile),e=>e.type==='malformed_output'&&e.message.length<40);
  }
});
