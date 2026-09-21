'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function harness() {
  const nodes = new Map();
  function element() {
    return {
      style: {}, classList: { add(){}, remove(){}, toggle(){} },
      addEventListener(){}, setAttribute(){}, querySelector(){return element()},
      appendChild(){}, remove(){}, children: [],
      textContent: '', innerHTML: ''
    };
  }
  const document = {
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); },
    querySelectorAll(){ return []; },
    addEventListener(){}, createElement: element, body: element()
  };
  const values = new Map();
  let tick;
  const sandbox = {
    document, Date, Math, Set, Array, JSON,
    localStorage: { getItem(k){return values.get(k) ?? null}, setItem(k,v){values.set(k,v)} },
    setInterval(fn){ tick=fn; return 1; }, clearInterval(){ tick=null; }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'), sandbox);
  return {run: code => vm.runInContext(code,sandbox), tick: () => tick?.(), nodes};
}
test('generated solution satisfies rows columns and boxes, puzzle is unique', () => {
  const h=harness();
  for (const difficulty of ['easy','medium','hard','evil']) {
    const result=h.run(`generateAttempt('${difficulty}', 123456)`);
    assert.equal(result.solution.length,81);
    const unitOK = indices => indices.map(i=>result.solution[i]).sort().join('') === '123456789';
    for(let k=0;k<9;k++) {
      assert.ok(unitOK(Array.from({length:9},(_,j)=>k*9+j)));
      assert.ok(unitOK(Array.from({length:9},(_,j)=>j*9+k)));
    }
    for(let br=0;br<9;br+=3) for(let bc=0;bc<9;bc+=3)
      assert.ok(unitOK(Array.from({length:9},(_,j)=>(br+Math.floor(j/3))*9+bc+j%3)));
    assert.equal(h.run(`countSol([...${JSON.stringify(result.puzzle)}],2)`),1);
  }
});
test('new game resets timer, and resuming timer preserves it', () => {
  const h=harness();
  h.run('state.timerSeconds=90; startTimer(true)');
  assert.equal(h.run('state.timerSeconds'),0);
  h.tick();
  assert.equal(h.run('state.timerSeconds'),1);
  h.run('startTimer(false)');
  assert.equal(h.run('state.timerSeconds'),1);
});
test('correct placement clears peer notes, preserves unrelated notes', () => {
  const h=harness();
  h.run(`state.solution=buildSolvedGrid(makeRng(5)); state.notes=Array.from({length:81},()=>new Set([1,2,3,4,5,6,7,8,9])); cleanPeerNotes(0,state.solution[0]);`);
  const n=h.run('state.solution[0]');
  assert.equal(h.run(`state.notes[1].has(${n})`),false);
  assert.equal(h.run(`state.notes[9].has(${n})`),false);
  assert.equal(h.run(`state.notes[10].has(${n})`),false);
  assert.equal(h.run(`state.notes[40].has(${n})`),true);
});
test('RNG returns values in [0,1)', () => {
  const h=harness();
  assert.equal(h.run('Array.from({length:1000},makeRng(123)).every(v=>v>=0&&v<1)'),true);
});
