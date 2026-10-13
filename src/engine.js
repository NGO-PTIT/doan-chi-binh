export const RED = 'red'
export const BLACK = 'black'

export const LABELS = {
  red: { k: '帥', a: '仕', e: '相', h: '傌', r: '俥', c: '炮', p: '兵' },
  black: { k: '將', a: '士', e: '象', h: '馬', r: '車', c: '砲', p: '卒' },
}

const back = ['r', 'h', 'e', 'a', 'k', 'a', 'e', 'h', 'r']
const piece = (type, color, id) => ({ type, color, id: `${color[0]}${type}${id}` })

export function initialBoard() {
  const board = Array.from({ length: 10 }, () => Array(9).fill(null))
  back.forEach((type, x) => { board[0][x] = piece(type, BLACK, x) })
  board[2][1] = piece('c', BLACK, 1); board[2][7] = piece('c', BLACK, 7)
  ;[0, 2, 4, 6, 8].forEach((x, i) => { board[3][x] = piece('p', BLACK, i) })
  back.forEach((type, x) => { board[9][x] = piece(type, RED, x) })
  board[7][1] = piece('c', RED, 1); board[7][7] = piece('c', RED, 7)
  ;[0, 2, 4, 6, 8].forEach((x, i) => { board[6][x] = piece('p', RED, i) })
  return board
}

export const other = color => color === RED ? BLACK : RED
const inside = (x, y) => x >= 0 && x < 9 && y >= 0 && y < 10
const palace = (x, y, color) => x >= 3 && x <= 5 && (color === RED ? y >= 7 && y <= 9 : y >= 0 && y <= 2)
const clone = board => board.map(row => row.slice())

export function applyMove(board, move) {
  const next = clone(board)
  next[move.to.y][move.to.x] = next[move.from.y][move.from.x]
  next[move.from.y][move.from.x] = null
  return next
}

function pushIf(board, moves, piece, from, x, y) {
  if (!inside(x, y)) return
  const target = board[y][x]
  if (!target || target.color !== piece.color) moves.push({ from, to: { x, y }, captured: target })
}

function pseudoMoves(board, x, y) {
  const p = board[y][x]
  if (!p) return []
  const from = { x, y }, moves = []
  if (p.type === 'r' || p.type === 'c') {
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      let nx = x + dx, ny = y + dy, screen = false
      while (inside(nx, ny)) {
        const target = board[ny][nx]
        if (p.type === 'r') {
          if (!target) moves.push({ from, to: { x: nx, y: ny }, captured: null })
          else { if (target.color !== p.color) moves.push({ from, to: { x: nx, y: ny }, captured: target }); break }
        } else if (!screen) {
          if (!target) moves.push({ from, to: { x: nx, y: ny }, captured: null })
          else screen = true
        } else if (target) {
          if (target.color !== p.color) moves.push({ from, to: { x: nx, y: ny }, captured: target })
          break
        }
        nx += dx; ny += dy
      }
    }
  }
  if (p.type === 'h') {
    const steps = [[1,2,0,1],[-1,2,0,1],[1,-2,0,-1],[-1,-2,0,-1],[2,1,1,0],[2,-1,1,0],[-2,1,-1,0],[-2,-1,-1,0]]
    steps.forEach(([dx,dy,lx,ly]) => { if (!board[y+ly]?.[x+lx]) pushIf(board,moves,p,from,x+dx,y+dy) })
  }
  if (p.type === 'e') {
    ;[[2,2],[-2,2],[2,-2],[-2,-2]].forEach(([dx,dy]) => {
      const ny = y + dy
      const ownSide = p.color === RED ? ny >= 5 : ny <= 4
      if (ownSide && !board[y+dy/2]?.[x+dx/2]) pushIf(board,moves,p,from,x+dx,ny)
    })
  }
  if (p.type === 'a') {
    ;[[1,1],[-1,1],[1,-1],[-1,-1]].forEach(([dx,dy]) => {
      if (palace(x+dx,y+dy,p.color)) pushIf(board,moves,p,from,x+dx,y+dy)
    })
  }
  if (p.type === 'k') {
    ;[[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx,dy]) => {
      if (palace(x+dx,y+dy,p.color)) pushIf(board,moves,p,from,x+dx,y+dy)
    })
    for (const dy of [-1, 1]) {
      let ny = y + dy
      while (inside(x,ny) && !board[ny][x]) ny += dy
      const target = board[ny]?.[x]
      if (target?.type === 'k' && target.color !== p.color) moves.push({ from, to: { x, y: ny }, captured: target })
    }
  }
  if (p.type === 'p') {
    const dir = p.color === RED ? -1 : 1
    pushIf(board,moves,p,from,x,y+dir)
    const crossed = p.color === RED ? y <= 4 : y >= 5
    if (crossed) { pushIf(board,moves,p,from,x-1,y); pushIf(board,moves,p,from,x+1,y) }
  }
  return moves
}

