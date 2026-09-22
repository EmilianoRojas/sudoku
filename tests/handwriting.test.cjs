'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function runModel() {
  const ctx={atob,Float32Array,Math};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','digit-model.js'),'utf8'),ctx);
  return code=>vm.runInContext(code,ctx);
}
test('model loads four correctly sized quantized parameter tensors',()=>{
  const run=runModel();
  assert.equal(run('DIGIT_MODEL_WEIGHTS.map(w=>w.length).join(",")'),'2048,32,320,10');
});
test('recognizes representative handwritten digits 1, 5, 6 and 8',()=>{
  const run=runModel();
  const fixtures={
    1:'000cd500000bg900003fg60007fgg200001gg300001gg600001gg600000bga00',
    5:'05cdgg200bgf840008eb100008gge0000166g0000005g300015fd00004fg2000',
    6:'000cd000005g800000dg300000ed000000fc720000dgdg30007gbf800019fb30',
    8:'009e810000ceec00009a0f40003gce20004gg20003g8ad2001f13g8000bgfb10'
  };
  for(const [expected,encoded] of Object.entries(fixtures)){
    const pixels=[...encoded].map(ch=>parseInt(ch,17)/16);
    assert.equal(run('classifyDigitPixels('+JSON.stringify(pixels)+')'),Number(expected));
  }
});
test('Sudoku classifier never predicts zero',()=>{
  const run=runModel();
  const zeros=Array(64).fill(0);
  const result=run('classifyDigitPixels('+JSON.stringify(zeros)+')');
  assert.ok(result>=1 && result<=9);
});
test('blank or tiny pen strokes are ignored',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','handwriting.js'),'utf8');
  assert.match(source,/if \(all\.length < 3\) return null/);
  assert.match(source,/if \(Math\.max\(width,height\)<3\) return null/);
});
test('no confirmation UI and handwriting commits directly',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','handwriting.js'),'utf8');
  assert.doesNotMatch(source,/showCandidates|handwritingPrompt/);
  assert.match(source,/if\(digit!==null\)acceptHandwriting\(digit\)/);
});
test('active pen highlighting still avoids re-rendering',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','handwriting.js'),'utf8');
  const start=source.slice(source.indexOf('function startInk'),source.indexOf('function moveInk'));
  assert.match(start,/classList\.add\('selected','writing'\)/);
  assert.doesNotMatch(start,/renderBoard\(/);
});
