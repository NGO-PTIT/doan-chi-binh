import { useEffect, useMemo, useRef, useState } from 'react'
import { BLACK, LABELS, RED, applyMove, chooseAiMove, initialBoard, isInCheck, legalMoves, movesFor, notation } from './engine.js'
import { BOARD_SIZE, EMPTY, X_PLAYER, O_PLAYER, createEmptyBoard, checkWinner, isBoardFull, findBestMove } from './caro.js'

const UndoIcon = () => <svg viewBox="0 0 24 24"><path d="M9 7 4 12l5 5M5 12h8a6 6 0 1 1 0 12"/></svg>
const ResetIcon = () => <svg viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5M6.1 8A7 7 0 0 1 18 6l2 2M17.9 16A7 7 0 0 1 6 18l-2-2"/></svg>
const ArrowIcon = () => <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
const SearchIcon = () => <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
const BackIcon = () => <svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>

const GAMES = [
  {id:'xiangqi',title:'Cờ Tướng',subtitle:'Kỳ phùng địch thủ',category:'Chiến thuật',players:'1–2 người',badge:'Chơi ngay',symbol:'將',tone:'crimson',available:true,description:'Đấu trí với cao thủ máy, chơi cùng bạn bè hoặc tạo phòng online.'},
  {id:'werewolf',title:'Ma Sói',subtitle:'Sống sót qua đêm dài',category:'Nhập vai',players:'5–12 người',badge:'Chơi ngay',symbol:'☾',tone:'werewolf',available:true},
  {id:'caro',title:'Cờ Caro',subtitle:'Năm quân liên tiếp',category:'Trí tuệ',players:'2 người',badge:'Chơi ngay',symbol:'✕',tone:'teal',available:true},
  {id:'chess',title:'Cờ Vua',subtitle:'Vương quyền đối đầu',category:'Chiến thuật',players:'2 người',badge:'Sắp ra mắt',symbol:'♞',tone:'indigo'},
  {id:'sudoku',title:'Sudoku',subtitle:'Thử thách con số',category:'Giải đố',players:'1 người',badge:'Sắp ra mắt',symbol:'9',tone:'amber'},
  {id:'cards',title:'Tiến Lên',subtitle:'Về nhất, thắng lớn',category:'Bài lá',players:'2–4 người',badge:'Sắp ra mắt',symbol:'A',tone:'violet'},
  {id:'mines',title:'Dò Mìn',subtitle:'Mở ô, tránh bẫy',category:'Giải đố',players:'1 người',badge:'Sắp ra mắt',symbol:'✦',tone:'slate'},
  {id:'memory',title:'Lật Hình',subtitle:'Ghi nhớ và kết nối',category:'Thư giãn',players:'1–2 người',badge:'Sắp ra mắt',symbol:'◈',tone:'rose'},
]

export default function App() {
  const gameFromHash=()=>['xiangqi','werewolf','caro'].includes(location.hash.slice(1))?location.hash.slice(1):'hub'
  const [screen,setScreen] = useState(gameFromHash)

  useEffect(()=>{
    const onHash=()=>setScreen(gameFromHash())
    addEventListener('hashchange',onHash)
    return ()=>removeEventListener('hashchange',onHash)
  },[])

  function openGame(id) {
    if (!['xiangqi','werewolf','caro'].includes(id)) return
    location.hash=id
    setScreen(id)
  }
  function goHome() {
    history.pushState('',document.title,location.pathname+location.search)
    setScreen('hub')
    scrollTo({top:0,behavior:'smooth'})
  }

  if (screen==='xiangqi') return <XiangqiGame onExit={goHome}/>
  if (screen==='werewolf') return <WerewolfGame onExit={goHome}/>
  if (screen==='caro') return <CaroGame onExit={goHome}/>
  return <GameHub onOpen={openGame}/>
}