export function isInCheck(board, color) {
  let king = null
  for (let y=0;y<10;y++) for (let x=0;x<9;x++) if (board[y][x]?.type === 'k' && board[y][x].color === color) king = {x,y}
  if (!king) return true
  for (let y=0;y<10;y++) for (let x=0;x<9;x++) {
    if (board[y][x]?.color === other(color) && pseudoMoves(board,x,y).some(m => m.to.x === king.x && m.to.y === king.y)) return true
  }
  return false
}

export function legalMoves(board, color) {
  const moves = []
  for (let y=0;y<10;y++) for (let x=0;x<9;x++) if (board[y][x]?.color === color) {
    pseudoMoves(board,x,y).forEach(move => { if (!isInCheck(applyMove(board,move), color)) moves.push(move) })
  }
  return moves
}

export function movesFor(board, x, y) {
  const p = board[y][x]
  return p ? legalMoves(board,p.color).filter(m => m.from.x === x && m.from.y === y) : []
}

const values = { k: 100000, r: 950, c: 480, h: 430, e: 220, a: 230, p: 100 }
const SEARCH_LEVELS = {
  easy: { maxDepth: 2, time: 180, branch: 18, qDepth: 1 },
  medium: { maxDepth: 4, time: 850, branch: 22, qDepth: 2 },
  hard: { maxDepth: 6, time: 2400, branch: 26, qDepth: 3 },
  master: { maxDepth: 8, time: 4800, branch: 32, qDepth: 4 },
}

function evaluate(board) {
  let score = 0
  let blackGuards = 0, redGuards = 0
  for (let y=0;y<10;y++) for (let x=0;x<9;x++) {
    const p = board[y][x]
    if (!p) continue
    const forward = p.color === BLACK ? y : 9-y
    const center = 4-Math.abs(4-x)
    let value = values[p.type]
    if (p.type === 'p') value += forward*9 + (forward >= 5 ? 42+center*5 : 0)
    if (p.type === 'h') value += center*8 + (y > 1 && y < 8 ? 16 : 0)
    if (p.type === 'c') value += center*4 + (y > 1 && y < 8 ? 8 : 0)
    if (p.type === 'r') value += center*2
    if ((p.type === 'a' || p.type === 'e') && p.color === BLACK) blackGuards++
    if ((p.type === 'a' || p.type === 'e') && p.color === RED) redGuards++
    score += p.color === BLACK ? value : -value
  }
  score += (blackGuards-redGuards)*12
  if (isInCheck(board,RED)) score += 38
  if (isInCheck(board,BLACK)) score -= 38
  return score
}

const moveKey = move => `${move.from.x}${move.from.y}${move.to.x}${move.to.y}`
const boardKey = (board,color,depth) => {
  let key = color[0]+depth
  for (let y=0;y<10;y++) for (let x=0;x<9;x++) {
    const p=board[y][x]
    key += p ? `${p.color[0]}${p.type}` : '.'
  }
  return key
}
const orderedMoves = (moves, preferred) => moves.slice().sort((a,b) => {
  const aScore=(preferred===moveKey(a)?1000000:0)+(a.captured ? values[a.captured.type]*12-(values[a.pieceType]||0) : 0)
  const bScore=(preferred===moveKey(b)?1000000:0)+(b.captured ? values[b.captured.type]*12-(values[b.pieceType]||0) : 0)
  return bScore-aScore
})

