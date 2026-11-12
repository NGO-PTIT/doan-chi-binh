import { selectIqQuestions, mergeIqHistory, IQ_CATEGORIES } from './src/iq.js'
import http from 'node:http'
import { randomUUID, randomInt } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, WebSocket } from 'ws'
import { BLACK, RED, applyMove, initialBoard, legalMoves, notation, other } from './src/engine.js'
import { BOARD_SIZE, EMPTY, X_PLAYER, O_PLAYER, createEmptyBoard, checkWinner, isBoardFull } from './src/caro.js'

const root=path.dirname(fileURLToPath(import.meta.url))
const dist=path.join(root,'dist')
const port=Number(process.env.PORT ?? 8080)
const wolfTurnMs=Math.max(100,Number(process.env.WOLF_TURN_MS)||60000)
const wolfReconnectMs=Math.max(100,Number(process.env.WOLF_RECONNECT_MS)||60000)
const rooms=new Map()
const caroRooms=new Map()
const wolfRooms=new Map()
const iqRooms=new Map()
const iqTurnMs=Math.max(100,Number(process.env.IQ_TURN_MS)||20000)
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
    if (file!==dist&&!file.startsWith(dist+path.sep)) throw new Error('Invalid path')
    try { if ((await stat(file)).isDirectory()) file=path.join(file,'index.html') } catch { file=path.join(dist,'index.html') }
    const data=await readFile(file)
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':file.endsWith('.html')?'no-cache':'public, max-age=31536000, immutable'})
    res.end(data)
  } catch { res.writeHead(404); res.end('Not found') }
})

const wss=new WebSocketServer({server,maxPayload:16*1024})
wss.on('connection',socket=>{
  socket.isAlive=true
  socket.on('error',()=>socket.terminate())
  socket.on('pong',()=>{socket.isAlive=true})
  socket.on('message',raw=>{
    let data
    try { data=JSON.parse(raw) } catch { return send(socket,{type:'error',message:'Dữ liệu không hợp lệ'}) }
    if (!data||typeof data!=='object'||Array.isArray(data)||typeof data.type!=='string') return send(socket,{type:'error',message:'Dữ liệu không hợp lệ'})
    if (data.type==='iq_create') return createIqRoom(socket,data.name,data.questionCount,data.seenQuestions,data.subject,data.field)
    if (data.type==='iq_join') return joinIqRoom(socket,typeof data.code==='string'?data.code.toUpperCase().trim():'',data.name,data.reconnectToken,data.seenQuestions)
    if (data.type==='iq_start') return startIqGame(socket)
    if (data.type==='iq_answer') return answerIq(socket,data.questionId,data.answer)
    if (data.type==='iq_next') return nextIqQuestion(socket,data.questionId)
    if (data.type==='iq_end') return endIqRoom(socket)
    if (data.type==='create') return createRoom(socket)
    if (data.type==='join') return joinRoom(socket,(typeof data.code==='string'?data.code.toUpperCase().trim():''))
    if (data.type==='caro_create') return createCaroRoom(socket)
    if (data.type==='caro_join') return joinCaroRoom(socket,(typeof data.code==='string'?data.code.toUpperCase().trim():''))
    if (data.type==='caro_move') return caroMove(socket,data.row,data.col)
    if (data.type==='caro_reset') return resetCaroRoom(socket)
    if (data.type==='wolf_create') return createWolfRoom(socket,data.name)
    if (data.type==='wolf_join') return joinWolfRoom(socket,(typeof data.code==='string'?data.code.toUpperCase().trim():''),data.name,data.reconnectToken)
    if (data.type==='wolf_start') return startWolfGame(socket)
    if (data.type==='wolf_end') return endWolfRoom(socket)
    if (data.type==='wolf_action') return wolfAction(socket,data.target)
    if (data.type==='wolf_shot') return wolfShot(socket,data.target)
    if (data.type==='wolf_vote') return wolfVote(socket,data.target)
    const meta=clients.get(socket), room=meta?.game==='xiangqi'&&rooms.get(meta.code)
    if (!room) return send(socket,{type:'error',message:'Phòng không còn tồn tại'})
    if (data.type==='move') playMove(socket,room,data.move)
    if (data.type==='reset') resetRoom(room)
  })
  socket.on('close',()=>leaveRoom(socket))
})

