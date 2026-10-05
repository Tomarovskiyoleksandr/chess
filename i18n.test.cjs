const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html','utf8');
class Element {
  constructor(attrs = {}) { this.attrs=attrs; this.dataset={}; for(const [k,v] of Object.entries(attrs)) if(k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v; this.textContent='';this.value=attrs.value||'';this.listeners={};this.children=[];this.classList={add(){},toggle(){}}; }
  setAttribute(k,v){this.attrs[k]=v;}
  removeAttribute(k){delete this.attrs[k];}
  addEventListener(k,fn){this.listeners[k]=fn;}
  appendChild(el){this.children.push(el);}
  set innerHTML(v){this.children=[];}
}
const elements=[...html.matchAll(/<[a-z][^>]*>/g)].map(m=>new Element(Object.fromEntries([...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]]))));
const ids=Object.fromEntries(elements.filter(e=>e.attrs.id).map(e=>[e.attrs.id,e]));
const storage=new Map();
let worker;
const position={turn:'w',history:[]};
class Chess { board(){return Array.from({length:8},()=>Array(8).fill(null));} fen(){return 'current FEN';} turn(){return position.turn;} history(){return position.history;} get(){return {type:'p'};} isGameOver(){return false;} }
const context=vm.createContext({document:{documentElement:{},querySelector:()=>({}),querySelectorAll:s=>elements.filter(e=>Object.hasOwn(e.attrs,s.slice(1,-1))),getElementById:id=>ids[id],createElement:()=>new Element()},window:{},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},console:{log(){},error(){}},Chess,fetch:async()=>({ok:true,text:async()=>''}),Blob:class{},URL:{createObjectURL:()=>''},Worker:class{constructor(){worker=this;}postMessage(){}},alert(){}});
const i18n=fs.readFileSync('i18n.js','utf8');
vm.runInContext(i18n,context);
const source=fs.readFileSync('chess.js','utf8').replace(/const \{ Chess \} = await import\([\s\S]*?\);/,'const { Chess } = globalThis;');
(async()=>{
 await vm.runInContext(source,context);
 await new Promise(resolve=>setImmediate(resolve));
 const change=lang=>ids.languageSelect.listeners.change({target:{value:lang}});
 worker.onmessage({data:'readyok'});
 ids.analyzeBtn.listeners.click();
 change('de');assert.equal(ids.analyzeBtn.textContent,'Analysiere...');assert.equal(ids.analyzeBtn.disabled,true);
 worker.onmessage({data:'info depth 14 score cp 32'});
 worker.onmessage({data:'bestmove e2e4'});
 ids.fenInput.value='unsaved FEN';
 for(const [lang,piece] of [['en','Pawn'],['uk','Пішак'],['ru','Пешка'],['de','Bauer']]){
  change(lang);assert.equal(context.document.documentElement.lang,lang);assert.equal(ids.bestMove.textContent,`${piece} e2 → e4`);assert.equal(ids.evaluation.textContent,'+0.32');assert.equal(ids.fenInput.value,'unsaved FEN');assert.equal(ids.analyzeBtn.disabled,false);
 }
 context.window.i18n.literal(ids.moves,'1. e4 e5');change('en');assert.equal(ids.moves.textContent,'1. e4 e5');
 assert.equal(storage.get('monsterchess.language'),'en');
 vm.runInContext(i18n,context);assert.equal(context.document.documentElement.lang,'en');
 storage.set('monsterchess.language','invalid');vm.runInContext(i18n,context);assert.equal(context.document.documentElement.lang,'ru');
 console.log('PASS: 4 languages, live analysis switching, move translation, score/FEN/history preservation, persistence and invalid-language fallback.');
})().catch(e=>{console.error(e);process.exitCode=1;});
