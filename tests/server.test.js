import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once,EventEmitter} from 'node:events'
import WebSocket from 'ws'
import {setTimeout as delay} from 'node:timers/promises'

let child,url,stderr=''
before(async()=>{
  child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0',IQ_TURN_MS:'1000',WOLF_TURN_MS:'800',WOLF_RECONNECT_MS:'300'},stdio:['ignore','pipe','pipe']})
  child.stderr.on('data',data=>stderr+=data)
  const [output]=await once(child.stdout,'data',{signal:AbortSignal.timeout(5000)})
  url=String(output).trim().replace('Doan Dai Hiep server: http://0.0.0.0:','ws://127.0.0.1:')
})
after(async()=>{
  const exited=once(child,'exit')
  child.kill('SIGKILL');await exited
  assert.equal(stderr,'')
})
async function client(t){
  const ws=new WebSocket(url),events=new EventEmitter()
  const c={ws,state:null,last:null,messages:[],send(data){ws.send(JSON.stringify(data))},async wait(predicate){
    const signal=AbortSignal.timeout(5000)
    while(!predicate(c.state,c.last))await once(events,'message',{signal})
    return c.state
  }}
  ws.on('error',()=>{})
  ws.on('message',raw=>{const data=JSON.parse(raw);c.last=data;c.messages.push(data);if(data.type.endsWith('state'))c.state=data;events.emit('message')})
  await once(ws,'open')
  t.after(()=>ws.terminate())
  return c
}
async function wolfGame(t,count=7){
  const peers=[]
  const host=await client(t);peers.push(host)
  host.send({type:'wolf_create',name:'Player 0'})
  await host.wait(s=>s?.status==='lobby')
  const code=host.state.code
  for(let i=1;i<count;i++){
    const peer=await client(t);peers.push(peer)
    peer.send({type:'wolf_join',code,name:`Player ${i}`})
    await peer.wait(s=>s?.status==='lobby')
  }
  host.send({type:'wolf_start'})
  await Promise.all(peers.map(p=>p.wait(s=>s?.status==='playing')))
  return peers
}
async function night(peers,{victim,witch='skip',guard}={}){
  const host=peers[0]
  while(host.state.phase==='night'){
    const step=host.state.step,round=host.state.round
    const actors=peers.filter(p=>p.state.you.alive&&p.state.you.role===step)
    for(const actor of actors){
      await actor.wait(s=>s.step===step&&s.round===round)
      let target
      if(step==='witch')target=witch
      else if(step==='wolf')target=victim||peers.find(p=>p.state.you.alive&&p.state.you.role==='villager').state.you.id
      else target=guard||actor.state.you.id
      actor.send({type:'wolf_action',target})
    }
    await host.wait(s=>s.step!==step||s.round!==round)
  }
  await Promise.all(peers.map(p=>p.wait(s=>s.phase===host.state.phase)))
}
async function voteOut(peers,id){
  const host=peers[0],round=host.state.round
  const alive=peers.filter(p=>p.state.you.alive)
  for(const p of alive)p.send({type:'wolf_vote',target:p.state.you.id===id?alive.find(q=>q!==p).state.you.id:id})
  await host.wait(s=>s.status==='finished'||s.phase!=='day'||s.round!==round)
  await Promise.all(peers.map(p=>p.wait(s=>s.phase===host.state.phase&&s.round===host.state.round)))
}

