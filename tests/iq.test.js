import test from 'node:test'
import assert from 'node:assert/strict'
import {IQ_QUESTIONS,IQ_CATEGORIES,selectIqQuestions,mergeIqHistory} from '../src/iq.js'

test('IQ bank contains 144 unique, complete questions across six balanced disciplines',()=>{
  assert.equal(IQ_QUESTIONS.length,144)
  assert.equal(new Set(IQ_QUESTIONS.map(q=>q.id)).size,144)
  assert.equal(new Set(IQ_QUESTIONS.map(q=>q.question)).size,144)
  const groups=new Map()
  for(const q of IQ_QUESTIONS){
    assert.equal(q.answers.length,4,q.question)
    assert.equal(new Set(q.answers).size,4,q.question)
    assert.ok(Number.isInteger(q.correct)&&q.correct>=0&&q.correct<4)
    assert.ok(q.explanation.trim().length>0&&q.answers.every(answer=>answer.trim().length>0))
    groups.set(q.category,(groups.get(q.category)||0)+1)
  }
  assert.deepEqual(new Set(IQ_CATEGORIES),new Set(['Toán học','Logic','Địa lý','Lịch sử','Văn học','Văn hóa']))
  assert.equal(groups.size,6)
  assert.ok([...groups.values()].every(count=>count===24))
})
test('a round mixes topics and shuffles options without changing the correct answer or bank',()=>{
  const before=structuredClone(IQ_QUESTIONS)
  for(const count of [5,10,15]){
    const questions=selectIqQuestions(count,[],()=>0),groups=new Map()
    assert.equal(new Set(questions.map(q=>q.id)).size,count)
    assert.equal(new Set(questions.map(q=>q.category)).size,Math.min(count,6))
    for(const q of questions){
      const original=IQ_QUESTIONS.find(item=>item.id===q.id)
      assert.equal(q.answers[q.correct],original.answers[original.correct])
      assert.notDeepEqual(q.answers,original.answers)
      groups.set(q.category,(groups.get(q.category)||0)+1)
    }
    assert.ok(Math.max(...groups.values())-Math.min(...groups.values())<=1)
  }
  assert.deepEqual(IQ_QUESTIONS,before)
})
test('rounds exhaust the bank before repeats and keep repeated topics balanced',()=>{
  let history=[]
  while(history.length<IQ_QUESTIONS.length){
    const questions=selectIqQuestions(Math.min(15,IQ_QUESTIONS.length-history.length),history)
    assert.ok(questions.every(question=>!history.includes(question.id)))
    history=mergeIqHistory(history,questions.map(q=>q.id))
  }
  assert.equal(history.length,144)
  const next=selectIqQuestions(15,history)
  const counts=IQ_CATEGORIES.map(category=>next.filter(q=>q.category===category).length)
  assert.ok(Math.max(...counts)-Math.min(...counts)<=1)
  for(const category of IQ_CATEGORIES){
    const ids=history.filter(id=>IQ_QUESTIONS.find(q=>q.id===id).category===category)
    assert.deepEqual(next.filter(q=>q.category===category).map(q=>q.id),ids.slice(0,next.filter(q=>q.category===category).length))
  }
  history=mergeIqHistory(history,next.map(q=>q.id))
  assert.ok(selectIqQuestions(15,history).every(q=>!next.some(last=>last.id===q.id)))
})
test('near exhaustion, fresh questions come first and a batch never repeats itself',()=>{
  const history=IQ_QUESTIONS.slice(0,-3).map(q=>q.id)
  const round=selectIqQuestions(15,history)
  assert.ok(round.slice(0,3).every(q=>!history.includes(q.id)))
  assert.equal(new Set(round.map(q=>q.id)).size,15)
})
test('history accepts only valid ids, keeps the most recent order, and fits a WebSocket command',()=>{
  assert.deepEqual(mergeIqHistory(null,{}),[])
  assert.deepEqual(mergeIqHistory(['iq-1','iq-2','bad'],['iq-1',null,{},'iq-3']),['iq-2','iq-1','iq-3'])
  const history=mergeIqHistory([],[...IQ_QUESTIONS.map(q=>q.id),...Array(2000).fill('unknown')])
  assert.equal(history.length,144)
  assert.ok(Buffer.byteLength(JSON.stringify({type:'iq_create',name:'Player',seenQuestions:history}))<16000)
  assert.equal(selectIqQuestions(5,['unknown',null,{}]).length,5)
  assert.throws(()=>selectIqQuestions(IQ_QUESTIONS.length+1),RangeError)
})

test('revised deduction puzzles have exactly one valid solution',()=>{
  const answer=id=>{const q=IQ_QUESTIONS.find(q=>q.id===id);return q.answers[q.correct]}
  const boxes=['A','B','C'].filter(treasure=>[treasure==='A',treasure!=='B',treasure!=='A'].filter(Boolean).length===1)
  assert.deepEqual(boxes,['B'])
  assert.equal(answer('iq-40'),`Hộp ${boxes[0]}`)
  const suspects=['An','Bình','Chi'].filter(guilty=>[guilty!=='An',guilty==='An',guilty!=='Bình'].filter(Boolean).length===1)
  assert.deepEqual(suspects,['Bình'])
  assert.equal(answer('iq-41'),suspects[0])
})
test('revised probability, clock, code and spatial answers match independent calculations',()=>{
  const answer=id=>{const q=IQ_QUESTIONS.find(q=>q.id===id);return q.answers[q.correct]}
  let redPairs=0,pairs=0
  for(let a=0;a<5;a++)for(let b=a+1;b<5;b++){pairs++;if(a<3&&b<3)redPairs++}
  assert.equal(answer('iq-88'),`${redPairs}/${pairs}`)
  const twoHeads=Array.from({length:8},(_,mask)=>mask.toString(2).split('').filter(bit=>bit==='1').length).filter(count=>count===2).length
  assert.equal(answer('iq-89'),`${twoHeads}/8`)
  assert.equal(answer('iq-117'),`${Math.abs(3.5*30-30*6)}°`)
  assert.equal(answer('iq-33'),`${10/(6-1)*(12-1)} giây`)
  const shifted=[...'YAZ'].map(char=>String.fromCharCode(65+(char.charCodeAt(0)-65+2)%26)).join('')
  assert.equal(answer('iq-64'),shifted)
  let paintedOnTwoFaces=0
  for(let x=0;x<3;x++)for(let y=0;y<3;y++)for(let z=0;z<3;z++)if([x,y,z].filter(value=>value===0||value===2).length===2)paintedOnTwoFaces++
  assert.equal(Number(answer('iq-76')),paintedOnTwoFaces)
  const date=new Date(Date.UTC(2025,1,20));date.setUTCDate(date.getUTCDate()+10)
  assert.equal(answer('iq-119'),`${date.getUTCDate()}/${date.getUTCMonth()+1}`)
})
