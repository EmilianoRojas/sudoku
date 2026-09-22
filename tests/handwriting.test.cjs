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

test('ordered stroke matching distinguishes 5 and 6 from 8 templates',()=>{
  const run=load();
  for (const digit of [5,6,8]) {
    const result=run(`recognizeDigit([DIGIT_TEMPLATES[${digit}][0]])`);
    assert.equal(result.digit,digit);
    // Affine changes should not affect centered normalized recognition.
    const transformed=run(`recognizeDigit([DIGIT_TEMPLATES[${digit}][0].map(([x,y])=>[2*x+18,2*y-11])])`);
    assert.equal(transformed.digit,digit);
  }
});
test('5, 6, and 8 require confirmation rather than automatic entry',()=>{
  const script=fs.readFileSync(path.join(__dirname,'..','handwriting.js'),'utf8');
  assert.match(script,/!\[5,6,8\]\.includes\(guess\.digit\)/);
});
test('writing highlights immediately, without re-rendering the board',()=>{
  const script=fs.readFileSync(path.join(__dirname,'..','handwriting.js'),'utf8');
  const start=script.slice(script.indexOf('function startInk'),script.indexOf('function moveInk'));
  assert.match(start,/classList\.add\('selected','writing'\)/);
  assert.doesNotMatch(start,/renderBoard\(/);
});