test('malformed commands are rejected and Caro stays playable',async t=>{
  const a=await client(t),b=await client(t)
  for(const payload of ['null','[]','1','"hello"','{']){
    a.last=null;a.ws.send(payload)
    await a.wait((_,last)=>last?.type==='error')
  }
  for(const type of ['join','caro_join','wolf_join']){
    a.last=null;a.send({type,code:{toString:1},name:'Invalid code'})
    await a.wait((_,last)=>last?.type.endsWith('error'))
  }
  a.send({type:'caro_create'});await a.wait(s=>s?.type==='caro_state')
  b.send({type:'caro_join',code:a.state.code});await a.wait(s=>s.status==='playing')
  for(const [row,col]of [[undefined,0],[null,0],[0.5,0],['0',0],[-1,0],[15,0],[0,{}]]){
    a.last=null;a.send({type:'caro_move',row,col})
    await a.wait((_,last)=>last?.type==='caro_error')
    assert.equal(a.state.history.length,0)
  }
  a.send({type:'caro_move',row:7,col:7});await b.wait(s=>s?.history.length===1)
  assert.equal(b.state.board[7][7],1)
})
test('oversized messages close only the offending connection',async t=>{
  const bad=await client(t),closed=once(bad.ws,'close')
  bad.ws.send('x'.repeat(17000));await closed
  const good=await client(t)
  good.send({type:'create'});await good.wait(s=>s?.type==='state')
})
test('Caro online declares the winning piece and resets both players',async t=>{
  const x=await client(t),o=await client(t)
  x.send({type:'caro_create'});await x.wait(s=>s?.type==='caro_state')
  o.send({type:'caro_join',code:x.state.code});await x.wait(s=>s.status==='playing')
  for(let col=0;col<5;col++){
    x.send({type:'caro_move',row:0,col});await o.wait(s=>s?.history.length===col*2+1)
    if(col<4){o.send({type:'caro_move',row:2,col});await x.wait(s=>s.history.length===col*2+2)}
  }
  assert.equal(o.state.winner,1)
  o.send({type:'caro_reset'});await x.wait(s=>s.history.length===0)
  assert.equal(x.state.winner,null)
})
test('Werewolf reconnect requires a private token and cancels forfeiture',async t=>{
  const peers=await wolfGame(t),old=peers[1],saved=old.state.you,host=peers[0]
  assert.equal(host.messages.some(m=>m.players?.some(p=>'reconnectToken'in p)),false)
  old.ws.close();await host.wait(s=>!s.players.find(p=>p.id===saved.id).connected)
  const attacker=await client(t)
  attacker.send({type:'wolf_join',code:host.state.code,name:saved.name})
  await attacker.wait((_,last)=>last?.type==='wolf_error')
  assert.equal(attacker.state,null)
  const rejoined=await client(t)
  rejoined.send({type:'wolf_join',code:host.state.code,name:saved.name,reconnectToken:saved.reconnectToken})
  await rejoined.wait(s=>s?.you.id===saved.id)
  assert.equal(rejoined.state.you.role,saved.role)
  await delay(350)
  peers[1]=rejoined
  await night(peers,{witch:'save'})
  assert.equal(rejoined.state.you.alive,true)
})
test('disconnected voter forfeits and the remaining votes finish the day',async t=>{
  const peers=await wolfGame(t)
  await night(peers,{witch:'save'})
  const absent=peers.find(p=>p.state.you.role==='villager')
  const host=peers[0]===absent?peers[1]:peers[0],round=host.state.round
  const connected=peers.filter(p=>p!==absent)
  absent.ws.close()
  await host.wait(s=>!s.players.find(p=>p.id===absent.state.you.id).connected)
  const wolf=connected.find(p=>p.state.you.role==='wolf')
  for(const p of connected)p.send({type:'wolf_vote',target:p===wolf?connected.find(q=>q!==p).state.you.id:wolf.state.you.id})
  await host.wait(s=>s.status==='finished'||s.round!==round)
  assert.equal(host.state.players.find(p=>p.id===absent.state.you.id).alive,false)
  assert.equal(host.state.status,'finished')
})
for(const potion of ['save','poison'])test(`Witch ${potion} potion resets when the room starts a new game`,async t=>{
  const peers=await wolfGame(t),host=peers[0]
  const poisonTarget=peers.filter(p=>p.state.you.role==='villager')[1].state.you.id
  await night(peers,{witch:potion==='save'?'save':poisonTarget})
  const wolf=peers.find(p=>p.state.you.role==='wolf')
  await voteOut(peers,wolf.state.you.id)
  assert.equal(host.state.status,'finished')
  host.send({type:'wolf_start'})
  await Promise.all(peers.map(p=>p.wait(s=>s.status==='playing')))
  const witch=peers.find(p=>p.state.you.role==='witch')
  await night(peers,{witch:'save'})
  assert.equal(witch.state.you.canPoison,true)
  assert.equal(host.state.players.every(p=>p.alive),true)
})
for(const cause of ['night','vote'])test(`Hunter can shoot once after ${cause} elimination`,async t=>{
  const peers=await wolfGame(t,10),host=peers[0],hunter=peers.find(p=>p.state.you.role==='hunter')
  if(cause==='night')await night(peers,{victim:hunter.state.you.id})
  else {await night(peers,{witch:'save'});await voteOut(peers,hunter.state.you.id)}
  assert.equal(hunter.state.you.alive,false)
  assert.equal(hunter.state.you.canAct,true)
  const victim=peers.find(p=>p.state.you.alive&&p.state.you.role==='wolf'),id=victim.state.you.id
  hunter.send({type:'wolf_shot',target:id})
  await host.wait(s=>s.phase!=='hunter')
  assert.equal(host.state.players.find(p=>p.id===id).alive,false)
  const remaining=host.state.players.filter(p=>p.alive).length
  hunter.send({type:'wolf_shot',target:host.state.players.find(p=>p.alive).id})
  // A new connection proves the server processed commands without a second shot.
  const probe=await client(t);probe.send({type:'wolf_join',code:host.state.code,name:'Late arrival'})
  await probe.wait((_,last)=>last?.type==='wolf_error')
  assert.equal(host.state.players.filter(p=>p.alive).length,remaining)
})
test('Hunter shot times out without blocking the next phase',async t=>{
  const peers=await wolfGame(t,10),host=peers[0],hunter=peers.find(p=>p.state.you.role==='hunter')
  await night(peers,{victim:hunter.state.you.id})
  await host.wait(s=>s.phase==='day')
  assert.equal(host.state.you.canAct,host.state.you.alive)
})

