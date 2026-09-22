'use strict';
// Offline digit recognizer for stylus strokes. No server or external model.
// Each template is one or more strokes in a normalized 0..100 coordinate system.
const DIGIT_TEMPLATES = {
  1: [[[45,8],[55,6],[55,92]], [[25,28],[54,7],[54,92]]],
  2: [[[16,26],[28,9],[70,9],[84,25],[77,45],[17,92],[86,92]]],
  3: [[[17,15],[42,6],[77,13],[81,32],[52,50],[78,62],[79,83],[49,94],[17,83]]],
  4: [[[[70,6],[17,67],[89,67]],[[71,7],[71,94]]]],
  5: [[[80,9],[21,9],[19,49],[59,45],[83,62],[78,85],[51,94],[16,83]]],
  6: [[[76,9],[37,23],[17,57],[24,83],[53,94],[79,78],[75,57],[47,49],[19,64]]],
  7: [[[14,11],[86,11],[42,93]]],
  8: [[[51,49],[19,28],[38,8],[67,9],[82,29],[51,49],[18,69],[34,91],[66,91],[84,70],[51,49]]],
  9: [[[75,49],[47,58],[21,41],[23,19],[48,7],[76,22],[76,58],[61,83],[32,94]]]
};
function sampleStroke(points) {
  const sampled = [];
  for (let i=0;i<points.length;i++) {
    if (i === 0) { sampled.push(points[i]); continue; }
    const a=points[i-1], b=points[i], len=Math.hypot(b[0]-a[0],b[1]-a[1]);
    for(let k=1;k<=Math.max(1,Math.ceil(len/3));k++) {
      const t=k/Math.max(1,Math.ceil(len/3));
      sampled.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
    }
  }
  return sampled;
}
function normalizedPoints(strokes) {
  const points=strokes.flatMap(sampleStroke);
  if(!points.length) return [];
  const xs=points.map(p=>p[0]), ys=points.map(p=>p[1]);
  const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
  const w=Math.max(1,maxX-minX), h=Math.max(1,maxY-minY);
  // Preserve aspect ratio to help distinguish 1 from 7 and 0 from 8.
  const scale=80/Math.max(w,h);
  return points.map(p=>[(p[0]-(minX+maxX)/2)*scale+50,(p[1]-(minY+maxY)/2)*scale+50]);
}
function distance(a,b) {
  if(!a.length || !b.length) return Infinity;
  const nearest=p=>Math.min(...b.map(q=>(p[0]-q[0])**2+(p[1]-q[1])**2));
  let sum=0;
  // Symmetric Chamfer distance penalizes both missing and extra strokes.
  for(const p of a) sum+=Math.sqrt(nearest(p));
  let reverse=0;
  for(const p of b) {
    let min=Infinity;
    for(const q of a) min=Math.min(min,(p[0]-q[0])**2+(p[1]-q[1])**2);
    reverse+=Math.sqrt(min);
  }
  return (sum/a.length+reverse/b.length)/200;
}
function recognizeDigit(strokes) {
  const ink=normalizedPoints(strokes);
  if(ink.length<3) return null;
  const scores=Object.entries(DIGIT_TEMPLATES).map(([digit,variants])=>({
    digit:Number(digit),
    score:Math.min(...variants.map(template=>distance(ink,normalizedPoints(
      // Four uses two strokes; other variants represent alternate forms.
      digit==='4' ? template : [template]
    ))))
  })).sort((a,b)=>a.score-b.score);
  return { digit:scores[0].digit, score:scores[0].score, gap:scores[1].score-scores[0].score };
}
const handwriting = { enabled:false, selected:null, strokes:[], active:null, pointer:null, timeout:null, canvas:null, ctx:null, candidate:null, suppressClick:false };
const handwritingBtn = document.getElementById('handwritingBtn');
const handwritingPrompt = document.getElementById('handwritingPrompt');
function clearInk() {
  clearTimeout(handwriting.timeout);
  handwriting.timeout=null;
  handwriting.strokes=[];
  handwriting.active=null;
  handwriting.pointer=null;
  handwriting.selected=null;
  if(handwriting.ctx && handwriting.canvas) handwriting.ctx.clearRect(0,0,handwriting.canvas.width,handwriting.canvas.height);
}
function cancelRecognition() {
  handwriting.candidate=null;
  handwritingPrompt.hidden=true;
  handwritingPrompt.replaceChildren();
  clearInk();
}
function handwritingToggle() {
  handwriting.enabled=!handwriting.enabled;
  handwritingBtn.setAttribute('aria-pressed',String(handwriting.enabled));
  handwritingBtn.textContent='Handwriting: '+(handwriting.enabled?'On':'Off');
  document.getElementById('board').classList.toggle('handwriting-active', handwriting.enabled);
  if(!handwriting.enabled) cancelRecognition();
}
handwritingBtn.addEventListener('click',handwritingToggle);
function initializeInkCanvas() {
  const board=document.getElementById('board');
  if(handwriting.canvas) handwriting.canvas.remove();
  const canvas=document.createElement('canvas');
  canvas.className='ink-overlay';
  const dpr=window.devicePixelRatio || 1;
  const bounds=board.getBoundingClientRect();
  canvas.width=Math.round(bounds.width*dpr);
  canvas.height=Math.round(bounds.height*dpr);
  canvas.style.width=bounds.width+'px';
  canvas.style.height=bounds.height+'px';
  handwriting.ctx=canvas.getContext('2d');
  handwriting.ctx.setTransform(dpr,0,0,dpr,0,0);
  handwriting.ctx.lineWidth=Math.max(2,bounds.width/135);
  handwriting.ctx.lineCap='round';
  handwriting.ctx.lineJoin='round';
  handwriting.ctx.strokeStyle='#6c63ff';
  board.appendChild(canvas);
  handwriting.canvas=canvas;
}
function showCandidates(guess) {
  handwriting.candidate=guess || {digit:null};
  const prompt=handwritingPrompt;
  prompt.replaceChildren();
  prompt.hidden=false;
  const message=document.createElement('span');
  message.textContent=guess ? 'Recognized '+guess.digit+'? Choose a digit:' : 'Choose the digit you wrote:';
  prompt.appendChild(message);
  for(let n=1;n<=9;n++) {
    const button=document.createElement('button');
    button.type='button'; button.className='handwriting-choice';
    button.textContent=String(n);
    if(guess && n===guess.digit) button.classList.add('suggested');
    button.addEventListener('click',()=>acceptHandwriting(n));
    prompt.appendChild(button);
  }
  const cancel=document.createElement('button');
  cancel.type='button'; cancel.className='handwriting-choice';
  cancel.textContent='Cancel'; cancel.addEventListener('click',cancelRecognition);
  prompt.appendChild(cancel);
}
function acceptHandwriting(n) {
  const idx=handwriting.selected;
  cancelRecognition();
  if(idx===null || state.solved || state.fixed[idx]) return;
  state.selected=idx;
  placeNumber(n);
}
function completeRecognition() {
  if(!handwriting.strokes.length || handwriting.active) return;
  const guess=recognizeDigit(handwriting.strokes);
  // A conservative confidence gate; ambiguous strokes must be confirmed
  // before placeNumber, avoiding accidental penalties for recognition errors.
  if(guess && guess.score<0.085 && guess.gap>0.025) acceptHandwriting(guess.digit);
  else showCandidates(guess);
}
function startInk(e,idx) {
  if(!handwriting.enabled || e.pointerType!=='pen' || state.solved || state.fixed[idx]) return;
  if(handwriting.candidate) cancelRecognition();
  if(handwriting.selected!==null && handwriting.selected!==idx) clearInk();
  if(!handwriting.canvas || !handwriting.canvas.isConnected) initializeInkCanvas();
  clearTimeout(handwriting.timeout);
  handwriting.selected=idx;
  // Pen pointer events are handled exclusively by handwriting. Do not call
  // selectCell/renderBoard here: it can repaint while a stroke is underway.
  handwriting.suppressClick=true;
  state.selected=idx;
  // A stationary tap still selects a cell; strokes need actual movement.
  handwriting.active=[];
  handwriting.pointer=e.pointerId;
  const rect=e.currentTarget.getBoundingClientRect();
  const point=[e.clientX-rect.left,e.clientY-rect.top];
  handwriting.active.push(point);
  e.currentTarget.setPointerCapture(e.pointerId);
  e.preventDefault();
}
function moveInk(e,idx) {
  if(handwriting.pointer!==e.pointerId || handwriting.selected!==idx || !handwriting.active) return;
  const cell=e.currentTarget, rect=cell.getBoundingClientRect();
  const point=[Math.max(0,Math.min(rect.width,e.clientX-rect.left)),Math.max(0,Math.min(rect.height,e.clientY-rect.top))];
  const prev=handwriting.active[handwriting.active.length-1];
  if(Math.hypot(point[0]-prev[0],point[1]-prev[1])<0.7)return;
  handwriting.active.push(point);
  const boardRect=document.getElementById('board').getBoundingClientRect();
  const x=rect.left-boardRect.left, y=rect.top-boardRect.top;
  const ctx=handwriting.ctx;
  ctx.beginPath();ctx.moveTo(x+prev[0],y+prev[1]);ctx.lineTo(x+point[0],y+point[1]);ctx.stroke();
  e.preventDefault();
}
function endInk(e) {
  if(handwriting.pointer!==e.pointerId || !handwriting.active)return;
  if(handwriting.active.length>2)handwriting.strokes.push(handwriting.active);
  handwriting.active=null;
  handwriting.pointer=null;
  if(!handwriting.strokes.length) { clearInk(); return; }
  handwriting.timeout=setTimeout(completeRecognition,700);
}
function bindHandwriting(cell,idx) {
  cell.addEventListener('pointerdown',e=>startInk(e,idx));
  cell.addEventListener('pointermove',e=>moveInk(e,idx));
  cell.addEventListener('pointerup',endInk);
  cell.addEventListener('pointercancel',()=>clearInk());
  // Browsers may dispatch a synthesized click after pointerup even when the
  // pointerdown was prevented. Consume it before the normal selectCell handler.
  cell.addEventListener('click',e=>{
    if(!handwriting.suppressClick) return;
    // A finger or mouse tap remains a normal selection even if the browser
    // did not emit the prior pen's synthesized click.
    if(e.pointerType && e.pointerType!=='pen') { handwriting.suppressClick=false; return; }
    handwriting.suppressClick=false;
    e.preventDefault();
    e.stopImmediatePropagation();
  },true);
}
