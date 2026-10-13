import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, WebSocket } from 'ws'
import { BLACK, RED, applyMove, initialBoard, legalMoves, notation, other } from './src/engine.js'

const root=path.dirname(fileURLToPath(import.meta.url))
const dist=path.join(root,'dist')
const port=Number(process.env.PORT)||8080
const rooms=new Map()
const wolfRooms=new Map()
const clients=new WeakMap()
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}

const server=http.createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)
    if (pathname==='/health') {
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'})
      return res.end(JSON.stringify({status:'ok',service:'doan-dai-hiep'}))
    }
    let file=path.resolve(dist,`.${pathname}`)
    if (!file.startsWith(dist)) throw new Error('Invalid path')
    try { if ((await stat(file)).isDirectory()) file=path.join(file,'index.html') } catch { file=path.join(dist,'index.html') }
    const data=await readFile(file)
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':file.endsWith('.html')?'no-cache':'public, max-age=31536000, immutable'})
    res.end(data)
  } catch { res.writeHead(404); res.end('Not found') }
})

const wss=new WebSocketServer({server})
wss.on('connection',socket=>{
  socket.isAlive=true
  socket.on('pong',()=>{socket.isAlive=true})
  socket.on('message',raw=>{
    let data
    try { data=JSON.parse(raw) } catch { return send(socket,{type:'error',message:'Dữ liệu không hợp lệ'}) }
    if (data.type==='create') return createRoom(socket)
    if (data.type==='join') return joinRoom(socket,String(data.code||'').toUpperCase().trim())
    if (data.type==='wolf_create') return createWolfRoom(socket,data.name)
    if (data.type==='wolf_join') return joinWolfRoom(socket,String(data.code||'').toUpperCase().trim(),data.name)
    if (data.type==='wolf_start') return startWolfGame(socket)
    if (data.type==='wolf_action') return wolfAction(socket,data.target)
    if (data.type==='wolf_vote') return wolfVote(socket,data.target)
    const meta=clients.get(socket), room=meta&&rooms.get(meta.code)
    if (!room) return send(socket,{type:'error',message:'Phòng không còn tồn tại'})
    if (data.type==='move') playMove(socket,room,data.move)
    if (data.type==='reset') resetRoom(room)
  })
  socket.on('close',()=>leaveRoom(socket))
})

function createRoom(socket) {
  leaveRoom(socket)
  let code
  do { code=randomCode() } while (rooms.has(code))
  const room={code,board:initialBoard(),turn:RED,history:[],winner:null,red:socket,black:null}
  rooms.set(code,room); clients.set(socket,{game:'xiangqi',code,color:RED}); broadcast(room)
}

function joinRoom(socket,code) {
  const room=rooms.get(code)
  if (!room) return send(socket,{type:'error',message:'Không tìm thấy phòng này'})
  if (room.black) return send(socket,{type:'error',message:'Phòng đã đủ hai người'})
  leaveRoom(socket); room.black=socket; clients.set(socket,{game:'xiangqi',code,color:BLACK}); broadcast(room)
}

function playMove(socket,room,input) {
  const meta=clients.get(socket)
  if (!room.red||!room.black||room.winner||meta.color!==room.turn) return
  const move=legalMoves(room.board,room.turn).find(m=>m.from.x===input?.from?.x&&m.from.y===input?.from?.y&&m.to.x===input?.to?.x&&m.to.y===input?.to?.y)
  if (!move) return send(socket,{type:'error',message:'Nước đi không hợp lệ'})
  const text=notation(room.board,move), color=room.turn
  room.board=applyMove(room.board,move)
  room.history.push({text,color,move})
  room.turn=other(room.turn)
  if (!legalMoves(room.board,room.turn).length) room.winner=color
  broadcast(room)
}

function resetRoom(room) {
  room.board=initialBoard(); room.turn=RED; room.history=[]; room.winner=null; broadcast(room)
}