async function iqLobby(t,count=2,questionCount=5){
  const peers=[await client(t)],host=peers[0]
  host.send({type:'iq_create',name:'IQ 0',questionCount})
  await host.wait(s=>s?.type==='iq_state')
  for(let i=1;i<count;i++){
    const peer=await client(t);peers.push(peer)
    peer.send({type:'iq_join',code:host.state.code,name:`IQ ${i}`})
    await peer.wait(s=>s?.type==='iq_state')
  }
  await host.wait(s=>s.players.length===count)
  return peers
}
async function startIq(peers){
  peers[0].send({type:'iq_start'})
  await Promise.all(peers.map(p=>p.wait(s=>s.phase==='question')))
}
const {IQ_QUESTIONS}=await import('../src/iq.js')
const correctIq=state=>{const original=IQ_QUESTIONS.find(q=>q.question===state.question.question);return state.question.answers.indexOf(original.answers[original.correct])}

test('IQ validates names, question counts, duplicate names and room capacity',async t=>{
  const invalid=await client(t)
  for(const payload of [{name:''},{name:{}},{name:'Name',questionCount:3},{name:'Name',questionCount:'5'},{name:'Name',subject:'Logic'},{name:'Name',subject:{}},{name:'Name',subject:null},{name:'Name',field:'culture'},{name:'Name',field:[]}]){
    invalid.last=null;invalid.send({type:'iq_create',...payload})
    await invalid.wait((_,last)=>last?.type==='iq_error')
    assert.equal(invalid.state,null)
  }
  const peers=await iqLobby(t,6,10),host=peers[0],extra=await client(t)
  extra.send({type:'iq_join',code:host.state.code,name:'IQ 0'})
  await extra.wait((_,last)=>last?.type==='iq_error')
  extra.last=null;extra.send({type:'iq_join',code:host.state.code,name:'Seventh'})
  await extra.wait((_,last)=>last?.type==='iq_error')
  assert.equal(host.state.players.length,6)
  assert.equal(host.state.questionCount,10)
})
test('IQ requires two players and restricts starting to the host',async t=>{
  const peers=await iqLobby(t,1),host=peers[0]
  host.send({type:'iq_start'});await host.wait((_,last)=>last?.type==='iq_error')
  const guest=await client(t)
  guest.send({type:'iq_join',code:host.state.code,name:'Guest'});await guest.wait(s=>s?.phase==='lobby')
  guest.send({type:'iq_start'})
  guest.send({type:'iq_join',code:host.state.code,name:'Guest'})
  await guest.wait((_,last)=>last?.type==='iq_error')
  assert.equal(guest.state.phase,'lobby')
  await startIq([host,guest])
})
test('IQ synchronizes questions, hides answers, rejects invalid and duplicate submissions, and scores on the server',async t=>{
  const peers=await iqLobby(t),[host,guest]=peers
  await startIq(peers)
  assert.deepEqual(host.state.question,guest.state.question)
  assert.equal('correct'in host.state.question,false)
  assert.equal('explanation'in host.state.question,false)
  const id=host.state.question.id,correct=correctIq(host.state)
  for(const answer of [null,-1,4,'1',{},0.5]){
    host.last=null;host.send({type:'iq_answer',questionId:id,answer})
    await host.wait((_,last)=>last?.type==='iq_error')
  }
  host.send({type:'iq_answer',questionId:id,answer:(correct+1)%4,score:999999,timeLeft:999999})
  await guest.wait(s=>s.players.find(p=>p.id===host.state.you.id).hasAnswered)
  assert.equal(guest.state.players[0].score,0)
  assert.equal('answer'in guest.state.players[0],false)
  assert.equal('reconnectToken'in guest.state.players[0],false)
  host.send({type:'iq_answer',questionId:id,answer:correct})
  guest.send({type:'iq_answer',questionId:id,answer:correct})
  await Promise.all(peers.map(p=>p.wait(s=>s.phase==='reveal')))
  assert.equal(host.state.players[0].score,0)
  assert.ok(host.state.players[1].score>=100&&host.state.players[1].score<=200)
  assert.equal(host.state.question.correct,correct)
  const previous=structuredClone(host.state.players)
  guest.send({type:'iq_next',questionId:id})
  guest.send({type:'iq_answer',questionId:id,answer:correct})
  guest.send({type:'iq_join',code:host.state.code,name:'Guest'})
  await guest.wait((_,last)=>last?.type==='iq_error')
  assert.equal(guest.state.phase,'reveal')
  assert.deepEqual(guest.state.players,previous)
  host.send({type:'iq_next',questionId:id})
  await Promise.all(peers.map(p=>p.wait(s=>s.index===1&&s.phase==='question')))
  host.send({type:'iq_answer',questionId:id,answer:correct})
  host.send({type:'iq_join',code:host.state.code,name:'IQ 0'})
  await host.wait((_,last)=>last?.type==='iq_error')
  assert.equal(host.state.you.answer,null)
})
test('IQ timeout reveals unanswered questions and late submissions cannot change scores',async t=>{
  const peers=await iqLobby(t),[host,guest]=peers
  await startIq(peers)
  const id=host.state.question.id
  await host.wait(s=>s.phase==='reveal')
  assert.ok(host.state.players.every(p=>p.answer===null&&p.score===0))
  guest.send({type:'iq_answer',questionId:id,answer:correctIq(host.state)})
  guest.send({type:'iq_join',code:host.state.code,name:'IQ 1'})
  await guest.wait((_,last)=>last?.type==='iq_error')
  assert.ok(guest.state.players.every(p=>p.score===0))
})
test('IQ completes all questions and replay resets scores with new question ids',async t=>{
  const peers=await iqLobby(t),host=peers[0],seen=new Set()
  await startIq(peers)
  const firstId=host.state.question.id
  for(let index=0;index<5;index++){
    assert.equal(seen.has(host.state.question.question),false);seen.add(host.state.question.question)
    const id=host.state.question.id
    for(const p of peers)p.send({type:'iq_answer',questionId:id,answer:correctIq(host.state)})
    await Promise.all(peers.map(p=>p.wait(s=>s.phase==='reveal'&&s.index===index)))
    assert.ok(host.state.players.every(p=>p.correct===index+1&&p.score>=100*(index+1)&&p.score<=200*(index+1)))
    host.send({type:'iq_next',questionId:id})
    await Promise.all(peers.map(p=>p.wait(s=>index===4?s.phase==='finished':s.phase==='question'&&s.index===index+1)))
  }
  await startIq(peers)
  assert.notEqual(host.state.question.id,firstId)
  assert.equal(seen.has(host.state.question.question),false)
  assert.ok(host.state.players.every(p=>p.score===0&&p.correct===0&&!p.hasAnswered))
})
test('IQ reconnect uses a private token and host departure does not block the question',async t=>{
  const peers=await iqLobby(t),[host,guest]=peers
  await startIq(peers)
  const saved=host.state.you,code=host.state.code
  host.ws.close();await guest.wait(s=>s.you.host)
  const attacker=await client(t)
  attacker.send({type:'iq_join',code,name:saved.name})
  await attacker.wait((_,last)=>last?.type==='iq_error')
  const restored=await client(t)
  restored.send({type:'iq_join',code,name:saved.name,reconnectToken:saved.reconnectToken})
  await restored.wait(s=>s?.you.id===saved.id)
  assert.equal(restored.state.you.host,false)
  assert.equal(restored.state.question.id,guest.state.question.id)
  const id=guest.state.question.id
  restored.ws.close();await guest.wait(s=>!s.players.find(p=>p.id===saved.id).connected)
  guest.send({type:'iq_answer',questionId:id,answer:correctIq(guest.state)})
  await guest.wait(s=>s.phase==='reveal')
  guest.send({type:'iq_next',questionId:id});await guest.wait(s=>s.phase==='question'&&s.index===1)
})
test('IQ closes rooms and clears abandoned rooms',async t=>{
  const [host,guest]=await iqLobby(t),code=host.state.code
  host.send({type:'iq_end'});await guest.wait((_,last)=>last?.type==='iq_closed')
  const probe=await client(t)
  probe.send({type:'iq_join',code,name:'Probe'});await probe.wait((_,last)=>last?.type==='iq_error')
  const [alone]=await iqLobby(t,1),abandoned=alone.state.code
  alone.ws.close();await once(alone.ws,'close')
  probe.last=null;probe.send({type:'iq_join',code:abandoned,name:'Probe'})
  await probe.wait((_,last)=>last?.type==='iq_error')
})

