import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import {createServer} from 'vite'
import WebSocket from 'ws'
import {IQ_QUESTIONS} from '../src/iq.js'

test('browser layouts fit desktop, tablet and mobile; occupied Caro cells stay square',{timeout:60000},async t=>{
  const profile=await mkdtemp(path.join(tmpdir(),'xiangqi-layout-'))
  const chrome=spawn(process.env.CHROME_BIN||'google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-extensions','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']})
  let vite,ws,backend
  const peers=[]
  try{
    const endpoint=await new Promise((resolve,reject)=>{
      let output=''
      const timer=setTimeout(()=>reject(Error(`Chrome startup failed: ${output}`)),10000)
      chrome.once('error',error=>{clearTimeout(timer);reject(error)})
      chrome.stderr.on('data',data=>{output+=data;const match=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1])}})
    }).catch(error=>{if(error.code==='ENOENT'){t.skip('Install Chrome or set CHROME_BIN to run browser layout checks');return null}throw error})
    if(!endpoint)return
    backend=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']})
    const [serverOutput]=await once(backend.stdout,'data',{signal:AbortSignal.timeout(5000)})
    const backendUrl=String(serverOutput).trim().replace('Doan Dai Hiep server: http://0.0.0.0:','ws://127.0.0.1:')
    vite=await createServer({root:new URL('..',import.meta.url).pathname,define:{'import.meta.env.VITE_WS_URL':JSON.stringify(backendUrl)},server:{host:'127.0.0.1',port:0}})
    await vite.listen()
    const targets=await(await fetch(`http://127.0.0.1:${new URL(endpoint).port}/json/list`)).json()
    ws=new WebSocket(targets.find(target=>target.type==='page').webSocketDebuggerUrl)
    await once(ws,'open')
    let id=0
    const pending=new Map(),errors=[]
    ws.on('message',raw=>{
      const message=JSON.parse(raw)
      if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails)
      if(message.id){const request=pending.get(message.id);pending.delete(message.id);message.error?request.reject(message.error):request.resolve(message.result)}
    })
    const call=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})
    const evaluate=async expression=>{
      const response=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
      assert.equal(response.exceptionDetails,undefined,JSON.stringify(response.exceptionDetails))
      return response.result.value
    }
    async function waitFor(expression){
      for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(25)}
      assert.fail(`Page did not become ready: ${expression}; ${await evaluate("document.body.innerText")}`)
    }
    async function fits(label){
      const layout=await evaluate(`(()=>{
        const outside=[...document.querySelectorAll('main button,main input,main h1,main h2,.panel')].filter(element=>{
          if(element.closest('.category-tabs,.iq-scoreboard'))return false;
          const rect=element.getBoundingClientRect();return rect.width&&(rect.left< -1||rect.right>innerWidth+1)
        }).map(element=>element.className||element.tagName);
        return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,outside}
      })()`)
      assert.ok(layout.scrollWidth<=layout.width+1,`${label} overflows: ${JSON.stringify(layout)}`)
      assert.deepEqual(layout.outside,[],`${label} has controls outside the viewport`)
    }
    async function squares(label){
      const dimensions=await evaluate(`(()=>{
        const board=document.querySelector('.caro-board').getBoundingClientRect();
        return {board:{width:board.width,height:board.height},cells:[...document.querySelectorAll('.caro-cell')].map(element=>{
          const rect=element.getBoundingClientRect();return {width:rect.width,height:rect.height}
        }),pieces:[...document.querySelectorAll('.piece-x,.piece-o')].map(element=>{
          const rect=element.getBoundingClientRect(),cell=element.parentElement.getBoundingClientRect();
          return {width:rect.width,height:rect.height,cellWidth:cell.width,cellHeight:cell.height}
        })}
      })()`)
      assert.equal(dimensions.cells.length,225)
      assert.ok(Math.abs(dimensions.board.width-dimensions.board.height)<1,`${label}: board must be square`)
      for(const cell of dimensions.cells)assert.ok(Math.abs(cell.width-cell.height)<0.1,`${label}: occupied and empty cells must be square: ${JSON.stringify(cell)}`)
      for(const piece of dimensions.pieces){assert.ok(Math.abs(piece.width-piece.height)<0.1,`${label}: piece must be round: ${JSON.stringify(piece)}`);assert.ok(piece.width<=piece.cellWidth&&piece.height<=piece.cellHeight)}
    }
    await call('Page.enable');await call('Runtime.enable')
    for(const width of [360,768,1024,1280]){
      await call('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false})
      for(const [route,selector]of [['caro','.caro-board'],['xiangqi','.board'],['werewolf','.online-entry-card'],['iq','.iq-setup'],['','.hub-hero']]){
        await call('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/?layout=${width}-${route}#${route}`})
        await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`)
        await fits(`${route||'hub'} at ${width}px`)
        if(route==='caro'){
          await evaluate(`[...document.querySelectorAll('.mode-switch button')].find(button=>button.textContent.includes('Cùng máy')).click()`)
          await waitFor(`document.querySelector('.mode-switch .active').textContent.includes('Cùng máy')`)
          // Populate several different rows without ending the game.
          for(const index of [48,63,49,64,50,65,79,80,95,96,111,112]){
            await evaluate(`document.querySelectorAll('.caro-cell')[${index}].click()`)
            await delay(20)
          }
          await delay(300)
          await squares(`Caro at ${width}px`);await fits(`occupied Caro at ${width}px`)
          const screenshot=await call('Page.captureScreenshot',{format:'png'})
          await writeFile(path.join(tmpdir(),`xiangqi-caro-${width}.png`),Buffer.from(screenshot.data,'base64'))
        }
        if(route==='iq'){
          assert.deepEqual(await evaluate(`[...document.querySelectorAll('.iq-subject-fields select')[0].options].map(o=>o.textContent)`),['Môn học'])
          assert.equal(await evaluate(`document.querySelectorAll('.iq-subject-fields select')[1].options.length`),8)
          await evaluate(`(()=>{const select=document.querySelectorAll('.iq-subject-fields select')[1];select.value='Vật lý';select.dispatchEvent(new Event('change',{bubbles:true}))})()`)
          const entryShot=await call('Page.captureScreenshot',{format:'png'})
          await writeFile(path.join(tmpdir(),`xiangqi-iq-entry-${width}.png`),Buffer.from(entryShot.data,'base64'))
          await evaluate(`(()=>{const input=document.querySelector('.iq-room-form>label input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Browser host');input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
          await evaluate(`document.querySelector('.iq-start').click()`)
          await waitFor(`!!document.querySelector('.iq-room-lobby')`)
          await fits(`IQ lobby at ${width}px`)
          const code=await evaluate(`document.querySelector('.iq-room-code strong').textContent`)
          const guest=new WebSocket(backendUrl);peers.push(guest)
          let guestState
          guest.on('message',raw=>{const data=JSON.parse(raw);if(data.type==='iq_state')guestState=data})
          await once(guest,'open')
          guest.send(JSON.stringify({type:'iq_join',code,name:'Guest'}))
          await waitFor(`document.querySelectorAll('.iq-final-ranking>div').length===2`)
          await evaluate(`document.querySelector('.iq-room-lobby .iq-start').click()`)
          await waitFor(`!!document.querySelector('.iq-answers')`)
          await fits(`IQ online question at ${width}px`)
          const questionShot=await call('Page.captureScreenshot',{format:'png'})
          await writeFile(path.join(tmpdir(),`xiangqi-iq-question-${width}.png`),Buffer.from(questionShot.data,'base64'))
          for(let i=0;i<100&&guestState?.phase!=='question';i++)await delay(25)
          assert.equal(guestState?.phase,'question')
          assert.equal(guestState.subject,'Vật lý')
          assert.equal(guestState.question.category,'Vật lý')
          assert.ok((await evaluate(`JSON.parse(localStorage.getItem('iq_seen_questions'))`)).includes(guestState.question.key))
          const original=IQ_QUESTIONS.find(q=>q.question===guestState.question.question)
          const correct=guestState.question.answers.indexOf(original.answers[original.correct])
          await evaluate(`document.querySelectorAll('.iq-answers button')[${correct}].click()`)
          await waitFor(`!document.querySelector('.iq-lock').disabled`)
          await evaluate(`document.querySelector('.iq-lock').click()`)
          await waitFor(`!document.querySelector('.iq-lock')`)
          guest.send(JSON.stringify({type:'iq_answer',questionId:guestState.question.id,answer:correct}))
          await waitFor(`!!document.querySelector('.iq-reveal')`)
          await fits(`IQ online reveal at ${width}px`)
          const screenshot=await call('Page.captureScreenshot',{format:'png'})
          await writeFile(path.join(tmpdir(),`xiangqi-iq-online-${width}.png`),Buffer.from(screenshot.data,'base64'))
          await evaluate(`document.querySelector('.iq-reveal>button').click()`)
          await waitFor(`!!document.querySelector('.iq-answers')`)
          // Leave and rejoin through the actual room-code form; the private token restores the seat.
          await evaluate(`document.querySelector('.iq-switch-mode').click()`)
          await waitFor(`!!document.querySelector('.iq-room-form')`)
          for(let i=0;i<100&&guestState.players.find(player=>player.name==='Browser host')?.connected;i++)await delay(25)
          assert.equal(guestState.players.find(player=>player.name==='Browser host')?.connected,false)
          await evaluate(`document.querySelector('.iq-entry-tabs button[data-mode="join"]').click()`)
          await waitFor(`!!document.querySelector('.iq-join-row input')`)
          await evaluate(`(()=>{const input=document.querySelector('.iq-join-row input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(code)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
          await waitFor(`!document.querySelector('.iq-join-row button').disabled`)
          await evaluate(`document.querySelector('.iq-join-row button').click()`)
          await waitFor(`!!document.querySelector('.iq-answers')`)
          await fits(`IQ rejoined question at ${width}px`)
          await evaluate(`document.querySelector('.iq-switch-mode').click()`)
          await waitFor(`!!document.querySelector('.iq-room-form')`)
          guest.close()
          await evaluate(`document.querySelector('.iq-switch-mode').click()`)

          await waitFor(`!!document.querySelector('.iq-name-list')`)
          await evaluate(`(()=>{const select=document.querySelectorAll('.iq-subject-fields select')[1];select.value='Hóa học';select.dispatchEvent(new Event('change',{bubbles:true}))})()`)
          await evaluate(`document.querySelector('.iq-start').click()`)
          await waitFor(`!!document.querySelector('.iq-handoff')`);await fits(`IQ handoff at ${width}px`)
          await evaluate(`document.querySelector('.iq-handoff button').click()`)
          await waitFor(`!!document.querySelector('.iq-answers')`);assert.equal(await evaluate(`document.querySelector('.iq-question-top>span').textContent`),'Hóa học');await fits(`IQ question at ${width}px`)
          assert.notEqual(await evaluate(`document.querySelector('.iq-question-card>h2').textContent`),guestState.question.question)
        }
      }
    }
    assert.deepEqual(errors,[],'no browser runtime errors')
  }finally{
    peers.forEach(peer=>peer.terminate())
    if(backend){const exited=backend.exitCode===null?once(backend,'exit'):null;backend.kill('SIGKILL');if(exited)await exited}
    ws?.terminate()
    const exited=chrome.exitCode===null&&chrome.pid?once(chrome,'exit'):null
    chrome.kill('SIGKILL');if(exited)await exited
    await vite?.close()
    await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})
  }
})