function GameHub({onOpen}) {
  const [category,setCategory] = useState('Tất cả')
  const [query,setQuery] = useState('')
  const categories=['Tất cả','Chiến thuật','Nhập vai','Trí tuệ','Giải đố','Bài lá','Thư giãn']
  const visible=GAMES.filter(game=>(category==='Tất cả'||game.category===category)&&game.title.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi')))

  return <main className="hub-shell">
    <nav className="hub-nav">
      <a className="hub-brand" href="#top" aria-label="Về đầu trang"><span>俠</span><div><strong>DOÃN ĐẠI HIỆP</strong><small>Giang hồ hội tụ</small></div></a>
      <div className="nav-links"><a href="#games">Các cuộc so tài</a><a href="#featured">Đại hiệp đề cử</a></div>
      <div className="nav-status"><i></i><span>3 đấu trường đang mở</span></div>
    </nav>

    <section className="hub-hero" id="featured">
      <div className="hero-copy">
        <span className="eyebrow"><i></i> DOÃN ĐẠI HIỆP KHAI HỘI</span>
        <h1>Chọn cuộc chơi,<br/><em>lập nên chiến tích.</em></h1>
        <p>Từ bàn cờ cân não đến đêm Ma Sói nghẹt thở. Anh hùng bốn phương, chọn một đấu trường và cùng nhau so tài.</p>
        <button onClick={()=>onOpen('xiangqi')}>Vào bàn so tài <ArrowIcon/></button>
        <div className="hero-numbers"><span><b>08</b>Trò chơi</span><span><b>06</b>Thể loại</span><span><b>24/7</b>Luôn sẵn sàng</span></div>
      </div>
      <button className="featured-game" onClick={()=>onOpen('xiangqi')} aria-label="Mở game Cờ Tướng">
        <div className="featured-glow"></div><span className="featured-label">ĐẠI HIỆP ĐỀ CỬ</span>
        <div className="feature-piece"><i>將</i><i>帥</i></div>
        <div className="feature-info"><small>CHIẾN THUẬT · 1–2 NGƯỜI</small><h2>Cờ Tướng</h2><p>Đấu trí cùng kỳ thủ máy</p><span>Vào bàn cờ <ArrowIcon/></span></div>
      </button>
    </section>

    <section className="library" id="games">
      <div className="library-head"><div><span className="eyebrow">GIANG HỒ BÍ KÍP</span><h2>Chọn cuộc so tài</h2></div><label className="game-search"><SearchIcon/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm trò chơi..." aria-label="Tìm trò chơi"/></label></div>
      <div className="category-tabs" role="tablist" aria-label="Thể loại game">{categories.map(item=><button key={item} className={category===item?'active':''} onClick={()=>setCategory(item)}>{item}</button>)}</div>
      <div className="game-grid">
        {visible.map(game=><article className={`game-card ${game.available?'is-ready':'is-coming'}`} key={game.id}>
          <button className="game-art" onClick={()=>onOpen(game.id)} disabled={!game.available} aria-label={game.available?`Chơi ${game.title}`:`${game.title} sắp ra mắt`}><div className={`art-bg ${game.tone}`}></div><span className="game-symbol">{game.symbol}</span><small>{game.badge}</small>{game.available&&<i className="play-orbit">▶</i>}</button>
          <div className="game-meta"><div><span>{game.category} · {game.players}</span><h3>{game.title}</h3><p>{game.subtitle}</p></div><button onClick={()=>onOpen(game.id)} disabled={!game.available} aria-label={game.available?`Mở ${game.title}`:undefined}><ArrowIcon/></button></div>
        </article>)}
        {!visible.length&&<div className="no-games"><span>俠</span><h3>Chưa tìm thấy cuộc chơi</h3><p>Thử tên khác hoặc chọn lại thể loại.</p><button onClick={()=>{setQuery('');setCategory('Tất cả')}}>Xem tất cả</button></div>}
      </div>
    </section>
    <footer className="hub-footer"><div className="hub-brand"><span>俠</span><div><strong>DOÃN ĐẠI HIỆP</strong><small>Giang hồ hội tụ</small></div></div><p>“Anh hùng bốn phương, gặp nhau tại một sảnh.”</p><small>© 2026 Doãn Đại Hiệp</small></footer>
  </main>
}

const ROLE_INFO={
  wolf:{name:'Ma Sói',icon:'狼',team:'Sói',description:'Mỗi đêm cùng đồng đội chọn một người để săn.',night:'Ma Sói mở mắt và chọn một nạn nhân.'},
  seer:{name:'Tiên Tri',icon:'◉',team:'Dân làng',description:'Mỗi đêm được soi thân phận của một người.',night:'Tiên Tri mở mắt và chọn một người để soi.'},
  guard:{name:'Bảo Vệ',icon:'盾',team:'Dân làng',description:'Mỗi đêm bảo vệ một người khỏi Ma Sói.',night:'Bảo Vệ mở mắt và chọn một người để bảo vệ.'},
  witch:{name:'Phù Thủy',icon:'⚗',team:'Dân làng',description:'Có một bình cứu người và một bình độc.',night:'Phù Thủy thức dậy và quyết định dùng bình thuốc.'},
  hunter:{name:'Thợ Săn',icon:'弓',team:'Dân làng',description:'Khi bị loại có thể kéo theo một người khác.',night:null},
  villager:{name:'Dân Làng',icon:'人',team:'Dân làng',description:'Quan sát, tranh luận và tìm ra Ma Sói.',night:null},
}

function makeRoles(count) {
  const roles=['wolf','seer','guard']
  if(count>=7) roles.push('witch')
  if(count>=8) roles.push('wolf')
  if(count>=9) roles.push('hunter')
  if(count>=11) roles.push('wolf')
  while(roles.length<count) roles.push('villager')
  for(let i=roles.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[roles[i],roles[j]]=[roles[j],roles[i]]}
  return roles
}

function WerewolfGame({onExit}) {
  const [name,setName]=useState(()=>localStorage.getItem('wolf_name')||'')
  const [joinCode,setJoinCode]=useState('')
  const [connection,setConnection]=useState('idle')
  const [room,setRoom]=useState(null)
  const [error,setError]=useState('')
  const [roleSeen,setRoleSeen]=useState(false)
  const [selected,setSelected]=useState(null)
  const [clock,setClock]=useState(Date.now())
  const socketRef=useRef(null)

  function connect(type,code=''){
    if(!name.trim()){setError('Hãy nhập tên của bạn');return}
    socketRef.current?.close();setConnection('connecting');setError('');localStorage.setItem('wolf_name',name.trim())
    const protocol=location.protocol==='https:'?'wss':'ws',configured=import.meta.env.VITE_WS_URL
    const url=configured||(import.meta.env.DEV?`${protocol}://${location.hostname}:8080`:`${protocol}://${location.host}`)
    const socket=new WebSocket(url);socketRef.current=socket
    socket.onopen=()=>socket.send(JSON.stringify({type,name:name.trim(),code}))
    socket.onmessage=event=>{const data=JSON.parse(event.data);if(data.type==='wolf_state'){setRoom(prev=>{if(prev?.status!=='playing'&&data.status==='playing')setRoleSeen(false);return data});setConnection('connected');setError('');setSelected(null)}else if(data.type==='wolf_error'){setError(data.message);setConnection('idle')}else if(data.type==='wolf_closed'){socket.intentional=true;setRoom(null);setConnection('idle');setError(data.message);socket.close()}}
    socket.onerror=()=>{setError(import.meta.env.DEV?'Không thể kết nối. Hãy chạy npm run dev.':'Không thể kết nối máy chủ');setConnection('idle')}
    socket.onclose=()=>{if(!socket.intentional)setConnection(c=>c==='connected'?'lost':c)}
  }
  function send(type,payload={}){socketRef.current?.send(JSON.stringify({type,...payload}))}
  function submitChoice(){if(selected===null)return;send(room.phase==='day'?'wolf_vote':'wolf_action',{target:selected});setSelected(null)}
  function copyCode(){navigator.clipboard?.writeText(room.code)}
  function endRoom(){if(confirm('Kết thúc phòng cho tất cả người chơi?'))send('wolf_end')}
  useEffect(()=>()=>socketRef.current?.close(),[])
  useEffect(()=>{
    if(!room?.deadline)return
    setClock(Date.now())
    const timer=setInterval(()=>setClock(Date.now()),250)
    return()=>clearInterval(timer)
  },[room?.deadline])

  if(!room) return <main className="wolf-shell wolf-online-home"><WolfHeader onExit={onExit}/><section className="wolf-online-hero"><div className="wolf-intro"><span className="wolf-moon">☾</span><small>MA SÓI ONLINE · AI QUẢN TRÒ</small><h1>Cả làng.<br/><em>Một bí mật.</em></h1><p>Mỗi người tham gia trên thiết bị riêng. Luna AI sẽ bí mật chia vai, gọi từng nhân vật trong đêm, kiểm phiếu và kể lại câu chuyện của ngôi làng.</p><div className="ai-host-pill"><i>✦</i><span><b>Luna AI</b>Quản trò luôn sẵn sàng</span><strong>ONLINE</strong></div></div><div className="online-entry-card"><span className="entry-kicker">BƯỚC VÀO NGÔI LÀNG</span><h2>Bạn là ai?</h2><label><span>TÊN HIỂN THỊ</span><input value={name} onChange={e=>setName(e.target.value.slice(0,20))} placeholder="Nhập tên của bạn" maxLength="20"/></label><button className="create-wolf-room" disabled={connection==='connecting'} onClick={()=>connect('wolf_create')}>Tạo phòng mới <ArrowIcon/></button><div className="or-line"><span></span>HOẶC<span></span></div><label><span>MÃ PHÒNG</span><div className="wolf-code-input"><input value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6))} placeholder="ABC123" maxLength="6"/><button disabled={joinCode.length!==6||connection==='connecting'} onClick={()=>connect('wolf_join',joinCode)}>Tham gia</button></div></label>{connection==='connecting'&&<p className="wolf-connecting"><i></i> Đang kết nối tới ngôi làng…</p>}{error&&<p className="wolf-form-error">{error}</p>}<div className="entry-note"><span>5–12</span><p>người chơi<br/>trên nhiều thiết bị</p></div></div></section></main>

  if(room.status==='lobby') return <main className="wolf-shell"><WolfHeader onExit={onExit}/><section className="wolf-lobby"><div className="lobby-code"><small>MÃ PHÒNG</small><button onClick={copyCode}>{room.code}<span>Sao chép</span></button><p>Gửi mã này cho bạn bè để cùng tham gia.</p></div><div className="lobby-main"><div className="lobby-title"><div><span>PHÒNG CHỜ</span><h1>Ngôi làng đang tụ họp</h1></div><strong>{room.players.length}<small>/12 người</small></strong></div><div className="lobby-players">{room.players.map((player,i)=><div key={player.id} className={player.connected?'':'offline'}><i>{player.name.charAt(0).toUpperCase()}</i><span><b>{player.name}</b><small>{player.host?'Chủ phòng':player.connected?'Đã sẵn sàng':'Mất kết nối'}</small></span>{player.host&&<em>♛</em>}</div>)}{Array.from({length:Math.max(0,5-room.players.length)},(_,i)=><div className="empty-seat" key={i}><i>+</i><span><b>Đang chờ…</b><small>Mời thêm người chơi</small></span></div>)}</div><div className="lobby-bottom"><div className="ai-host-card"><i>✦</i><span><b>Luna AI đang đợi</b><small>{room.players.length<5?`Cần thêm ${5-room.players.length} người để bắt đầu`:'Đã đủ người. Sẵn sàng chia vai!'}</small></span></div>{room.you.host?<div className="lobby-host-actions"><button className="end-wolf-room" onClick={endRoom}>Kết thúc phòng</button><button className="start-room-button" disabled={room.players.length<5} onClick={()=>send('wolf_start')}>Bắt đầu ván chơi <ArrowIcon/></button></div>:<p>Chờ chủ phòng bắt đầu…</p>}</div></div></section></main>

  const role=ROLE_INFO[room.you.role]
  if(room.status==='playing'&&!roleSeen)return <main className="wolf-shell reveal-shell"><WolfHeader onExit={onExit}/><section className="role-reveal online-role"><small>VAI TRÒ BÍ MẬT CỦA BẠN</small><h1>{room.you.name}</h1><p>Chỉ mình bạn có thể nhìn thấy lá bài này.</p><div className="role-card is-flipped"><span className={`role-icon ${room.you.role}`}>{role.icon}</span><small>PHE {role.team.toUpperCase()}</small><h2>{role.name}</h2><p>{role.description}</p>{room.you.role==='wolf'&&room.you.wolfIds.length>1&&<strong>Đồng đội: {room.players.filter(p=>room.you.wolfIds.includes(p.id)&&p.id!==room.you.id).map(p=>p.name).join(', ')}</strong>}</div><button className="pass-device" onClick={()=>setRoleSeen(true)}>Tôi đã hiểu vai của mình <ArrowIcon/></button></section></main>

  const alive=room.players.filter(p=>p.alive),isNight=room.phase==='night',canChoose=room.you.canAct&&room.you.alive
  const targets=alive.filter(p=>p.id!==room.you.id&&!(room.you.role==='wolf'&&room.you.wolfIds.includes(p.id)))
  const actionTitle=room.phase==='day'?'Bạn nghi ngờ ai?':room.step==='guard'?'Bạn muốn bảo vệ ai?':room.step==='wolf'?'Đêm nay săn ai?':room.step==='seer'?'Bạn muốn soi ai?':'Chọn cách dùng thuốc'
  const secondsLeft=room.deadline?Math.max(0,Math.ceil((room.deadline-clock)/1000)):null
  return <main className={`wolf-shell wolf-online-game ${isNight?'night':'day'}`}><WolfHeader onExit={onExit}/><section className="online-game-layout"><div className="online-phase"><div className="round-badge"><span>{isNight?'☾':'☀'}</span><div><small>VÒNG {room.round} · {isNight?'MÀN ĐÊM':'BAN NGÀY'}</small><h1>{isNight?'Ngôi làng đang ngủ':'Cuộc tranh luận bắt đầu'}</h1></div>{room.status==='playing'&&<div className={`phase-status ${isNight&&secondsLeft<=10?'urgent':''}`}>{isNight?<><b>00:{String(secondsLeft??0).padStart(2,'0')}</b><small>THỜI GIAN CÒN LẠI</small></>:<><b>{room.votesSubmitted}/{room.votesRequired}</b><small>ĐÃ BỎ PHIẾU</small></>}</div>}</div><div className="ai-narrator"><div className="ai-orb"><i>✦</i><span></span></div><div><small>LUNA AI · QUẢN TRÒ</small><p>{room.narration}</p>{room.you.privateMessage&&<strong>{room.you.privateMessage}</strong>}</div></div>{room.status==='finished'?<div className="online-winner"><span>{room.winner==='Ma Sói'?'狼':'村'}</span><small>VÁN CHƠI KẾT THÚC</small><h2>Phe {room.winner} chiến thắng!</h2><p>{room.winner==='Ma Sói'?'Bóng tối đã chiếm lấy ngôi làng.':'Những chiếc nanh vuốt cuối cùng đã bị vạch trần.'}</p>{room.you.host&&<button className="confirm-action" onClick={()=>send('wolf_start')}>Chơi ván mới <ArrowIcon/></button>}</div>:canChoose?<div className="player-action"><div className="action-heading"><span>LƯỢT CỦA BẠN</span><h2>{actionTitle}</h2></div>{room.step==='witch'&&<div className="witch-actions">{room.you.canSave&&<button onClick={()=>send('wolf_action',{target:'save'})}>⚗ Cứu {room.you.wolfVictim}</button>}<button onClick={()=>send('wolf_action',{target:'skip'})}>Bỏ qua đêm nay</button></div>}<div className="online-targets">{targets.map(player=><button className={selected===player.id?'active':''} onClick={()=>setSelected(player.id)} key={player.id}><i>{player.name.charAt(0).toUpperCase()}</i><span>{player.name}</span>{room.phase==='day'&&player.voteDone&&<small>Đã bỏ phiếu</small>}</button>)}</div>{!(room.step==='witch'&&!room.you.canPoison)&&<button className="confirm-action" disabled={!selected} onClick={submitChoice}>{room.phase==='day'?'Xác nhận lá phiếu':room.step==='witch'?'Dùng bình độc':'Xác nhận lựa chọn'} <ArrowIcon/></button>}</div>:<div className="waiting-action"><span>{room.you.alive?'◌':'✕'}</span><div><h3>{!room.you.alive?'Bạn đã rời cuộc chơi':room.phase==='day'?`Đang chờ đủ ${room.votesRequired} lá phiếu`:'AI đang điều phối lượt chơi'}</h3><p>{!room.you.alive?'Bạn vẫn có thể theo dõi diễn biến đến cuối ván.':room.phase==='day'?`${room.votesSubmitted}/${room.votesRequired} người đã hoàn thành. Màn chơi chỉ chuyển khi tất cả đã bỏ phiếu.`:'Mỗi nhân vật có tối đa 60 giây. Hết giờ, Luna AI sẽ tự động chuyển lượt.'}</p></div></div>}</div><aside className="online-village"><div className="your-role"><span className={room.you.role}>{role.icon}</span><div><small>VAI CỦA BẠN</small><strong>{role.name}</strong></div><i className={room.you.alive?'alive':'dead'}>{room.you.alive?'Còn sống':'Đã bị loại'}</i></div><div className="online-village-title"><span>DÂN LÀNG</span><b>{alive.length} còn sống</b></div><div className="online-player-list">{room.players.map(player=><div className={`${player.alive?'':'dead'} ${player.id===room.you.id?'is-you':''}`} key={player.id}><i>{player.name.charAt(0).toUpperCase()}</i><span><b>{player.name}{player.id===room.you.id?' · Bạn':''}</b><small>{player.alive?(player.connected?'Trong làng':'Mất kết nối'):room.status==='finished'?'Đã bị loại':'Rời cuộc chơi'}</small></span>{player.host&&<em>♛</em>}<strong>{player.alive?'●':'×'}</strong></div>)}</div>{room.log.length>0&&<div className="online-log"><span>CHUYỆN TRONG LÀNG</span>{room.log.map((item,i)=><p key={i}>{item.text}</p>)}</div>}{room.you.host&&<button className="end-wolf-room in-game" onClick={endRoom}>Kết thúc phòng</button>}</aside></section></main>
}

