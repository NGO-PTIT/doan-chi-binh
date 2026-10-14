// Cờ Ca Rô (Gomoku) - Game Logic

export const EMPTY = 0
export const X_PLAYER = 1
export const O_PLAYER = 2
export const BOARD_SIZE = 15

export function createEmptyBoard() {
  return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(EMPTY))
}

export function checkWinner(board, row, col, player) {
  const directions = [
    [0, 1],   // horizontal
    [1, 0],   // vertical
    [1, 1],   // diagonal \
    [1, -1]   // diagonal /
  ]
  
  for (const [dx, dy] of directions) {
    let count = 1
    
    // Check positive direction
    for (let i = 1; i < 5; i++) {
      const newRow = row + dx * i
      const newCol = col + dy * i
      if (newRow < 0 || newRow >= BOARD_SIZE || newCol < 0 || newCol >= BOARD_SIZE) break
      if (board[newRow][newCol] !== player) break
      count++
    }
    
    // Check negative direction
    for (let i = 1; i < 5; i++) {
      const newRow = row - dx * i
      const newCol = col - dy * i
      if (newRow < 0 || newRow >= BOARD_SIZE || newCol < 0 || newCol >= BOARD_SIZE) break
      if (board[newRow][newCol] !== player) break
      count++
    }
    
    if (count >= 5) return true
  }
  
  return false
}

export function isBoardFull(board) {
  return board.every(row => row.every(cell => cell !== EMPTY))
}

export function evaluatePosition(board, row, col, player) {
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]]
  let score = 0
  
  for (const [dx, dy] of directions) {
    let count = 1
    let openEnds = 0
    
    // Check positive direction
    let i = 1
    while (i < 5) {
      const newRow = row + dx * i
      const newCol = col + dy * i
      if (newRow < 0 || newRow >= BOARD_SIZE || newCol < 0 || newCol >= BOARD_SIZE) break
      if (board[newRow][newCol] === player) count++
      else if (board[newRow][newCol] === EMPTY) { openEnds++; break }
      else break
      i++
    }
    
    // Check negative direction
    i = 1
    while (i < 5) {
      const newRow = row - dx * i
      const newCol = col - dy * i
      if (newRow < 0 || newRow >= BOARD_SIZE || newCol < 0 || newCol >= BOARD_SIZE) break
      if (board[newRow][newCol] === player) count++
      else if (board[newRow][newCol] === EMPTY) { openEnds++; break }
      else break
      i++
    }
    
    // Score based on pattern
    if (count >= 5) score += 100000
    else if (count === 4 && openEnds === 2) score += 10000
    else if (count === 4 && openEnds === 1) score += 1000
    else if (count === 3 && openEnds === 2) score += 500
    else if (count === 3 && openEnds === 1) score += 100
    else if (count === 2 && openEnds === 2) score += 50
    else if (count === 2 && openEnds === 1) score += 10
  }
  
  return score
}

export function findBestMove(board, player, difficulty = 'medium') {
  const opponent = player === X_PLAYER ? O_PLAYER : X_PLAYER
  const maxDepth = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3
  
  let bestScore = -Infinity
  let bestMove = null
  
  // Get all valid moves near existing pieces
  const validMoves = []
  const hasAnyPiece = board.some(row => row.some(cell => cell !== EMPTY))
  
  if (!hasAnyPiece) {
    // First move - place in center
    return { row: Math.floor(BOARD_SIZE / 2), col: Math.floor(BOARD_SIZE / 2) }
  }
  
  // Only consider moves near existing pieces (within 2 squares)
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (board[row][col] === EMPTY) {
        let nearPiece = false
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const nr = row + dr
            const nc = col + dc
            if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
              if (board[nr][nc] !== EMPTY) {
                nearPiece = true
                break
              }
            }
          }
          if (nearPiece) break
        }
        if (nearPiece) validMoves.push({ row, col })
      }
    }
  }
  
  // Evaluate each move
  for (const move of validMoves) {
    const { row, col } = move
    board[row][col] = player
    
    // Check if this move wins immediately
    if (checkWinner(board, row, col, player)) {
      board[row][col] = EMPTY
      return move
    }
    
    // Evaluate position
    let score = evaluatePosition(board, row, col, player)
    score -= evaluatePosition(board, row, col, opponent) * 1.1 // Slightly prioritize defense
    
    board[row][col] = EMPTY
    
    if (score > bestScore) {
      bestScore = score
      bestMove = move
    }
  }
  
  return bestMove
}