test('IQ combines player histories and avoids them when starting a new room',async t=>{
  const host=await client(t),guest=await client(t)
  const hostSeen=IQ_QUESTIONS.slice(0,55).map(q=>q.id),guestSeen=IQ_QUESTIONS.slice(55,110).map(q=>q.id)
  host.send({type:'iq_create',name:'Returning host',questionCount:5,seenQuestions:hostSeen})
  await host.wait(s=>s?.type==='iq_state')
  guest.send({type:'iq_join',code:host.state.code,name:'Returning guest',seenQuestions:guestSeen})
  await guest.wait(s=>s?.type==='iq_state')
  await startIq([host,guest])
  const seen=new Set([...hostSeen,...guestSeen])
  for(let index=0;index<5;index++){
    assert.equal(seen.has(host.state.question.key),false)
    seen.add(host.state.question.key)
    for(const peer of [host,guest])peer.send({type:'iq_answer',questionId:host.state.question.id,answer:correctIq(host.state)})
    await host.wait(s=>s.phase==='reveal'&&s.index===index)
    host.send({type:'iq_next',questionId:host.state.question.id})
    await Promise.all([host,guest].map(p=>p.wait(s=>index===4?s.phase==='finished':s.phase==='question'&&s.index===index+1)))
  }
})
test('IQ accepts a full bank history and malformed history cannot crash room creation',async t=>{
  for(const history of [IQ_QUESTIONS.map(q=>q.id),{toString:1},[{},null,100,'unknown']]){
    const host=await client(t)
    host.send({type:'iq_create',name:'History check',seenQuestions:history})
    await host.wait(s=>s?.phase==='lobby')
  }
})