function WolfHeader({onExit}){return <header className="wolf-header"><button onClick={onExit}><BackIcon/><span>Sảnh game</span></button><a href="#werewolf"><span>☾</span><div><strong>MA SÓI</strong><small>Đêm dài chưa kết thúc</small></div></a><div className="wolf-player-tag">5–12 NGƯỜI</div></header>}

function CaroGame({onExit}) {
  const [board, setBoard] = useState(createEmptyBoard)
  const [currentPlayer, setCurrentPlayer] = useState(X_PLAYER)
  const [winner, setWinner] = useState(null)
  const [gameMode, setGameMode] = useState('ai')
  const [difficulty, setDifficulty] = useState('medium')
  const [thinking, setThinking] = useState(false)
  const [history, setHistory] = useState([])
  const [sound, setSound] = useState(true)
  const [onlineStatus, setOnlineStatus] = useState('idle')
  const [roomCode, setRoomCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [onlinePlayer, setOnlinePlayer] = useState(null)
  const [onlineError, setOnlineError] = useState('')
  const onlineSocket = useRef(null)

  function makeMove(row, col) {
    if (gameMode === 'online') {
      if (onlineStatus !== 'playing' || onlinePlayer !== currentPlayer) return
      onlineSocket.current?.send(JSON.stringify({type:'caro_move',row,col}))
      return
    }

    if (board[row][col] !== EMPTY || winner || thinking) return
    if (gameMode === 'ai' && currentPlayer !== X_PLAYER) return

    const newBoard = board.map(r => [...r])
    newBoard[row][col] = currentPlayer
    setBoard(newBoard)
    setHistory(h => [...h, { row, col, player: currentPlayer }])

    if (checkWinner(newBoard, row, col, currentPlayer)) {
      setWinner(currentPlayer)
      if (sound) playClick(true)
      return
    }

    if (isBoardFull(newBoard)) {
      setWinner('draw')
      if (sound) playClick(false)
      return
    }

    if (sound) playClick(false)
    setCurrentPlayer(currentPlayer === X_PLAYER ? O_PLAYER : X_PLAYER)
  }

  useEffect(() => {
    if (gameMode !== 'ai' || currentPlayer !== O_PLAYER || winner || thinking) return

    setThinking(true)
    const timer = setTimeout(() => {
      const move = findBestMove(board, O_PLAYER, difficulty)
      if (move) {
        const newBoard = board.map(r => [...r])
        newBoard[move.row][move.col] = O_PLAYER
        setBoard(newBoard)
        setHistory(h => [...h, { row: move.row, col: move.col, player: O_PLAYER }])

        if (checkWinner(newBoard, move.row, move.col, O_PLAYER)) {
          setWinner(O_PLAYER)
          if (sound) playClick(true)
        } else if (isBoardFull(newBoard)) {
          setWinner('draw')
          if (sound) playClick(false)
        } else {
          if (sound) playClick(false)
          setCurrentPlayer(X_PLAYER)
        }
      }
      setThinking(false)
    }, 500)

    return () => clearTimeout(timer)
  }, [currentPlayer, gameMode, winner, board, difficulty, sound, thinking])

  function reset() {
    if (gameMode === 'online' && onlineStatus === 'playing') {
      onlineSocket.current?.send(JSON.stringify({type:'caro_reset'}))
      return
    }
    setBoard(createEmptyBoard())
    setCurrentPlayer(X_PLAYER)
    setWinner(null)
    setHistory([])
    setThinking(false)
  }

  function undo() {
    if (history.length === 0 || thinking || gameMode === 'online') return
    const count = gameMode === 'ai' && currentPlayer === X_PLAYER && history.length >= 2 ? 2 : 1
    const newHistory = history.slice(0, -count)
    const newBoard = createEmptyBoard()
    
    newHistory.forEach(move => {
      newBoard[move.row][move.col] = move.player
    })

    setBoard(newBoard)
    setHistory(newHistory)
    setWinner(null)
    setCurrentPlayer(newHistory.length % 2 === 0 ? X_PLAYER : O_PLAYER)
  }

  function changeMode(mode) {
    if (gameMode === 'online' && mode !== 'online') disconnectOnline()
    setGameMode(mode)
    reset()
  }

  function connectOnline(action, code = '') {
    disconnectOnline()
    setOnlineStatus('connecting')
    setOnlineError('')
    const configured = import.meta.env.VITE_WS_URL
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const url = configured || (import.meta.env.DEV ? `${protocol}://${location.hostname}:8080` : `${protocol}://${location.host}`)
    const socket = new WebSocket(url)
    onlineSocket.current = socket
    socket.onopen = () => socket.send(JSON.stringify({ type: action, code }))
    socket.onmessage = event => {
      const data = JSON.parse(event.data)
      if (data.type === 'caro_state') {
        setRoomCode(data.code)
        setOnlinePlayer(data.player)
        setOnlineStatus(data.status)
        setOnlineError('')
        setBoard(data.board)
        setCurrentPlayer(data.currentPlayer)
        setHistory(data.history)
        setWinner(data.winner)
      } else if (data.type === 'caro_error') {
        setOnlineError(data.message)
        setOnlineStatus('idle')
      } else if (data.type === 'caro_opponent_left') {
        setOnlineError(data.message)
        setOnlineStatus('disconnected')
      }
    }
    socket.onerror = () => {
      setOnlineError(import.meta.env.DEV ? 'Không thể kết nối. Hãy chạy npm run dev.' : 'Không thể kết nối máy chủ')
      setOnlineStatus('idle')
    }
    socket.onclose = () => {
      if (!socket.intentional) setOnlineStatus(s => s === 'idle' ? s : 'disconnected')
    }
  }

  function disconnectOnline() {
    const socket = onlineSocket.current
    if (socket) {
      socket.intentional = true
      socket.close()
    }
    onlineSocket.current = null
    setOnlineStatus('idle')
    setRoomCode('')
    setOnlinePlayer(null)
    setOnlineError('')
  }

  function copyRoomCode() {
    navigator.clipboard?.writeText(roomCode)
  }

  useEffect(() => () => disconnectOnline(), [])

  const xName = gameMode === 'online' ? (onlinePlayer === X_PLAYER ? 'Bạn' : 'Đối thủ') : gameMode === 'ai' ? 'Bạn' : 'Người chơi 1'
  const oName = gameMode === 'online' ? (onlinePlayer === O_PLAYER ? 'Bạn' : 'Đối thủ') : gameMode === 'ai' ? 'Máy' : 'Người chơi 2'
  const lastMove = history[history.length - 1]

  return <main className="app-shell caro-shell">
    <header className="game-header">
      <button className="back-to-hub" onClick={onExit} aria-label="Quay về sảnh game"><BackIcon/><span>Sảnh game</span></button>
      <div className="brand-mark caro-mark">✕</div>
      <div><h1>CỜ CARO</h1><p>Năm quân liên tiếp</p></div>
      <button className="sound" onClick={() => setSound(s=>!s)} aria-label="Bật tắt âm thanh">{sound ? '♪' : '×'}<span>{sound ? 'Âm thanh' : 'Đã tắt'}</span></button>
    </header>

    <section className="game-layout caro-layout">
      <aside className="left-panel panel">
        <div className="player-card machine">
          <div className="avatar caro-o">O</div>
          <div>
            <span>QUÂN O</span>
            <strong>{oName}</strong>
            <small>{gameMode === 'ai' ? (thinking ? 'Đang suy nghĩ…' : 'Sẵn sàng') : (currentPlayer === O_PLAYER && !winner ? 'Đang đến lượt' : 'Đang chờ')}</small>
          </div>
        </div>
        <div className="versus"><span></span><b>ĐỐI ĐẦU</b><span></span></div>
        <div className="player-card you">
          <div className="avatar caro-x">X</div>
          <div>
            <span>QUÂN X</span>
            <strong>{xName}</strong>
            <small>{currentPlayer === X_PLAYER && !winner ? 'Đang đến lượt' : 'Đang chờ'}</small>
          </div>
        </div>
        <div className="divider" />
        <label className="field-label">CHẾ ĐỘ CHƠI</label>
        <div className="mode-switch">
          <button className={gameMode==='ai'?'active':''} onClick={()=>changeMode('ai')}><span>⊗</span>Đấu với máy</button>
          <button className={gameMode==='pvp'?'active':''} onClick={()=>changeMode('pvp')}><span>⊗⊗</span>Cùng máy</button>
          <button className={gameMode==='online'?'active':''} onClick={()=>changeMode('online')}><span>◎</span>Online</button>
        </div>
        {gameMode === 'online' && <div className="online-box">
          {onlineStatus === 'idle' && <>
            <button className="create-room" onClick={() => connectOnline('caro_create')}>Tạo phòng mới</button>
            <div className="join-row">
              <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="MÃ PHÒNG" maxLength="6" />
              <button disabled={joinCode.length !== 6} onClick={() => connectOnline('caro_join', joinCode)}>Vào</button>
            </div>
          </>}
          {onlineStatus === 'connecting' && <div className="online-message"><i></i>Đang kết nối…</div>}
          {onlineStatus === 'waiting' && <div className="room-ticket"><small>MÃ PHÒNG CỦA BẠN</small><strong>{roomCode}</strong><button onClick={copyRoomCode}>Sao chép mã</button><p>Đang chờ đối thủ tham gia…</p></div>}
          {onlineStatus === 'playing' && <div className="online-message connected"><i></i>Đã kết nối · Bạn cầm quân {onlinePlayer === X_PLAYER ? 'X' : 'O'}<b>{roomCode}</b></div>}
          {onlineStatus === 'disconnected' && <button className="create-room" onClick={() => connectOnline('caro_create')}>Tạo phòng khác</button>}
          {onlineError && <p className="online-error">{onlineError}</p>}
        </div>}
        {gameMode==='ai' && <>
          <label className="field-label difficulty-label">ĐỘ KHÓ</label>
          <div className="difficulty">
            {[['easy','Dễ'],['medium','Trung bình'],['hard','Khó']].map(([key,label]) => 
              <button key={key} className={difficulty===key?'active':''} onClick={()=>{setDifficulty(key);reset()}}>{label}</button>
            )}
          </div>
        </>}
        <div className="tip">
          <b>{gameMode === 'online' ? 'Phòng đấu riêng' : gameMode === 'pvp' ? 'Chơi cùng máy' : 'Luật chơi'}</b>
          <p>{gameMode === 'online' ? 'Gửi mã phòng cho bạn bè để vào đấu từ thiết bị khác.' : gameMode === 'pvp' ? 'Hai người lần lượt điều khiển quân X và quân O.' : 'Đặt 5 quân cùng màu liên tiếp theo hàng ngang, dọc hoặc chéo để chiến thắng.'}</p>
        </div>
      </aside>

      <div className="board-wrap caro-board-wrap">
        <div className={`turn-banner ${thinking?'is-thinking':''}`}>
          <span className={currentPlayer === X_PLAYER ? 'x-player' : 'o-player'}></span>
          {winner ? 
            winner === 'draw' ? 'Hòa!' : `${winner === X_PLAYER ? xName : oName} chiến thắng!` 
            : gameMode === 'online' && onlineStatus !== 'playing' ? (onlineStatus === 'waiting' ? 'Đang chờ đối thủ…' : 'Hãy tạo hoặc tham gia phòng')
            : thinking ? 'Máy đang suy nghĩ…' 
            : gameMode === 'online' ? (currentPlayer === onlinePlayer ? 'Đến lượt bạn' : 'Đến lượt đối thủ')
            : gameMode === 'pvp' ? `Lượt của ${currentPlayer === X_PLAYER ? 'X · ' + xName : 'O · ' + oName}` 
            : currentPlayer === X_PLAYER ? 'Lượt của bạn' : 'Lượt của máy'}
        </div>
        <CaroBoard board={board} onCellClick={makeMove} lastMove={lastMove} />
        <div className="board-actions">
          <button onClick={undo} disabled={history.length === 0 || thinking || gameMode === 'online'}><UndoIcon/>Đi lại</button>
          <button onClick={reset}><ResetIcon/>Ván mới</button>
        </div>
      </div>

      <aside className="right-panel panel">
        <div className="panel-title">
          <span>✕</span>
          <div>
            <strong>Lịch sử nước đi</strong>
            <small>{history.length} nước đã đi</small>
          </div>
        </div>
        <div className="move-list caro-moves">
          {!history.length && <div className="empty"><div>○</div><p>Các nước đi sẽ xuất hiện tại đây</p></div>}
          {history.map((move, i) => (
            <div className="move-row" key={i}>
              <b>{i + 1}.</b>
              <span className={move.player === X_PLAYER ? 'x-move' : 'o-move'}>
                {move.player === X_PLAYER ? 'X' : 'O'} → ({String.fromCharCode(65 + move.col)}{move.row + 1})
              </span>
            </div>
          ))}
        </div>
        <div className="legend">
          <span><i className="x-dot"></i>Quân X</span>
          <span><i className="o-dot"></i>Quân O</span>
        </div>
      </aside>
    </section>

    <footer className="caro-footer">
      <span>✕</span>
      <p>"Năm quân liên tiếp, chiến thắng thuộc về bạn"</p>
      <span>○</span>
    </footer>

    {winner && <div className="modal-backdrop">
      <div className="result-modal caro-modal">
        <div className={winner === X_PLAYER ? 'x-win' : winner === O_PLAYER ? 'o-win' : 'draw-win'}>
          {winner === 'draw' ? '=' : winner === X_PLAYER ? 'X' : 'O'}
        </div>
        <small>VÁN ĐẤU KẾT THÚC</small>
        <h2>{winner === 'draw' ? 'Hòa!' : (gameMode === 'online' && winner === onlinePlayer) || (gameMode !== 'online' && winner === X_PLAYER) ? `${xName} chiến thắng!` : `${oName} chiến thắng!`}</h2>
        <p>{winner === 'draw' ? 'Bàn cờ đã đầy mà không ai thắng.' : (gameMode === 'online' && winner === onlinePlayer) || (gameMode === 'ai' && winner === X_PLAYER) ? 'Xuất sắc! Bạn đã giành chiến thắng.' : gameMode === 'ai' ? 'Máy chiến thắng. Thử lại nhé!' : 'Một ván cờ hay!'}</p>
        <button onClick={reset}>Chơi ván mới</button>
      </div>
    </div>}
  </main>
}

function CaroBoard({board, onCellClick, lastMove}) {
  return <div className="caro-board">
    <div className="caro-grid">
      {board.map((row, rowIndex) => 
        row.map((cell, colIndex) => (
          <button
            key={`${rowIndex}-${colIndex}`}
            className={`caro-cell ${cell === X_PLAYER ? 'has-x' : cell === O_PLAYER ? 'has-o' : ''} ${lastMove?.row === rowIndex && lastMove?.col === colIndex ? 'last-move' : ''}`}
            onClick={() => onCellClick(rowIndex, colIndex)}
            disabled={cell !== EMPTY}
            aria-label={`Ô ${String.fromCharCode(65 + colIndex)}${rowIndex + 1}`}
          >
            {cell === X_PLAYER && <span className="piece-x">✕</span>}
            {cell === O_PLAYER && <span className="piece-o">○</span>}
          </button>
        ))
      )}
    </div>
    <div className="caro-labels">
      <div className="col-labels">
        {Array.from({length: BOARD_SIZE}, (_, i) => <span key={i}>{String.fromCharCode(65 + i)}</span>)}
      </div>
      <div className="row-labels">
        {Array.from({length: BOARD_SIZE}, (_, i) => <span key={i}>{i + 1}</span>)}
      </div>
    </div>
  </div>
}

function XiangqiGame({onExit}) {
  const [board,setBoard] = useState(initialBoard)
  const [turn,setTurn] = useState(RED)
  const [selected,setSelected] = useState(null)
  const [history,setHistory] = useState([])
  const [thinking,setThinking] = useState(false)
  const [gameMode,setGameMode] = useState('ai')
  const [difficulty,setDifficulty] = useState('hard')
  const [sound,setSound] = useState(true)
  const [winner,setWinner] = useState(null)
  const [aiStats,setAiStats] = useState(null)
  const [onlineStatus,setOnlineStatus] = useState('idle')
  const [roomCode,setRoomCode] = useState('')
  const [joinCode,setJoinCode] = useState('')
  const [onlineColor,setOnlineColor] = useState(null)
  const [onlineError,setOnlineError] = useState('')
  const onlineSocket = useRef(null)

  const targets = useMemo(() => selected ? movesFor(board,selected.x,selected.y) : [],[board,selected])
  const check = !winner && isInCheck(board,turn)

  function makeMove(move) {
    if (gameMode === 'online') {
      onlineSocket.current?.send(JSON.stringify({type:'move',move:{from:move.from,to:move.to}}))
      setSelected(null)
      return
    }
    const text = notation(board,move)
    const next = applyMove(board,move)
    const nextTurn = turn === RED ? BLACK : RED
    setHistory(h => [...h,{ board, turn, text, color: turn, move }])
    setBoard(next); setTurn(nextTurn); setSelected(null)
    const replies = legalMoves(next,nextTurn)
    if (!replies.length) setWinner(turn)
    if (sound) playClick(move.captured)
  }

  function onSquare(x,y) {
    if ((gameMode === 'ai' && turn !== RED) || thinking || winner) return
    if (gameMode === 'online' && (onlineStatus !== 'playing' || onlineColor !== turn)) return
    const targetMove = targets.find(m => m.to.x === x && m.to.y === y)
    if (targetMove) return makeMove(targetMove)
    const p = board[y][x]
    setSelected(p?.color === turn ? {x,y} : null)
  }

  useEffect(() => {
    if (gameMode !== 'ai' || turn !== BLACK || winner) return
    setThinking(true)
    let worker
    const timer = setTimeout(() => {
      worker = new Worker(new URL('./ai.worker.js', import.meta.url), { type: 'module' })
      worker.onmessage = ({data:move}) => {
        setThinking(false)
        setAiStats(move?.search || null)
        if (move) makeMove(move)
        else setWinner(RED)
      }
      worker.onerror = () => {
        const move=chooseAiMove(board,difficulty)
        setThinking(false)
        setAiStats(move?.search || null)
        if (move) makeMove(move)
      }
      worker.postMessage({board,difficulty})
    }, 360)
    return () => { clearTimeout(timer); worker?.terminate() }
  },[turn,winner,gameMode]) // eslint-disable-line react-hooks/exhaustive-deps

  function undo() {
    if (!history.length || thinking) return
    let index = history.length - 1
    if (gameMode === 'ai' && turn === RED && index > 0) index--
    const snapshot = history[index]
    setBoard(snapshot.board); setTurn(snapshot.turn); setHistory(h => h.slice(0,index)); setSelected(null); setWinner(null)
  }
  function reset() {
    if (gameMode === 'online' && onlineStatus === 'playing') {
      onlineSocket.current?.send(JSON.stringify({type:'reset'})); return
    }
    setBoard(initialBoard()); setTurn(RED); setSelected(null); setHistory([]); setWinner(null); setThinking(false); setAiStats(null)
  }
  function changeMode(mode) {
    if (gameMode==='online' && mode!=='online') disconnectOnline()
    setGameMode(mode)
    setBoard(initialBoard()); setTurn(RED); setSelected(null); setHistory([]); setWinner(null); setThinking(false); setAiStats(null)
  }

  function connectOnline(action, code='') {
    disconnectOnline()
    setOnlineStatus('connecting'); setOnlineError('')
    const configured=import.meta.env.VITE_WS_URL
    const protocol=location.protocol==='https:'?'wss':'ws'
    const url=configured || (import.meta.env.DEV ? `${protocol}://${location.hostname}:8080` : `${protocol}://${location.host}`)
    const socket=new WebSocket(url); onlineSocket.current=socket
    socket.onopen=()=>socket.send(JSON.stringify({type:action,code}))
    socket.onmessage=event=>{
      const data=JSON.parse(event.data)
      if (data.type==='state') {
        setRoomCode(data.code); setOnlineColor(data.color); setOnlineStatus(data.status); setOnlineError('')
        setBoard(data.board); setTurn(data.turn); setHistory(data.history); setWinner(data.winner); setSelected(null)
      } else if (data.type==='error') { setOnlineError(data.message); setOnlineStatus('idle') }
      else if (data.type==='opponent_left') { setOnlineError(data.message); setOnlineStatus('disconnected') }
    }
    socket.onerror=()=>{setOnlineError(import.meta.env.DEV?'Máy chủ phòng chưa chạy. Hãy khởi động lại bằng npm run dev.':'Không thể kết nối máy chủ phòng đấu');setOnlineStatus('idle')}
    socket.onclose=()=>{if(!socket.intentional)setOnlineStatus(s=>s==='idle'?s:'disconnected')}
  }
  function disconnectOnline() {
    const socket=onlineSocket.current
    if (socket) { socket.intentional=true; socket.close() }
    onlineSocket.current=null; setOnlineStatus('idle'); setRoomCode(''); setOnlineColor(null); setOnlineError('')
  }
  function copyRoomCode() { navigator.clipboard?.writeText(roomCode) }

  useEffect(()=>()=>disconnectOnline(),[]) // eslint-disable-line react-hooks/exhaustive-deps

  const redName=gameMode==='online'?(onlineColor===RED?'Bạn':'Đối thủ'):(gameMode==='ai'?'Bạn':'Người chơi 1')
  const blackName=gameMode==='online'?(onlineColor===BLACK?'Bạn':'Đối thủ'):(gameMode==='ai'?'Huyền Cơ':'Người chơi 2')

  return <main className="app-shell">
    <header className="game-header">
      <button className="back-to-hub" onClick={onExit} aria-label="Quay về sảnh game"><BackIcon/><span>Sảnh game</span></button>
      <div className="brand-mark">將</div>
      <div><h1>KỲ PHÙNG ĐỊCH THỦ</h1><p>Đấu trí cùng kỳ thủ máy</p></div>
      <button className="sound" onClick={() => setSound(s=>!s)} aria-label="Bật tắt âm thanh">{sound ? '♪' : '×'}<span>{sound ? 'Âm thanh' : 'Đã tắt'}</span></button>
    </header>

    <section className="game-layout">
      <aside className="left-panel panel">
        <div className="player-card machine">
          <div className="avatar">將{gameMode==='ai'&&<i></i>}</div><div><span>QUÂN ĐEN</span><strong>{blackName}</strong><small>{gameMode==='ai'?(thinking ? 'Đang phân tích thế cờ…' : aiStats ? `Độ sâu ${aiStats.depth} · ${aiStats.nodes.toLocaleString('vi-VN')} thế cờ` : 'Sẵn sàng nghênh chiến'):(turn===BLACK&&!winner?'Đang đến lượt':'Đang chờ')}</small></div>
        </div>
        <div className="versus"><span></span><b>ĐỐI ĐẦU</b><span></span></div>
        <div className="player-card you">
          <div className="avatar">帥</div><div><span>QUÂN ĐỎ</span><strong>{redName}</strong><small>{turn === RED && !winner ? 'Đang đến lượt' : 'Đang chờ'}</small></div>
        </div>
        <div className="divider" />
        <label className="field-label">CHẾ ĐỘ CHƠI</label>
        <div className="mode-switch">
          <button className={gameMode==='ai'?'active':''} onClick={()=>changeMode('ai')}><span>♟</span>Đấu với máy</button>
          <button className={gameMode==='pvp'?'active':''} onClick={()=>changeMode('pvp')}><span>♟♟</span>Cùng máy</button>
          <button className={gameMode==='online'?'active':''} onClick={()=>changeMode('online')}><span>◎</span>Online</button>
        </div>
        {gameMode==='online' && <div className="online-box">
          {onlineStatus==='idle' && <>
            <button className="create-room" onClick={()=>connectOnline('create')}>Tạo phòng mới</button>
            <div className="join-row"><input value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6))} placeholder="MÃ PHÒNG" maxLength="6"/><button disabled={joinCode.length!==6} onClick={()=>connectOnline('join',joinCode)}>Vào</button></div>
          </>}
          {onlineStatus==='connecting' && <div className="online-message"><i></i>Đang kết nối…</div>}
          {onlineStatus==='waiting' && <div className="room-ticket"><small>MÃ PHÒNG CỦA BẠN</small><strong>{roomCode}</strong><button onClick={copyRoomCode}>Sao chép mã</button><p>Đang chờ đối thủ tham gia…</p></div>}
          {onlineStatus==='playing' && <div className="online-message connected"><i></i>Đã kết nối · Bạn cầm quân {onlineColor===RED?'Đỏ':'Đen'}<b>{roomCode}</b></div>}
          {onlineStatus==='disconnected' && <button className="create-room" onClick={()=>connectOnline('create')}>Tạo phòng khác</button>}
          {onlineError && <p className="online-error">{onlineError}</p>}
        </div>}
        {gameMode==='ai' && <><label className="field-label difficulty-label">ĐỘ KHÓ</label>
          <div className="difficulty">
            {[['easy','Nhập môn'],['medium','Kỳ thủ'],['hard','Cao thủ'],['master','Đại sư']].map(([key,label]) => <button key={key} className={difficulty===key?'active':''} onClick={()=>{setDifficulty(key);reset()}}>{label}</button>)}
          </div></>}
        <div className="tip"><b>{gameMode==='online'?'Phòng đấu riêng':gameMode==='pvp'?'Chơi cùng một máy':difficulty==='master'?'Thử thách tối đa':'Mẹo chiến thuật'}</b><p>{gameMode==='online'?'Gửi mã phòng cho bạn bè để vào đấu từ thiết bị khác.':gameMode==='pvp'?'Hai người lần lượt điều khiển quân Đỏ và quân Đen.':difficulty==='master'?'AI có thể tìm kiếm sâu đến 8 lớp nước. Hãy giữ chắc trung lộ.':'Chọn một quân đỏ để xem các nước đi hợp lệ.'}</p></div>
      </aside>

      <div className="board-wrap">
        <div className={`turn-banner ${thinking?'is-thinking':''}`}><span className={turn}></span>{winner ? `${winner===RED?redName:blackName} đã thắng!` : gameMode==='online'&&onlineStatus!=='playing' ? (onlineStatus==='waiting'?'Đang chờ đối thủ…':'Hãy tạo hoặc tham gia phòng') : thinking ? 'Huyền Cơ đang phân tích…' : check ? `${turn===RED?'Đỏ':'Đen'} đang bị chiếu!` : gameMode==='online' ? (turn===onlineColor?'Đến lượt bạn':`Đến lượt đối thủ`) : gameMode==='pvp' ? `Lượt của ${turn===RED?'Người chơi 1 · Đỏ':'Người chơi 2 · Đen'}` : turn===RED ? 'Lượt của bạn' : 'Lượt của máy'}</div>
        <Board board={board} selected={selected} targets={targets} onSquare={onSquare} lastMove={history.at(-1)} />
        <div className="board-actions">
          <button onClick={undo} disabled={!history.length || thinking || gameMode==='online'}><UndoIcon/>Đi lại</button>
          <button onClick={reset}><ResetIcon/>Ván mới</button>
        </div>
      </div>

      <aside className="right-panel panel">
        <div className="panel-title"><span>棋</span><div><strong>Biên bản ván đấu</strong><small>{history.length} nước đã đi</small></div></div>
        <div className="move-list">
          {!history.length && <div className="empty"><div>譜</div><p>Các nước đi sẽ xuất hiện tại đây</p></div>}
          {Array.from({length:Math.ceil(history.length/2)},(_,i) => <div className="move-row" key={i}><b>{i+1}.</b><span>{history[i*2]?.text}</span><span>{history[i*2+1]?.text}</span></div>)}
        </div>
        <div className="legend"><span><i className="red-dot"></i>Quân Đỏ</span><span><i className="black-dot"></i>Quân Đen</span></div>
      </aside>
    </section>
    <footer><span>楚 河</span><p>“Thắng không kiêu, bại không nản”</p><span>漢 界</span></footer>
    {winner && <div className="modal-backdrop"><div className="result-modal"><div className={winner}>{winner===RED?'帥':'將'}</div><small>VÁN ĐẤU KẾT THÚC</small><h2>{winner===onlineColor||gameMode!=='online'&&winner===RED?'Bạn đã chiến thắng!':gameMode==='ai'?'Huyền Cơ chiến thắng':`${winner===RED?redName:blackName} chiến thắng!`}</h2><p>{winner===onlineColor||gameMode!=='online'&&winner===RED?'Một ván cờ xuất sắc.':'Thử lại và đổi chiến thuật nhé.'}</p><button onClick={reset}>Chơi ván mới</button></div></div>}
  </main>
}

