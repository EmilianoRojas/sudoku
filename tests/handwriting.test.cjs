'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const stub=()=>({addEventListener(){},setAttribute(){},replaceChildren(){},appendChild(){},classList:{add(){}},hidden:true});
function load() {
  const doc={getElementById:()=>stub()};
  const ctx={document:doc,Math,Set,Array,JSON,clearTimeout(){}};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','handwriting.js'),'utf8'),ctx);
  return code=>vm.runInContext(code,ctx);
}
test('recognizes each of the nine template digit shapes',()=>{
  const run=load();
  for(let n=1;n<=9;n++) {
    const got=run(`recognizeDigit(${n}===4 ? DIGIT_TEMPLATES[4][0] : [DIGIT_TEMPLATES[${n}][0]])?.digit`);
    assert.equal(got,n,'digit '+n);
  }
});
test('empty handwriting does not create a digit',()=>{
  const run=load();
  assert.equal(run('recognizeDigit([])'),null);
});
test('recognizer does not depend on network or ML downloads',()=>{
  const script=fs.readFileSync(path.join(__dirname,'..','handwriting.js'),'utf8');
  assert.doesNotMatch(script,/fetch\(|XMLHttpRequest|import\(/);
});