export function chooseAiMove(board, difficulty = 'hard') {
  const rootMoves=legalMoves(board,BLACK)
  if (!rootMoves.length) return null
  const level=SEARCH_LEVELS[difficulty] || SEARCH_LEVELS.hard
  const context={ deadline:Date.now()+level.time, nodes:0, table:new Map(), timedOut:false, branch:level.branch, qDepth:level.qDepth }
  let bestMove=rootMoves[0], preferred='', completedDepth=0
  for (let depth=1;depth<=level.maxDepth;depth++) {
    try {
      let bestScore=-Infinity, iterationBest=bestMove
      const moves=orderedMoves(rootMoves.map(m=>({...m,pieceType:board[m.from.y][m.from.x].type})),preferred)
      for (const move of moves) {
        checkTime(context)
        const score=search(applyMove(board,move),depth-1,RED,-Infinity,Infinity,1,context)
        if (score>bestScore) { bestScore=score; iterationBest=move }
      }
      bestMove=iterationBest; preferred=moveKey(bestMove); completedDepth=depth
      if (Math.abs(bestScore)>90000) break
    } catch (error) {
      if (error.message!=='SEARCH_TIMEOUT') throw error
      context.timedOut=true
      break
    }
  }
  // Ở mức nhập môn, đôi lúc chọn nước tốt thứ hai để người mới vẫn có cơ hội.
  if (difficulty==='easy' && rootMoves.length>1 && Math.random()<.28) {
    const alternatives=orderedMoves(rootMoves.filter(m=>moveKey(m)!==moveKey(bestMove))).slice(0,4)
    bestMove=alternatives[Math.floor(Math.random()*alternatives.length)] || bestMove
  }
  return { ...bestMove, search: { depth:completedDepth, nodes:context.nodes } }
}

function search(board,depth,color,alpha,beta,ply,context) {
  checkTime(context)
  if (depth===0) return quiescence(board,color,alpha,beta,context.qDepth,context)
  const key=boardKey(board,color,depth)
  const cached=context.table.get(key)
  if (cached!==undefined) return cached
  const moves=legalMoves(board,color)
  if (!moves.length) return color===BLACK ? -100000+ply : 100000-ply
  const maximizing=color===BLACK
  let best=maximizing ? -Infinity : Infinity
  let cutoff=false
  const ordered=orderedMoves(moves.map(m=>({...m,pieceType:board[m.from.y][m.from.x].type})))
  const branchLimit=depth>=4 ? Math.max(14,context.branch-10) : depth>=3 ? Math.max(18,context.branch-6) : depth>=2 ? context.branch : ordered.length
  for (const move of ordered.slice(0,branchLimit)) {
    const score=search(applyMove(board,move),depth-1,other(color),alpha,beta,ply+1,context)
    if (maximizing) { best=Math.max(best,score); alpha=Math.max(alpha,best) }
    else { best=Math.min(best,score); beta=Math.min(beta,best) }
    if (beta<=alpha) { cutoff=true; break }
  }
  if (!cutoff && context.table.size<80000) context.table.set(key,best)
  return best
}

function quiescence(board,color,alpha,beta,depth,context) {
  checkTime(context)
  const maximizing=color===BLACK
  let stand=evaluate(board)
  if (depth===0) return stand
  if (maximizing) {
    if (stand>=beta) return stand
    alpha=Math.max(alpha,stand)
  } else {
    if (stand<=alpha) return stand
    beta=Math.min(beta,stand)
  }
  const captures=orderedMoves(legalMoves(board,color).filter(m=>m.captured).map(m=>({...m,pieceType:board[m.from.y][m.from.x].type}))).slice(0,10)
  for (const move of captures) {
    const score=quiescence(applyMove(board,move),other(color),alpha,beta,depth-1,context)
    if (maximizing) {
      stand=Math.max(stand,score); alpha=Math.max(alpha,stand)
    } else {
      stand=Math.min(stand,score); beta=Math.min(beta,stand)
    }
    if (beta<=alpha) break
  }
  return stand
}

function checkTime(context) {
  context.nodes++
  if ((context.nodes&255)===0 && Date.now()>context.deadline) throw new Error('SEARCH_TIMEOUT')
}

export function notation(board, move) {
  const p = board[move.from.y][move.from.x]
  const target = board[move.to.y][move.to.x]
  const files = ['一','二','三','四','五','六','七','八','九']
  const fromFile = p.color === RED ? files[8-move.from.x] : String(move.from.x+1)
  const action = move.from.y === move.to.y ? '平' : ((p.color === RED) === (move.to.y < move.from.y) ? '進' : '退')
  const amount = move.from.y === move.to.y ? (p.color === RED ? files[8-move.to.x] : String(move.to.x+1)) : (['h','e','a'].includes(p.type) ? (p.color === RED ? files[8-move.to.x] : String(move.to.x+1)) : (p.color === RED ? files[Math.abs(move.to.y-move.from.y)-1] : String(Math.abs(move.to.y-move.from.y))))
  return `${LABELS[p.color][p.type]}${fromFile}${action}${amount}${target ? ' · bắt quân' : ''}`
}
