import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root=path.dirname(fileURLToPath(import.meta.url))
const children=[]

function start(label,file,args=[]) {
  const child=spawn(process.execPath,[file,...args],{cwd:root,stdio:'inherit',env:process.env})
  children.push(child)
  child.on('exit',code=>{
    if (code && !shuttingDown) console.error(`[${label}] đã dừng với mã lỗi ${code}`)
  })
  return child
}

let shuttingDown=false
start('phòng online',path.join(root,'server.mjs'))
start('giao diện',path.join(root,'node_modules/vite/bin/vite.js'),['--host','0.0.0.0'])

function shutdown() {
  if (shuttingDown) return
  shuttingDown=true
  for (const child of children) if (!child.killed) child.kill('SIGTERM')
  setTimeout(()=>process.exit(0),100)
}
process.on('SIGINT',shutdown)
process.on('SIGTERM',shutdown)
