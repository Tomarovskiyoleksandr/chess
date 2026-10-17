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
class Chess { board(){return Array.from({length:8},()=>Array(8).fill(null));} fen(){return 'current FEN';} turn(){return position.turn;} history(){return position.history;} get(){return {type:'p'};} isGameOver(){return false;} moves(){return [{from:'e2',to:'e4'},{from:'d2',to:'d4'}];} move(m){return {san:m.to};} }
const context=vm.createContext({document:{documentElement:{},querySelector:()=>({}),querySelectorAll:s=>elements.filter(e=>Object.hasOwn(e.attrs,s.slice(1,-1))),getElementById:id=>ids[id],createElement:()=>new Element()},window:{},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},console:{log(){},error(){}},Chess,fetch:async()=>({ok:true,text:async()=>''}),Blob:class{},URL:{createObjectURL:()=>''},Worker:class{constructor(){worker=this;this.sent=[];}postMessage(message){this.sent.push(message);}terminate(){this.terminated=true;}},alert(){}});
const i18n=fs.readFileSync('i18n.js','utf8');
vm.runInContext(i18n,context);
const source=fs.readFileSync('chess.js','utf8').replace(/const \{ Chess \} = await import\([\s\S]*?\);/,'const { Chess } = globalThis;');
(async()=>{
 await vm.runInContext(source,context);
 await new Promise(resolve=>setImmediate(resolve));
 const change=lang=>ids.languageSelect.listeners.change({target:{value:lang}});
 worker.onmessage({data:'readyok'});
 assert.equal(worker.sent.at(-1),'go depth 14');
 change('de');assert.equal(context.document.documentElement.lang,'de');
 worker.onmessage({data:'info depth 14 score cp 32'});
 worker.onmessage({data:'bestmove e2e4'});
 ids.fenInput.value='unsaved FEN';
 for(const [lang,piece] of [['en','Pawn'],['uk','Пішак'],['ru','Пешка'],['de','Bauer']]){
  change(lang);assert.equal(context.document.documentElement.lang,lang);assert.equal(ids.bestMove.textContent,`${piece} e2 → e4`);assert.equal(ids.evaluation.textContent,'+0.32');assert.equal(ids.fenInput.value,'unsaved FEN');
 }
 context.window.i18n.literal(ids.moves,'1. e4 e5');change('en');assert.equal(ids.moves.textContent,'1. e4 e5');
 const stockfish=worker;
 ids.maiaCount.value='3';
 ids.maiaTab.listeners.click();
 const maia=worker;
 assert.equal(ids.maiaSettings.hidden,false);
 assert.equal(ids.stockfishSettings.hidden,true);
 maia.onmessage({data:{type:'ready'}});
 const first=maia.sent.at(-1);
 assert.equal(first.elo,1500);
 assert.equal(first.fen,'current FEN');
 ids.maiaLevel.value='2000';ids.maiaLevel.listeners.input();
 maia.onmessage({data:{type:'result',id:first.id,moves:[{move:'e2e4',probability:1}],value:.6}});
 const next=maia.sent.at(-1);
 assert.equal(next.elo,2000);
 maia.onmessage({data:{type:'result',id:next.id,moves:[{move:'e2e4',probability:.7},{move:'d2d4',probability:.3}],value:.6}});
 assert.equal(ids.evaluation.textContent,'60.0%');
 assert.equal(ids.variantList.children.length,2);
 ids.variantList.children[1].listeners.click();
 assert.equal(ids.bestMove.textContent,'Pawn d2 → d4');
 ids.stockfishTab.listeners.click();
 assert.equal(ids.maiaSettings.hidden,true);
 ids.maiaTab.listeners.click();
 stockfish.onmessage({data:'info depth 12 score cp 999'});
 stockfish.onmessage({data:'bestmove e2e4'});
 assert.equal(ids.bestMove.textContent,'Analyzing...');
 assert.equal(ids.evaluation.textContent,'…');
 maia.onmessage({data:{type:'error',id:maia.sent.at(-1).id,message:'test failure'}});
 assert.equal(maia.terminated,true);
 ids.stockfishTab.listeners.click();
 ids.maiaTab.listeners.click();
 assert.notEqual(worker,maia);
 assert.equal(storage.get('monsterchess.language'),'en');
 vm.runInContext(i18n,context);assert.equal(context.document.documentElement.lang,'en');
 storage.set('monsterchess.language','invalid');vm.runInContext(i18n,context);assert.equal(context.document.documentElement.lang,'ru');
 console.log('PASS: 4 languages; Maia rating, alternatives, retries; stale Maia/Stockfish results ignored; score/FEN/history preservation; persistence.');
})().catch(e=>{console.error(e);process.exitCode=1;});