function Board({board,selected,targets,onSquare,lastMove}) {
  return <div className="board" aria-label="Bàn cờ tướng">
    <div className="wood-grain"></div>
    <div className="grid-lines">
      {Array.from({length:10},(_,i)=><i className="h-line" style={{top:`${i*11.111}%`}} key={`h${i}`}/>) }
      {Array.from({length:9},(_,i)=><i className={`v-line v${i}`} style={{left:`${i*12.5}%`}} key={`v${i}`}/>) }
      <i className="diag d1"/><i className="diag d2"/><i className="diag d3"/><i className="diag d4"/>
      <div className="river"><span>楚 河</span><span>漢 界</span></div>
    </div>
    {board.map((row,y)=>row.map((p,x) => {
      const active = selected?.x===x && selected?.y===y
      const move = targets.find(m=>m.to.x===x&&m.to.y===y)
      const recentOrigin = lastMove?.move?.from.x===x && lastMove?.move?.from.y===y
      const recentTarget = lastMove?.move?.to.x===x && lastMove?.move?.to.y===y
      return <button className={`square ${active?'selected':''} ${move?'can-move':''} ${move?.captured?'capture':''} ${recentOrigin?'recent-origin':''} ${recentTarget?'recent-target':''}`} style={{left:`${6.2+x*10.95}%`,top:`${6.2+y*9.733}%`}} onClick={()=>onSquare(x,y)} key={`${x}-${y}`} aria-label={p?LABELS[p.color][p.type]:'ô trống'}>
        {move && <i className="target"/>}
        {p && <span className={`piece ${p.color}`}><em>{LABELS[p.color][p.type]}</em></span>}
      </button>
    }))}
    <span className="corner tl">⌜</span><span className="corner tr">⌝</span><span className="corner bl">⌞</span><span className="corner br">⌟</span>
  </div>
}

function playClick(capture) {
  try {
    const ctx = new AudioContext(), osc=ctx.createOscillator(), gain=ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination); osc.frequency.value=capture?180:280; gain.gain.setValueAtTime(.12,ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.12); osc.start(); osc.stop(ctx.currentTime+.12)
  } catch { /* browser can block audio */ }
}
