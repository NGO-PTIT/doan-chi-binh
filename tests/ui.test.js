import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {transformWithOxc} from 'vite'
import * as runtime from 'react/jsx-runtime'
import * as caro from '../src/caro.js'

// Exercise the actual component with state/effect scheduling and controlled timers, without a browser dependency.
const source=await readFile(new URL('../src/App.jsx',import.meta.url),'utf8')
const component=source.slice(source.indexOf('function CaroGame('),source.indexOf('function XiangqiGame('))
const {code}=await transformWithOxc(component,'CaroGame.jsx',{jsx:{runtime:'automatic'}})
const compiled=code.replace(/^import .*;\n/gm,'').replaceAll('import.meta.env.DEV','false').replaceAll('import.meta.env.VITE_WS_URL','undefined')
function mount(t){
  const states=[],refs=[],effects=[],timers=new Map(),sockets=[]
  let cursor=0,dirty=true,tree,timerId=0
  const api={
    ...caro,_jsx:runtime.jsx,_jsxs:runtime.jsxs,_Fragment:runtime.Fragment,
    useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],value=>{const next=typeof value==='function'?value(states[i]):value;if(!Object.is(next,states[i])){states[i]=next;dirty=true}}]},
    useRef(initial){const i=cursor++;return refs[i]??=( {current:initial})},
    useEffect(run,deps){const i=cursor++,old=effects[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j])))effects[i]={deps,run,cleanup:old?.cleanup,pending:true}},
    setTimeout(run){const id=++timerId;timers.set(id,run);return id},clearTimeout(id){timers.delete(id)},
    playClick(){},BackIcon(){},UndoIcon(){},ResetIcon(){},
    location:{protocol:'http:',host:'localhost',hostname:'localhost'},
    WebSocket:class {constructor(){sockets.push(this)}send(){}close(){}},
  }
  const Game=new Function(...Object.keys(api),compiled+'\nreturn CaroGame')(...Object.values(api))
  function flush(){
    for(let n=0;dirty;n++){
      assert.ok(n<20,'component should settle')
      dirty=false;cursor=0;tree=Game({onExit(){}})
      for(const effect of effects)if(effect?.pending){effect.pending=false;effect.cleanup?.();effect.cleanup=effect.run()}
    }
    return tree
  }
  t.after(()=>{for(const effect of effects)effect?.cleanup?.()})
  flush()
  return{flush,sockets,get tree(){return tree},runTimers(){const pending=[...timers];timers.clear();for(const [,run]of pending)run();flush()}}
}
function nodes(node){
  if(Array.isArray(node))return node.flatMap(nodes)
  if(!node||typeof node!=='object')return[]
  return[node,...nodes(node.props?.children)]
}
function text(node){if(Array.isArray(node))return node.map(text).join('');return typeof node==='object'&&node?text(node.props?.children):String(node??'')}
function click(view,label){const button=nodes(view.tree).find(n=>n.type==='button'&&text(n)===label);assert.ok(button,`button ${label} exists`);button.props.onClick();view.flush()}
function board(view){return nodes(view.tree).find(n=>typeof n.type==='function'&&n.type.name==='CaroBoard').props}

test('Caro computer completes a turn after the thinking render',t=>{
  const view=mount(t)
  board(view).onCellClick(7,7);view.flush()
  assert.match(text(view.tree),/Máy đang suy nghĩ/)
  view.runTimers()
  assert.equal(board(view).board.flat().filter(cell=>cell===caro.O_PLAYER).length,1)
  assert.match(text(view.tree),/Lượt của bạn/)
})
test('reset cancels a pending computer move',t=>{
  const view=mount(t)
  board(view).onCellClick(7,7);view.flush()
  click(view,'Ván mới');view.runTimers()
  assert.equal(board(view).board.flat().every(cell=>cell===caro.EMPTY),true)
})
for(const winner of [caro.X_PLAYER,caro.O_PLAYER])test(`online O sees the right name when ${winner===caro.O_PLAYER?'winning':'losing'}`,t=>{
  const view=mount(t)
  click(view,'◎Online')
  click(view,'Tạo phòng mới')
  const socket=view.sockets.at(-1)
  socket.onmessage({data:JSON.stringify({type:'caro_state',code:'ABCDEF',player:caro.O_PLAYER,status:'playing',board:caro.createEmptyBoard(),currentPlayer:caro.X_PLAYER,history:[],winner})})
  view.flush()
  const dialog=nodes(view.tree).find(n=>n.props?.className==='result-modal caro-modal')
  const title=nodes(dialog).find(n=>n.type==='h2')
  assert.equal(text(title),`${winner===caro.O_PLAYER?'Bạn':'Đối thủ'} chiến thắng!`)
})
