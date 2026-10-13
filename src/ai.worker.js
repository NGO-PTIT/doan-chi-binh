import { chooseAiMove } from './engine.js'

self.onmessage = ({ data }) => {
  const move = chooseAiMove(data.board, data.difficulty)
  self.postMessage(move)
}
