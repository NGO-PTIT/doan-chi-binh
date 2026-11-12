import test from 'node:test'
import assert from 'node:assert/strict'
import {IQ_QUESTIONS,IQ_CATEGORIES,selectIqQuestions,mergeIqHistory} from '../src/iq.js'

test('IQ bank contains 168 unique, complete questions across seven school subjects',()=>{
  assert.equal(IQ_QUESTIONS.length,168)
  assert.equal(new Set(IQ_QUESTIONS.map(q=>q.id)).size,168)
  assert.equal(new Set(IQ_QUESTIONS.map(q=>q.question)).size,168)
  const groups=new Map()
  for(const q of IQ_QUESTIONS){
    assert.equal(q.answers.length,4,q.question)
    assert.equal(new Set(q.answers).size,4,q.question)
    assert.ok(Number.isInteger(q.correct)&&q.correct>=0&&q.correct<4)
    assert.ok(q.explanation.trim().length>0&&q.answers.every(answer=>answer.trim().length>0))
    assert.ok([10,11,12].includes(q.grade),q.question)
    assert.ok(q.topic.trim().length>0,q.question)
    groups.set(q.category,(groups.get(q.category)||0)+1)
  }
  assert.deepEqual(new Set(IQ_CATEGORIES),new Set(['Toán học','Vật lý','Hóa học','Ngữ văn','Lịch sử','Địa lý','Sinh học']))
  assert.equal(groups.size,7)
  assert.ok([...groups.values()].every(count=>count===24))
  for(const category of IQ_CATEGORIES)assert.deepEqual(new Set(IQ_QUESTIONS.filter(q=>q.category===category).map(q=>q.grade)),new Set([10,11,12]))
})
test('a round mixes topics and shuffles options without changing the correct answer or bank',()=>{
  const before=structuredClone(IQ_QUESTIONS)
  for(const count of [5,10,15]){
    const questions=selectIqQuestions(count,[],()=>0),groups=new Map()
    assert.equal(new Set(questions.map(q=>q.id)).size,count)
    assert.equal(new Set(questions.map(q=>q.category)).size,Math.min(count,7))
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
  assert.equal(history.length,168)
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
  assert.deepEqual(mergeIqHistory(['vn2018-1','vn2018-2','bad'],['vn2018-1',null,{},'vn2018-3']),['vn2018-2','vn2018-1','vn2018-3'])
  const history=mergeIqHistory([],[...IQ_QUESTIONS.map(q=>q.id),...Array(2000).fill('unknown')])
  assert.equal(history.length,168)
  assert.ok(Buffer.byteLength(JSON.stringify({type:'iq_create',name:'Player',seenQuestions:history}))<16000)
  assert.equal(selectIqQuestions(5,['unknown',null,{}]).length,5)
  assert.throws(()=>selectIqQuestions(IQ_QUESTIONS.length+1),RangeError)
})

const answer=(category,index)=>{
  const question=IQ_QUESTIONS.filter(q=>q.category===category)[index-1]
  return question.answers[question.correct]
}

test('curriculum math answers agree with independent calculations',()=>{
  const numeric=(index)=>Number(answer('Toán học',index))
  const negative=[]
  for(const x of [0,1,2,2.5,3,4,5])if(x*x-5*x+6<0)negative.push(x)
  assert.deepEqual(negative,[2.5])
  assert.equal(answer('Toán học',2),'(2; 3)')
  const heights=Array.from({length:401},(_,i)=>i/100).map(x=>-x*x+4*x)
  assert.equal(answer('Toán học',3),`${Math.max(...heights)} m`)
  const groups=[]
  for(let a=0;a<9;a++)for(let b=a+1;b<9;b++)for(let c=b+1;c<9;c++)if([a,b,c].filter(i=>i>=5).length===2)groups.push([a,b,c])
  assert.equal(numeric(7),groups.length)
  assert.equal(numeric(10),Array.from({length:20},(_,i)=>3+i*2).reduce((sum,n)=>sum+n,0))
  assert.equal(answer('Toán học',11),(10*1.05**2).toFixed(3).replace('.',','))
  assert.equal(numeric(18),Math.max(...Array.from({length:61},(_,i)=>{const x=i/10;return x*(6-x)})))
  const slices=10000,area=Array.from({length:slices},(_,i)=>{const x=(i+0.5)/slices;return (x-x*x)/slices}).reduce((a,b)=>a+b,0)
  assert.ok(Math.abs(area-1/6)<1e-8)
  assert.equal(answer('Toán học',20),'1/6')
  assert.equal(answer('Toán học',23),`${8/2}/${10/2}`)
  assert.equal(answer('Toán học',24),`${((0.6*0.02+0.4*0.05)*100).toFixed(1).replace('.',',')}%`)
})

test('subject selection stays in the chosen bank before and after exhaustion',()=>{
  for(const subject of IQ_CATEGORIES){
    const bank=IQ_QUESTIONS.filter(q=>q.category===subject)
    const others=IQ_QUESTIONS.filter(q=>q.category!==subject).map(q=>q.id)
    const first=selectIqQuestions(15,others,()=>0,subject)
    const history=mergeIqHistory(others,first.map(q=>q.id))
    const second=selectIqQuestions(15,history,()=>0,subject)
    assert.ok([...first,...second].every(q=>q.category===subject))
    assert.equal(new Set(second.map(q=>q.id)).size,15)
    assert.equal(second.filter(q=>!history.includes(q.id)).length,9)
    assert.ok(second.slice(0,9).every(q=>!history.includes(q.id)))
    const repeated=selectIqQuestions(15,bank.map(q=>q.id),()=>0,subject)
    assert.deepEqual(repeated.map(q=>q.id),bank.slice(0,15).map(q=>q.id))
  }
  for(const subject of ['Logic','Văn hóa','unknown',null,{},[]])assert.throws(()=>selectIqQuestions(5,[],()=>0,subject),RangeError)
  assert.throws(()=>selectIqQuestions(25,[],()=>0,'Vật lý'),RangeError)
})

test('science numerical answers agree with independent calculations',()=>{
  assert.equal(answer('Vật lý',20),`Tăng ${500-200} J`)
  assert.equal(answer('Vật lý',17),`${(0.1*5*0.2).toFixed(1).replace('.',',')} N`)
  assert.equal(answer('Vật lý',19),`${((0.06-0.02)/0.2).toFixed(1).replace('.',',')} V`)
  assert.equal(answer('Vật lý',24),`1/${2**3}`)
  assert.equal(answer('Hóa học',11),`${(0.1*30/20).toFixed(2).replace('.',',')} M`)
  assert.equal(answer('Hóa học',10),`${(0.2/2*64).toFixed(1).replace('.',',')} g`)
  const pH=14+Math.log10((0.1*0.2-0.1*0.1)/(0.1+0.1))
  assert.equal(answer('Hóa học',5),pH.toFixed(2).replace('.',','))
  assert.equal(answer('Sinh học',4),(2*0.3*0.7).toFixed(2).replace('.',','))
  assert.equal(answer('Sinh học',10),String(2*8))
})

test('replaced content is fresh even for players who exhausted the old bank',()=>{
  const previous=[...Array.from({length:120},(_,i)=>`iq-${i+1}`),...Array.from({length:4},(_,c)=>Array.from({length:24},(_,i)=>`knowledge-${c+1}-${i+1}`)).flat()]
  previous.push(...Array.from({length:144},(_,i)=>`advanced-${i+1}`),...Array.from({length:3},(_,c)=>Array.from({length:24},(_,i)=>`school-${c+1}-${i+1}`)).flat())
  assert.deepEqual(mergeIqHistory([],previous),[])
  assert.equal(selectIqQuestions(15,previous).length,15)
})
