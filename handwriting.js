'use strict';
// Render stylus strokes into an 8×8 grayscale image matching our trained
// handwritten-digit classifier's input. Preserve aspect ratio and center ink.
function digitPixelsFromStrokes(strokes) {
  const all=strokes.flat();
  if (all.length < 3) return null;
  const minX=Math.min(...all.map(p=>p[0])), maxX=Math.max(...all.map(p=>p[0]));
  const minY=Math.min(...all.map(p=>p[1])), maxY=Math.max(...all.map(p=>p[1]));
  const width=maxX-minX, height=maxY-minY;
  if (Math.max(width,height)<3) return null;
  const canvas=document.createElement('canvas');
  canvas.width=64; canvas.height=64;
  const ctx=canvas.getContext('2d', {willReadFrequently:true});
  if(!ctx) return null;
  const scale=46/Math.max(width,height);
  const centerX=(minX+maxX)/2, centerY=(minY+maxY)/2;
  ctx.fillStyle='#000'; ctx.fillRect(0,0,64,64);
  ctx.strokeStyle='#fff'; ctx.lineWidth=8; ctx.lineCap='round'; ctx.lineJoin='round';
  for(const stroke of strokes) {
    if(stroke.length<2)continue;
    ctx.beginPath();
    ctx.moveTo((stroke[0][0]-centerX)*scale+32,(stroke[0][1]-centerY)*scale+32);
    for(let i=1;i<stroke.length;i++)ctx.lineTo((stroke[i][0]-centerX)*scale+32,(stroke[i][1]-centerY)*scale+32);
    ctx.stroke();
  }
  const small=document.createElement('canvas');
  small.width=8;small.height=8;
  const smallCtx=small.getContext('2d',{willReadFrequently:true});
  if(!smallCtx)return null;
  smallCtx.imageSmoothingEnabled=true;
  smallCtx.imageSmoothingQuality='high';
  smallCtx.drawImage(canvas,0,0,8,8);
  const rgba=smallCtx.getImageData(0,0,8,8).data;
  return Float32Array.from({length:64},(_,i)=>rgba[i*4]/255);
}
function recognizeDigit(strokes) {
  const pixels=digitPixelsFromStrokes(strokes);
  if(!pixels) return null;
  return classifyDigitPixels(pixels);
}
const handwriting = { enabled:false, selected:null, strokes:[], active:null, pointer:null, timeout:null, canvas:null, ctx:null, suppressClick:false };
const handwritingBtn = document.getElementById('handwritingBtn');
const handwritingPrompt = document.getElementById('handwritingPrompt');
function clearInk() {
  clearTimeout(handwriting.timeout);
  handwriting.timeout=null;
  handwriting.strokes=[];
  handwriting.active=null;
  handwriting.pointer=null;
  handwriting.selected=null;
  const writingCell=document.querySelector('.cell.writing');
  if(writingCell) writingCell.classList.remove('writing');
  if(handwriting.ctx && handwriting.canvas) handwriting.ctx.clearRect(0,0,handwriting.canvas.width,handwriting.canvas.height);
}
function cancelRecognition() {
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
function acceptHandwriting(n) {
  const idx=handwriting.selected;
  cancelRecognition();
  if(idx===null || state.solved || state.fixed[idx]) return;
  state.selected=idx;
  placeNumber(n);
}
function completeRecognition() {
  if(!handwriting.strokes.length || handwriting.active || !handwriting.enabled)return;
  const digit=recognizeDigit(handwriting.strokes);
  if(digit!==null)acceptHandwriting(digit);
  else clearInk();
}
function startInk(e,idx) {
  if(!handwriting.enabled || e.pointerType!=='pen' || state.solved || state.fixed[idx]) return;
  if(handwriting.selected!==null && handwriting.selected!==idx) clearInk();
  if(!handwriting.canvas || !handwriting.canvas.isConnected) initializeInkCanvas();
  clearTimeout(handwriting.timeout);
  handwriting.selected=idx;
  // Highlight immediately without rebuilding the cell DOM or disturbing ink.
  const board=document.getElementById('board');
  board.querySelectorAll('.cell.selected, .cell.writing').forEach(el=>{
    el.classList.remove('selected','writing');
  });
  e.currentTarget.classList.add('selected','writing');
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
