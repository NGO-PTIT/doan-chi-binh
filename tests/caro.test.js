import test from 'node:test'
import assert from 'node:assert/strict'
import {createEmptyBoard,findBestMove,checkWinner,X_PLAYER,O_PLAYER,EMPTY} from '../src/caro.js'
import {initialBoard,legalMoves,applyMove,RED,BLACK,isInCheck} from '../src/engine.js'

test('empty boards do not share rows or games',()=>{
  const a=createEmptyBoard(),b=createEmptyBoard()
  a[0][0]=X_PLAYER
  assert.equal(a[1][0],EMPTY)
  assert.equal(b[0][0],EMPTY)
  assert.deepEqual(findBestMove(b,O_PLAYER),{row:7,col:7})
})
for(const difficulty of ['easy','medium','hard']){
  test(`Caro ${difficulty} blocks an immediate loss without mutating the board`,()=>{
    const board=createEmptyBoard()
    board[7][3]=O_PLAYER
    for(let col=4;col<=7;col++)board[7][col]=X_PLAYER
    board[6][6]=O_PLAYER
    const before=structuredClone(board)
    assert.deepEqual(findBestMove(board,O_PLAYER,difficulty),{row:7,col:8})
    assert.deepEqual(board,before)
  })
}
test('Caro takes its own win before blocking',()=>{
  const board=createEmptyBoard()
  for(let col=4;col<=7;col++){board[7][col]=X_PLAYER;board[9][col]=O_PLAYER}
  const before=structuredClone(board),move=findBestMove(board,O_PLAYER)
  assert.deepEqual(board,before)
  board[move.row][move.col]=O_PLAYER
  assert.equal(checkWinner(board,move.row,move.col,O_PLAYER),true)
})
test('Caro difficulty changes attack versus defense',()=>{
  const board=createEmptyBoard()
  board[4][4]=X_PLAYER;board[4][5]=X_PLAYER;board[4][6]=X_PLAYER
  board[10][4]=O_PLAYER;board[10][5]=O_PLAYER;board[10][6]=O_PLAYER
  assert.notDeepEqual(findBestMove(board,O_PLAYER,'easy'),findBestMove(board,O_PLAYER,'hard'))
})
test('full Caro board has no available AI move',()=>{
  const board=createEmptyBoard().map(row=>row.map(()=>X_PLAYER))
  assert.equal(findBestMove(board,O_PLAYER),null)
})
test('Xiangqi opening moves remain legal and do not mutate the board',()=>{
  const board=initialBoard(),before=structuredClone(board),moves=legalMoves(board,RED)
  assert.ok(moves.length>0)
  for(const move of moves)assert.equal(isInCheck(applyMove(board,move),RED),false)
  assert.deepEqual(board,before)
  assert.ok(legalMoves(applyMove(board,moves[0]),BLACK).length>0)
})