function createRoom(socket) {
  leaveRoom(socket)
  let code
  do { code=randomCode() } while (rooms.has(code)||caroRooms.has(code)||wolfRooms.has(code)||iqRooms.has(code))
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
  if (meta.game==='iq') return leaveIqRoom(socket,meta)
  if (meta.game==='wolf') return leaveWolfRoom(socket,meta)
  if (meta.game==='caro') return leaveCaroRoom(socket,meta)
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

// Caro Room Management
function createCaroRoom(socket) {
  leaveRoom(socket)
  let code
  do { code=randomCode() } while (rooms.has(code)||caroRooms.has(code)||wolfRooms.has(code)||iqRooms.has(code))
  const room={code,board:createEmptyBoard(),currentPlayer:X_PLAYER,history:[],winner:null,xPlayer:socket,oPlayer:null}
  caroRooms.set(code,room)
  clients.set(socket,{game:'caro',code,player:X_PLAYER})
  broadcastCaro(room)
}

function joinCaroRoom(socket,code) {
  const room=caroRooms.get(code)
  if (!room) return send(socket,{type:'caro_error',message:'Không tìm thấy phòng này'})
  if (room.oPlayer) return send(socket,{type:'caro_error',message:'Phòng đã đủ hai người'})
  leaveRoom(socket)
  room.oPlayer=socket
  clients.set(socket,{game:'caro',code,player:O_PLAYER})
  broadcastCaro(room)
}

function caroMove(socket,row,col) {
  const meta=clients.get(socket)
  if (!meta||meta.game!=='caro') return
  const room=caroRooms.get(meta.code)
  if (!room||!room.xPlayer||!room.oPlayer||room.winner) return
  if (meta.player!==room.currentPlayer) return
  if (!Number.isInteger(row)||!Number.isInteger(col)||row<0||row>=BOARD_SIZE||col<0||col>=BOARD_SIZE||room.board[row][col]!==EMPTY) {
    return send(socket,{type:'caro_error',message:'Nước đi không hợp lệ'})
  }

  const newBoard=room.board.map(r=>[...r])
  newBoard[row][col]=room.currentPlayer
  room.board=newBoard
  room.history.push({row,col,player:room.currentPlayer})

  if (checkWinner(room.board,row,col,room.currentPlayer)) {
    room.winner=room.currentPlayer
  } else if (isBoardFull(room.board)) {
    room.winner='draw'
  } else {
    room.currentPlayer=room.currentPlayer===X_PLAYER?O_PLAYER:X_PLAYER
  }

  broadcastCaro(room)
}

function resetCaroRoom(socket) {
  const meta=clients.get(socket)
  if (!meta||meta.game!=='caro') return
  const room=caroRooms.get(meta.code)
  if (!room) return
  room.board=createEmptyBoard()
  room.currentPlayer=X_PLAYER
  room.history=[]
  room.winner=null
  broadcastCaro(room)
}

function leaveCaroRoom(socket,meta) {
  const room=caroRooms.get(meta.code)
  clients.delete(socket)
  if (!room) return
  const opponent=meta.player===X_PLAYER?room.oPlayer:room.xPlayer
  if (opponent?.readyState===WebSocket.OPEN) {
    send(opponent,{type:'caro_opponent_left',message:'Đối thủ đã rời phòng'})
  }
  caroRooms.delete(meta.code)
}

function broadcastCaro(room) {
  for (const [socket,player] of [[room.xPlayer,X_PLAYER],[room.oPlayer,O_PLAYER]]) {
    if (socket?.readyState===WebSocket.OPEN) {
      send(socket,{
        type:'caro_state',
        code:room.code,
        player,
        status:room.xPlayer&&room.oPlayer?'playing':'waiting',
        board:room.board,
        currentPlayer:room.currentPlayer,
        history:room.history,
        winner:room.winner
      })
    }
  }
}

function send(socket,data) { if (socket.readyState===WebSocket.OPEN) socket.send(JSON.stringify(data)) }
function randomCode() { return Array.from({length:6},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join('') }

const WOLF_STEPS=['guard','wolf','seer','witch']
const WOLF_NARRATION={
  guard:'Bóng tối phủ xuống. Bảo Vệ hãy chọn người bạn muốn che chở.',
  wolf:'Tiếng tru vọng từ khu rừng. Ma Sói hãy cùng chọn con mồi.',
  seer:'Tiên Tri mở mắt. Hãy soi một người để biết phe của họ.',
  witch:'Phù Thủy thức giấc và đưa ra quyết định trước bình minh.',
}

function cleanName(value) { return (typeof value==='string'?value:'').trim().replace(/\s+/g,' ').slice(0,20) }
function createWolfRoom(socket,nameValue) {
  const name=cleanName(nameValue)
  if (!name) return send(socket,{type:'wolf_error',message:'Hãy nhập tên của bạn'})
  leaveRoom(socket)
  let code
  do { code=randomCode() } while (rooms.has(code)||caroRooms.has(code)||wolfRooms.has(code)||iqRooms.has(code))
  const player={id:randomUUID(),reconnectToken:randomUUID(),name,socket,connected:true,host:true,alive:true,role:null,vote:null,privateMessage:''}
  const room={code,status:'lobby',players:[player],phase:'lobby',round:0,step:null,winner:null,narration:'Phòng đã sẵn sàng. Hãy mời mọi người tham gia.',actions:new Map(),log:[],guardTarget:null,wolfTarget:null,witchSaveUsed:false,witchPoisonUsed:false}
  wolfRooms.set(code,room);clients.set(socket,{game:'wolf',code,id:player.id});broadcastWolf(room)
}
function joinWolfRoom(socket,code,nameValue,reconnectToken) {
  const room=wolfRooms.get(code),name=cleanName(nameValue)
  if (!room) return send(socket,{type:'wolf_error',message:'Không tìm thấy phòng này'})
  if (!name) return send(socket,{type:'wolf_error',message:'Hãy nhập tên của bạn'})
  if (clients.get(socket)?.code===code) return send(socket,{type:'wolf_error',message:'Bạn đã ở trong phòng này'})
  let player=room.players.find(p=>p.name.toLocaleLowerCase('vi')===name.toLocaleLowerCase('vi'))
  if (player) {
    if (player.connected||typeof reconnectToken!=='string'||reconnectToken!==player.reconnectToken) return send(socket,{type:'wolf_error',message:'Tên đã được sử dụng hoặc phiên kết nối không hợp lệ'})
    clearTimeout(player.reconnectTimer)
  } else {
    if (room.status!=='lobby') return send(socket,{type:'wolf_error',message:'Ván chơi đã bắt đầu'})
    if (room.players.length>=12) return send(socket,{type:'wolf_error',message:'Phòng đã đủ 12 người'})
    player={id:randomUUID(),reconnectToken:randomUUID(),name,socket,connected:true,host:false,alive:true,role:null,vote:null,privateMessage:''}
    room.players.push(player)
  }
  leaveRoom(socket);player.socket=socket;player.connected=true;clients.set(socket,{game:'wolf',code,id:player.id});broadcastWolf(room)
}
function leaveWolfRoom(socket,meta) {
  clients.delete(socket)
  const room=wolfRooms.get(meta.code),player=room?.players.find(p=>p.id===meta.id)
  if (!room||!player) return
  player.connected=false;player.socket=null
  if (room.status==='lobby') room.players=room.players.filter(p=>p.id!==player.id)
  if (!room.players.some(p=>p.connected)) {
    clearWolfTimer(room);room.players.forEach(p=>clearTimeout(p.reconnectTimer));wolfRooms.delete(room.code);return
  }
  if (player.host) {player.host=false;room.players.find(p=>p.connected).host=true}
  if (room.status==='playing') player.reconnectTimer=setTimeout(()=>{
    if(player.connected||room.status!=='playing')return
    player.alive=false;player.vote=null;room.actions.delete(player.id)
    room.log.unshift({round:room.round,phase:room.phase,text:`${player.name} đã rời ván vì mất kết nối quá lâu.`})
    if(room.phase==='hunter'&&room.hunterId===player.id)return finishWolfShot(room,null)
    if(room.phase!=='hunter'&&checkWolfWinner(room))return
    if(room.phase==='day')resolveWolfVotes(room)
    else broadcastWolf(room)
  },wolfReconnectMs)
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
  const connected=room.players.filter(p=>p.connected)
  if (connected.length<5) return send(socket,{type:'wolf_error',message:'Cần ít nhất 5 người để bắt đầu'})
  room.players.forEach(p=>clearTimeout(p.reconnectTimer));room.players=connected
  room.witchSaveUsed=false;room.witchPoisonUsed=false;room.hunterId=null
  const roles=wolfRoles(room.players.length)
  room.players.forEach((p,i)=>{p.role=roles[i];p.alive=true;p.vote=null;p.privateMessage='';p.host=Boolean(p.host)})
  room.status='playing';room.round=1;room.winner=null;room.log=[];beginWolfNight(room)
}
function endWolfRoom(socket) {
  const meta=clients.get(socket),room=meta&&wolfRooms.get(meta.code),player=room?.players.find(p=>p.id===meta.id)
  if (!room||!player?.host) return send(socket,{type:'wolf_error',message:'Chỉ chủ phòng mới có thể kết thúc phòng'})
  clearWolfTimer(room);room.players.forEach(p=>clearTimeout(p.reconnectTimer))
  for(const member of room.players)if(member.socket?.readyState===WebSocket.OPEN){
    send(member.socket,{type:'wolf_closed',message:'Chủ phòng đã kết thúc phòng chơi.'})
    clients.delete(member.socket)
    setTimeout(()=>member.socket?.close(),50)
  }
  wolfRooms.delete(room.code)
}
function beginWolfNight(room) {
  clearWolfTimer(room)
  room.phase='night';room.actions=new Map();room.guardTarget=null;room.wolfTarget=null
  room.players.forEach(p=>{p.vote=null;p.privateMessage=''})
  advanceWolfStep(room,-1)
}
function activeForStep(room,role) { return room.players.filter(p=>p.alive&&p.role===role) }
function advanceWolfStep(room,index) {
  clearWolfTimer(room)
  for(let i=index+1;i<WOLF_STEPS.length;i++){
    const step=WOLF_STEPS[i],actors=activeForStep(room,step)
    if (!actors.length) continue
    if(step==='witch'){
      const witch=actors[0]
      if(room.witchSaveUsed&&room.witchPoisonUsed)continue
      witch.privateMessage=room.wolfTarget?`Sói đã chọn ${room.players.find(p=>p.id===room.wolfTarget)?.name}. Bạn có muốn dùng thuốc?`:'Đêm nay Sói không chọn được nạn nhân.'
    }
    room.step=step;room.actions=new Map();room.narration=WOLF_NARRATION[step];scheduleWolfTimer(room);broadcastWolf(room);return
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
function clearWolfTimer(room) {
  if(room.stepTimer)clearTimeout(room.stepTimer)
  room.stepTimer=null;room.deadline=null
}
function scheduleWolfTimer(room) {
  room.deadline=Date.now()+wolfTurnMs
  const expectedStep=room.step
  room.stepTimer=setTimeout(()=>{
    if(room.status!=='playing'||room.phase!=='night'||room.step!==expectedStep)return
    if(expectedStep==='wolf'){
      const counts={};for(const id of room.actions.values())counts[id]=(counts[id]||0)+1
      room.wolfTarget=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||null
    }
    room.narration=room.actions.size?'Luna AI đã ghi nhận các lựa chọn hợp lệ và chuyển lượt.':'Đã hết 60 giây. Luna AI tự động bỏ qua lượt này.'
    advanceWolfStep(room,WOLF_STEPS.indexOf(expectedStep))
  },wolfTurnMs)
}
function resolveWolfNight(room) {
  clearWolfTimer(room)
  const deaths=[]
  if(room.wolfTarget&&room.wolfTarget!==room.guardTarget)deaths.push(room.wolfTarget)
  const poison=room.actions.get('poison');if(poison&&!deaths.includes(poison))deaths.push(poison)
  for(const id of deaths){const p=room.players.find(x=>x.id===id);if(p)p.alive=false}
  const names=deaths.map(id=>room.players.find(p=>p.id===id)?.name).filter(Boolean)
  room.log.unshift({round:room.round,phase:'night',text:names.length?`${names.join(' và ')} đã không qua khỏi đêm nay.`:'Một đêm bình yên, không ai bị loại.'})
  room.nightDeaths=names
  if(beginWolfShot(room,deaths,'day'))return
  beginWolfDay(room,names)
}
function beginWolfDay(room,names=[]) {
  if(checkWolfWinner(room))return
  room.phase='day';room.step='vote';room.actions=new Map();room.players.forEach(p=>p.vote=null)
  room.narration=names.length?`Bình minh lên. ${names.join(' và ')} đã rời cuộc chơi.`:'Bình minh lên. Đêm qua không ai bị loại.';broadcastWolf(room)
}
function wolfVote(socket,target) {
  const meta=clients.get(socket),room=meta&&wolfRooms.get(meta.code),player=room?.players.find(p=>p.id===meta.id)
  if (!room||room.status!=='playing'||room.phase!=='day'||!player?.alive) return
  if(!room.players.some(p=>p.id===target&&p.alive)||target===player.id)return
  player.vote=target;room.actions.set(player.id,target)
  resolveWolfVotes(room)
}
function resolveWolfVotes(room) {
  const voters=room.players.filter(p=>p.alive)
  if(voters.some(p=>!p.vote)){broadcastWolf(room);return}
  const counts={};for(const p of voters)if(voters.some(target=>target.id===p.vote))counts[p.vote]=(counts[p.vote]||0)+1
  const ranked=Object.entries(counts).sort((a,b)=>b[1]-a[1]);let eliminated=null
  if(ranked[0]&&(!ranked[1]||ranked[0][1]>ranked[1][1]))eliminated=ranked[0][0]
  if(eliminated)room.players.find(p=>p.id===eliminated).alive=false
  const name=room.players.find(p=>p.id===eliminated)?.name
  room.log.unshift({round:room.round,phase:'day',text:name?`${name} bị cả làng biểu quyết loại.`:'Cuộc biểu quyết hòa, không ai bị loại.'})
  if(beginWolfShot(room,[eliminated],'night'))return
  if(checkWolfWinner(room))return
  room.round++;beginWolfNight(room)
}
function beginWolfShot(room,deaths,nextPhase) {
  const hunter=room.players.find(p=>p.role==='hunter'&&deaths.includes(p.id))
  if(!hunter)return false
  clearWolfTimer(room)
  room.phase='hunter';room.step='hunter';room.hunterId=hunter.id;room.afterShot=nextPhase
  room.narration='Thợ Săn đã bị loại và có một phát bắn cuối cùng.'
  room.deadline=Date.now()+wolfTurnMs
  room.stepTimer=setTimeout(()=>finishWolfShot(room,null),wolfTurnMs)
  broadcastWolf(room);return true
}
function wolfShot(socket,target) {
  const meta=clients.get(socket),room=meta?.game==='wolf'&&wolfRooms.get(meta.code)
  if(!room||room.status!=='playing'||room.phase!=='hunter'||room.hunterId!==meta.id)return
  if(target!==null&&!room.players.some(p=>p.id===target&&p.alive))return
  finishWolfShot(room,target)
}
function finishWolfShot(room,target) {
  clearWolfTimer(room)
  if(target){
    const victim=room.players.find(p=>p.id===target);victim.alive=false
    room.log.unshift({round:room.round,phase:'hunter',text:`Thợ Săn đã bắn ${victim.name}.`})
  }
  room.hunterId=null
  if(checkWolfWinner(room))return
  if(room.afterShot==='day')beginWolfDay(room,room.nightDeaths)
  else {room.round++;beginWolfNight(room)}
}
function checkWolfWinner(room) {
  const wolves=room.players.filter(p=>p.alive&&p.role==='wolf').length,others=room.players.filter(p=>p.alive&&p.role!=='wolf').length
  if(wolves>0&&wolves<others)return false
  clearWolfTimer(room);room.winner=wolves===0?'Dân làng':'Ma Sói';room.status='finished';room.phase='finished';room.step=null;room.narration=`Phe ${room.winner} đã chiến thắng!`;broadcastWolf(room);return true
}
function broadcastWolf(room) {
  for(const player of room.players)if(player.socket?.readyState===WebSocket.OPEN){
    const canAct=room.status==='playing'&&((room.phase==='hunter'&&room.hunterId===player.id)||(player.alive&&((room.phase==='night'&&player.role===room.step)||(room.phase==='day'&&!player.vote))))
    send(player.socket,{type:'wolf_state',code:room.code,status:room.status,phase:room.phase,round:room.round,step:room.step,deadline:room.deadline||null,votesSubmitted:room.players.filter(p=>p.alive&&p.vote).length,votesRequired:room.players.filter(p=>p.alive).length,winner:room.winner,narration:room.narration,log:room.log.slice(0,6),you:{id:player.id,reconnectToken:player.reconnectToken,name:player.name,role:room.status==='lobby'?null:player.role,alive:player.alive,host:player.host,privateMessage:player.privateMessage,canAct,hasVoted:Boolean(player.vote),wolfIds:player.role==='wolf'?room.players.filter(p=>p.role==='wolf').map(p=>p.id):[],canSave:player.role==='witch'&&!room.witchSaveUsed&&Boolean(room.wolfTarget),canPoison:player.role==='witch'&&!room.witchPoisonUsed,wolfVictim:player.role==='witch'&&room.wolfTarget?room.players.find(p=>p.id===room.wolfTarget)?.name:null},players:room.players.map(p=>({id:p.id,name:p.name,alive:p.alive,connected:p.connected,host:p.host,voteDone:Boolean(p.vote)}))})
  }
}

function createIqRoom(socket,nameValue,questionCount=5,seenQuestions=[],subject='',field='school') {
  const name=cleanName(nameValue)
  if(!name)return send(socket,{type:'iq_error',message:'Hãy nhập tên của bạn'})
  if(![5,10,15].includes(questionCount))return send(socket,{type:'iq_error',message:'Chọn 5, 10 hoặc 15 câu'})
  if(field!=='school'||(subject!==''&&!IQ_CATEGORIES.includes(subject)))return send(socket,{type:'iq_error',message:'Lĩnh vực hoặc môn học không hợp lệ'})
  leaveRoom(socket)
  let code
  do {code=randomCode()}while(rooms.has(code)||caroRooms.has(code)||wolfRooms.has(code)||iqRooms.has(code))
  const player={id:randomUUID(),reconnectToken:randomUUID(),name,socket,connected:true,host:true,score:0,correct:0,answer:null,points:0}
  const room={code,phase:'lobby',players:[player],questionCount,subject,seenQuestions:mergeIqHistory([],seenQuestions),questions:[],index:0,deadline:null,timer:null}
  iqRooms.set(code,room);clients.set(socket,{game:'iq',code,id:player.id});broadcastIq(room)
}
function joinIqRoom(socket,code,nameValue,reconnectToken,seenQuestions=[]) {
  const room=iqRooms.get(code),name=cleanName(nameValue)
  if(!room)return send(socket,{type:'iq_error',message:'Không tìm thấy phòng này'})
  if(!name)return send(socket,{type:'iq_error',message:'Hãy nhập tên của bạn'})
  if(clients.get(socket)?.game==='iq'&&clients.get(socket).code===code)return send(socket,{type:'iq_error',message:'Bạn đã ở trong phòng này'})
  let player=room.players.find(p=>p.name.toLocaleLowerCase('vi')===name.toLocaleLowerCase('vi'))
  if(player){
    if(player.connected||typeof reconnectToken!=='string'||reconnectToken!==player.reconnectToken)return send(socket,{type:'iq_error',message:'Tên đã được sử dụng hoặc phiên kết nối không hợp lệ'})
  }else{
    if(room.phase!=='lobby')return send(socket,{type:'iq_error',message:'Ván chơi đã bắt đầu'})
    if(room.players.length>=6)return send(socket,{type:'iq_error',message:'Phòng đã đủ 6 người'})
    player={id:randomUUID(),reconnectToken:randomUUID(),name,socket,connected:true,host:false,score:0,correct:0,answer:null,points:0}
    room.players.push(player)
  }
  room.seenQuestions=mergeIqHistory(room.seenQuestions,seenQuestions)
  leaveRoom(socket);player.socket=socket;player.connected=true;clients.set(socket,{game:'iq',code,id:player.id});broadcastIq(room)
}
function startIqGame(socket) {
  const meta=clients.get(socket),room=meta?.game==='iq'&&iqRooms.get(meta.code),player=room?.players.find(p=>p.id===meta.id)
  if(!room||!player?.host||!['lobby','finished'].includes(room.phase))return
  const connected=room.players.filter(p=>p.connected)
  if(connected.length<2)return send(socket,{type:'iq_error',message:'Cần ít nhất 2 người để bắt đầu'})
  room.players=connected
  room.questions=selectIqQuestions(room.questionCount,room.seenQuestions,randomInt,room.subject)
  room.seenQuestions=mergeIqHistory(room.seenQuestions,room.questions.map(question=>question.id));room.index=0
  room.players.forEach(p=>{p.score=0;p.correct=0})
  beginIqQuestion(room)
}
function beginIqQuestion(room) {
  clearTimeout(room.timer)
  room.phase='question';room.questionId=randomUUID();room.deadline=Date.now()+iqTurnMs
  room.players.forEach(p=>{p.answer=null;p.points=0;p.timeLeft=0})
  room.timer=setTimeout(()=>revealIqQuestion(room),iqTurnMs)
  broadcastIq(room)
}
function answerIq(socket,questionId,answer) {
  const meta=clients.get(socket),room=meta?.game==='iq'&&iqRooms.get(meta.code),player=room?.players.find(p=>p.id===meta.id)
  if(!room||room.phase!=='question'||questionId!==room.questionId||!player||player.answer!==null)return
  if(Date.now()>=room.deadline){revealIqQuestion(room);return}
  if(!Number.isInteger(answer)||answer<0||answer>3)return send(socket,{type:'iq_error',message:'Đáp án không hợp lệ'})
  player.answer=answer;player.timeLeft=Math.min(20,Math.ceil((room.deadline-Date.now())/iqTurnMs*20))
  if(room.players.every(p=>!p.connected||p.answer!==null))revealIqQuestion(room)
  else broadcastIq(room)
}
function revealIqQuestion(room) {
  if(room.phase!=='question')return
  clearTimeout(room.timer);room.timer=null;room.deadline=null;room.phase='reveal'
  const correct=room.questions[room.index].correct
  room.players.forEach(p=>{
    p.points=p.answer===correct?100+p.timeLeft*5:0
    p.score+=p.points;if(p.answer===correct)p.correct++
  })
  broadcastIq(room)
}
function nextIqQuestion(socket,questionId) {
  const meta=clients.get(socket),room=meta?.game==='iq'&&iqRooms.get(meta.code),player=room?.players.find(p=>p.id===meta.id)
  if(!room||!player?.host||room.phase!=='reveal'||questionId!==room.questionId)return
  if(room.index+1>=room.questions.length){room.phase='finished';broadcastIq(room);return}
  room.index++;beginIqQuestion(room)
}
function leaveIqRoom(socket,meta) {
  clients.delete(socket)
  const room=iqRooms.get(meta.code),player=room?.players.find(p=>p.id===meta.id)
  if(!room||!player)return
  player.connected=false;player.socket=null
  if(room.phase==='lobby')room.players=room.players.filter(p=>p!==player)
  if(!room.players.some(p=>p.connected)){clearTimeout(room.timer);iqRooms.delete(room.code);return}
  if(player.host){player.host=false;room.players.find(p=>p.connected).host=true}
  if(room.phase==='question'&&room.players.every(p=>!p.connected||p.answer!==null))revealIqQuestion(room)
  else broadcastIq(room)
}
function endIqRoom(socket) {
  const meta=clients.get(socket),room=meta?.game==='iq'&&iqRooms.get(meta.code),player=room?.players.find(p=>p.id===meta.id)
  if(!room||!player?.host)return
  clearTimeout(room.timer);iqRooms.delete(room.code)
  for(const member of room.players)if(member.socket){clients.delete(member.socket);send(member.socket,{type:'iq_closed',message:'Chủ phòng đã kết thúc phòng chơi.'});member.socket.close()}
}
function broadcastIq(room) {
  const question=room.questions[room.index],revealed=['reveal','finished'].includes(room.phase)
  const publicQuestion=question?{id:room.questionId,key:question.id,category:question.category,grade:question.grade,topic:question.topic,question:question.question,answers:question.answers,...(revealed?{correct:question.correct,explanation:question.explanation}:{})}:null
  const players=room.players.map(p=>({id:p.id,name:p.name,host:p.host,connected:p.connected,score:p.score,correct:p.correct,hasAnswered:p.answer!==null,...(revealed?{answer:p.answer,points:p.points}:{})}))
  for(const p of room.players)if(p.connected)send(p.socket,{type:'iq_state',code:room.code,phase:room.phase,index:room.index,questionCount:room.questionCount,field:'school',subject:room.subject,deadline:room.deadline,serverTime:Date.now(),question:publicQuestion,players,you:{id:p.id,name:p.name,host:p.host,reconnectToken:p.reconnectToken,answer:p.answer}})
}

const heartbeat=setInterval(()=>{
  for(const socket of wss.clients){
    if(socket.isAlive===false){socket.terminate();continue}
    socket.isAlive=false;socket.ping()
  }
},30000)

server.listen(port,'0.0.0.0',()=>console.log(`Doan Dai Hiep server: http://0.0.0.0:${server.address().port}`))
server.on('close',()=>clearInterval(heartbeat))
process.on('SIGTERM',()=>server.close(()=>process.exit(0)))