test('IQ fixes the selected school subject for everyone and keeps it on replay',async t=>{
  const host=await client(t),guest=await client(t)
  host.send({type:'iq_create',name:'Physics host',field:'school',subject:'Vật lý',questionCount:5,seenQuestions:IQ_QUESTIONS.map(q=>q.id)})
  await host.wait(s=>s?.phase==='lobby')
  assert.equal(host.state.subject,'Vật lý')
  assert.equal(host.state.field,'school')
  guest.send({type:'iq_join',code:host.state.code,name:'Guest',subject:'Hóa học'})
  await guest.wait(s=>s?.phase==='lobby')
  assert.equal(guest.state.subject,'Vật lý')
  await startIq([host,guest])
  for(let index=0;index<5;index++){
    assert.equal(host.state.question.category,'Vật lý')
    for(const peer of [host,guest])peer.send({type:'iq_answer',questionId:host.state.question.id,answer:correctIq(host.state)})
    await Promise.all([host,guest].map(peer=>peer.wait(s=>s.phase==='reveal'&&s.index===index)))
    host.send({type:'iq_next',questionId:host.state.question.id})
    await Promise.all([host,guest].map(peer=>peer.wait(s=>index===4?s.phase==='finished':s.phase==='question'&&s.index===index+1)))
  }
  await startIq([host,guest])
  assert.equal(host.state.subject,'Vật lý')
  assert.equal(guest.state.question.category,'Vật lý')
})