function leaveRoom(socket) {
  const meta=clients.get(socket)
  if (!meta) return
  if (meta.game==='wolf') return leaveWolfRoom(socket,meta)
  const room=rooms.get(meta.code); clients.delete(socket)
  if (!room) return
  const opponent=meta.color===RED?room.black:room.red
  if (opponent?.readyState===WebSocket.OPEN) send(opponent,{type:'opponent_left',message:'Đối thủ đã rời phòng'})
  rooms.delete(meta.code)
}

function broadcast(room) {
  for (const [socket,color] of [[room.red,RED],[room.black,BLACK]]) if (socket?.readyState===WebSocket.OPEN) {
    send(socket,{type:'state',code:room.code,color,status:room.red&&room.black?'playing':'waiting',board:room.board,turn:room.turn,history:room.history,winner:room.winner})
  }
}
function send(socket,data) { if (socket.readyState===WebSocket.OPEN) socket.send(JSON.stringify(data)) }
function randomCode() { return Array.from({length:6},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join('') }

const WOLF_STEPS=['guard','wolf','seer','witch']
const WOLF_NARRATION={
  guard:'Bóng tối phủ xuống. Bảo Vệ hãy chọn người bạn muốn che chở.',
  wolf:'Tiếng tru vọng từ khu rừng. Ma Sói hãy cùng chọn con mồi.',
  seer:'Tiên Tri mở mắt. Hãy soi một người để biết phe của họ.',
  witch:'Phù Thủy thức giấc và đưa ra quyết định trước bình minh.',
}

function cleanName(value) { return String(value||'').trim().replace(/\s+/g,' ').slice(0,20) }
function createWolfRoom(socket,nameValue) {
  const name=cleanName(nameValue)
  if (!name) return send(socket,{type:'wolf_error',message:'Hãy nhập tên của bạn'})
  leaveRoom(socket)
  let code
  do { code=randomCode() } while (rooms.has(code)||wolfRooms.has(code))
  const player={id:randomUUID(),name,socket,connected:true,host:true,alive:true,role:null,vote:null,privateMessage:''}
  const room={code,status:'lobby',players:[player],phase:'lobby',round:0,step:null,winner:null,narration:'Phòng đã sẵn sàng. Hãy mời mọi người tham gia.',actions:new Map(),log:[],guardTarget:null,wolfTarget:null,witchSaveUsed:false,witchPoisonUsed:false}
  wolfRooms.set(code,room);clients.set(socket,{game:'wolf',code,id:player.id});broadcastWolf(room)
}
function joinWolfRoom(socket,code,nameValue) {
  const room=wolfRooms.get(code),name=cleanName(nameValue)
  if (!room) return send(socket,{type:'wolf_error',message:'Không tìm thấy phòng này'})
  if (!name) return send(socket,{type:'wolf_error',message:'Hãy nhập tên của bạn'})
  let player=room.players.find(p=>p.name.toLocaleLowerCase('vi')===name.toLocaleLowerCase('vi')&&!p.connected)
  if (player) { player.socket=socket;player.connected=true }
  else {
    if (room.status!=='lobby') return send(socket,{type:'wolf_error',message:'Ván chơi đã bắt đầu'})
    if (room.players.length>=12) return send(socket,{type:'wolf_error',message:'Phòng đã đủ 12 người'})
    if (room.players.some(p=>p.name.toLocaleLowerCase('vi')===name.toLocaleLowerCase('vi'))) return send(socket,{type:'wolf_error',message:'Tên này đã có trong phòng'})
    player={id:randomUUID(),name,socket,connected:true,host:false,alive:true,role:null,vote:null,privateMessage:''};room.players.push(player)
  }
  leaveRoom(socket);player.socket=socket;player.connected=true;clients.set(socket,{game:'wolf',code,id:player.id});broadcastWolf(room)
}
function leaveWolfRoom(socket,meta) {
  clients.delete(socket)
  const room=wolfRooms.get(meta.code),player=room?.players.find(p=>p.id===meta.id)
  if (!room||!player) return
  player.connected=false;player.socket=null
  if (room.status==='lobby') room.players=room.players.filter(p=>p.id!==player.id)
  if (!room.players.some(p=>p.connected)) { wolfRooms.delete(room.code);return }
  if (player.host) {player.host=false;const next=room.players.find(p=>p.connected);if(next)next.host=true}
  broadcastWolf(room)
}
function wolfRoles(count) {
  const roles=['wolf','seer','guard']
  if(count>=7)roles.push('witch')
  if(count>=8)roles.push('wolf')
  if(count>=10)roles.push('hunter')
  if(count>=11)roles.push('wolf')
  while(roles.length<count)roles.push('villager')
  for(let i=roles.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[roles[i],roles[j]]=[roles[j],roles[i]]}
  return roles
}
function startWolfGame(socket) {
  const meta=clients.get(socket),room=meta&&wolfRooms.get(meta.code),player=room?.players.find(p=>p.id===meta.id)
  if (!room||!player?.host||!['lobby','finished'].includes(room.status)) return
  if (room.players.length<5) return send(socket,{type:'wolf_error',message:'Cần ít nhất 5 người để bắt đầu'})
  const roles=wolfRoles(room.players.length)
  room.players.forEach((p,i)=>{p.role=roles[i];p.alive=true;p.vote=null;p.privateMessage='';p.host=Boolean(p.host)})
  room.status='playing';room.round=1;room.winner=null;room.log=[];beginWolfNight(room)
}
function beginWolfNight(room) {
  room.phase='night';room.actions=new Map();room.guardTarget=null;room.wolfTarget=null
  room.players.forEach(p=>{p.vote=null;p.privateMessage=''})
  advanceWolfStep(room,-1)
}
function activeForStep(room,role) { return room.players.filter(p=>p.alive&&p.connected&&p.role===role) }
function advanceWolfStep(room,index) {
  for(let i=index+1;i<WOLF_STEPS.length;i++){
    const step=WOLF_STEPS[i],actors=activeForStep(room,step)
    if (!actors.length) continue
    if(step==='witch'){
      const witch=actors[0]
      if(room.witchSaveUsed&&room.witchPoisonUsed)continue
      witch.privateMessage=room.wolfTarget?`Sói đã chọn ${room.players.find(p=>p.id===room.wolfTarget)?.name}. Bạn có muốn dùng thuốc?`:'Đêm nay Sói không chọn được nạn nhân.'
    }
    room.step=step;room.actions=new Map();room.narration=WOLF_NARRATION[step];broadcastWolf(room);return
  }
  resolveWolfNight(room)
}
function wolfAction(socket,target) {
  const meta=clients.get(socket),room=meta&&wolfRooms.get(meta.code),player=room?.players.find(p=>p.id===meta.id)
  if (!room||room.status!=='playing'||room.phase!=='night'||!player?.alive||player.role!==room.step) return
  const validPlayer=room.players.some(p=>p.id===target&&p.alive)
  if (room.step!=='witch'&&!validPlayer) return
  if (room.step==='guard') room.guardTarget=target
  if (room.step==='wolf') {
    if(!validPlayer||room.players.find(p=>p.id===target)?.role==='wolf')return
    room.actions.set(player.id,target)
    if(room.actions.size<activeForStep(room,'wolf').length){broadcastWolf(room);return}
    const counts={};for(const id of room.actions.values())counts[id]=(counts[id]||0)+1
    room.wolfTarget=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||null
  }
  if (room.step==='seer') {
    const seen=room.players.find(p=>p.id===target)
    player.privateMessage=`${seen.name} thuộc phe ${seen.role==='wolf'?'Ma Sói':'Dân làng'}.`
  }
  if (room.step==='witch') {
    if(target==='save'&&!room.witchSaveUsed){room.wolfTarget=null;room.witchSaveUsed=true}
    else if(target==='skip'){}
    else if(validPlayer&&!room.witchPoisonUsed){room.actions.set('poison',target);room.witchPoisonUsed=true}
    else return
  }
  advanceWolfStep(room,WOLF_STEPS.indexOf(room.step))
}
function resolveWolfNight(room) {
  const deaths=[]
  if(room.wolfTarget&&room.wolfTarget!==room.guardTarget)deaths.push(room.wolfTarget)
  const poison=room.actions.get('poison');if(poison&&!deaths.includes(poison))deaths.push(poison)
  for(const id of deaths){const p=room.players.find(x=>x.id===id);if(p)p.alive=false}
  const names=deaths.map(id=>room.players.find(p=>p.id===id)?.name).filter(Boolean)
  room.log.unshift({round:room.round,phase:'night',text:names.length?`${names.join(' và ')} đã không qua khỏi đêm nay.`:'Một đêm bình yên, không ai bị loại.'})
  if(checkWolfWinner(room))return
  room.phase='day';room.step='vote';room.actions=new Map();room.players.forEach(p=>p.vote=null)
  room.narration=names.length?`Bình minh lên. ${names.join(' và ')} đã rời cuộc chơi.`:'Bình minh lên. Đêm qua không ai bị loại.';broadcastWolf(room)
}
function wolfVote(socket,target) {
  const meta=clients.get(socket),room=meta&&wolfRooms.get(meta.code),player=room?.players.find(p=>p.id===meta.id)
  if (!room||room.status!=='playing'||room.phase!=='day'||!player?.alive) return
  if(!room.players.some(p=>p.id===target&&p.alive)||target===player.id)return
  player.vote=target;room.actions.set(player.id,target)
  if(room.actions.size<room.players.filter(p=>p.alive&&p.connected).length){broadcastWolf(room);return}
  const counts={};for(const id of room.actions.values())counts[id]=(counts[id]||0)+1
  const ranked=Object.entries(counts).sort((a,b)=>b[1]-a[1]);let eliminated=null
  if(ranked[0]&&(!ranked[1]||ranked[0][1]>ranked[1][1]))eliminated=ranked[0][0]
  if(eliminated)room.players.find(p=>p.id===eliminated).alive=false
  const name=room.players.find(p=>p.id===eliminated)?.name
  room.log.unshift({round:room.round,phase:'day',text:name?`${name} bị cả làng biểu quyết loại.`:'Cuộc biểu quyết hòa, không ai bị loại.'})
  if(checkWolfWinner(room))return
  room.round++;beginWolfNight(room)
}
function checkWolfWinner(room) {
  const wolves=room.players.filter(p=>p.alive&&p.role==='wolf').length,others=room.players.filter(p=>p.alive&&p.role!=='wolf').length
  if(wolves>0&&wolves<others)return false
  room.winner=wolves===0?'Dân làng':'Ma Sói';room.status='finished';room.phase='finished';room.step=null;room.narration=`Phe ${room.winner} đã chiến thắng!`;broadcastWolf(room);return true
}
function broadcastWolf(room) {
  for(const player of room.players)if(player.socket?.readyState===WebSocket.OPEN){
    const canAct=room.status==='playing'&&player.alive&&((room.phase==='night'&&player.role===room.step)||(room.phase==='day'&&!player.vote))
    send(player.socket,{type:'wolf_state',code:room.code,status:room.status,phase:room.phase,round:room.round,step:room.step,winner:room.winner,narration:room.narration,log:room.log.slice(0,6),you:{id:player.id,name:player.name,role:room.status==='lobby'?null:player.role,alive:player.alive,host:player.host,privateMessage:player.privateMessage,canAct,hasVoted:Boolean(player.vote),wolfIds:player.role==='wolf'?room.players.filter(p=>p.role==='wolf').map(p=>p.id):[],canSave:player.role==='witch'&&!room.witchSaveUsed&&Boolean(room.wolfTarget),canPoison:player.role==='witch'&&!room.witchPoisonUsed,wolfVictim:player.role==='witch'&&room.wolfTarget?room.players.find(p=>p.id===room.wolfTarget)?.name:null},players:room.players.map(p=>({id:p.id,name:p.name,alive:p.alive,connected:p.connected,host:p.host,voteDone:Boolean(p.vote)}))})
  }
}

const heartbeat=setInterval(()=>{
  for(const socket of wss.clients){
    if(socket.isAlive===false){socket.terminate();continue}
    socket.isAlive=false;socket.ping()
  }
},30000)

server.listen(port,'0.0.0.0',()=>console.log(`Doan Dai Hiep server: http://0.0.0.0:${port}`))
server.on('close',()=>clearInterval(heartbeat))
process.on('SIGTERM',()=>server.close(()=>process.exit(0)))
