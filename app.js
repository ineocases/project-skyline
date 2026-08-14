
(function(){

"use strict";

/* ============================================================
   HELPERS
============================================================ */

const $ = s => document.querySelector(s);

const importScreen = $("#importScreen");
const editorScreen = $("#editorScreen");

const fileInput = $("#fileInput");
const dropzone = $("#dropzone");
const demoBtn = $("#demoBtn");
const status = $("#status");

const video = $("#video");
const source = $("#source");
const overlay = $("#overlay");

const preview = $("#preview");
const pctx = preview.getContext("2d");

const exportCanvas = $("#exportCanvas");
const EXPORT_W=720, EXPORT_H=1280;
exportCanvas.width=EXPORT_W;
exportCanvas.height=EXPORT_H;

const ruler = $("#ruler");
const track = $("#track");
const segmentsEl = $("#segments");
const playheadEl = $("#playhead");

const timeEl = $("#time");
const playBtn = $("#playBtn");

const dropOverlay = $("#dropOverlay");
const toasts = $("#toasts");

const exportOverlay = $("#exportOverlay");
const progressBar = $("#progressBar");
const progressText = $("#progressText");

let sourceURL = null;
let sourceName = "";
let sourceBlob = null;
let duration = 0;

let ffmpegInstance = null;
let ffmpegLoaded = false;

let project = null;

let layout = "dividido";

let selectedSegment = 0;
let selectedScreen = 0;

let playhead = 0;
let playing = false;
let lastFrame = 0;

let pps = 60;

let dragging = false;

let undoStack = [];

let exporting = false;
let cancelExport = false;
let recorder = null;
let exportChunks = [];

let volume = 1;
let muted = false;

const COLORS = [
  "#22d3ee",
  "#4ade80",
  "#c084fc"
];

const LABELS = {
  vertical:["Full"],
  dividido:["Top","Bottom"],
  trio:["Top","Mid","Bottom"],
  centrado:["Centro"],
  horizontal:["Wide"]
};

const PHRASES = [
  "esto es lo que nadie te cuenta",
  "espera a ver esto",
  "esto cambia todo",
  "no vas a creer lo que pasó",
  "atención a esta parte",
  "acá empieza lo bueno",
  "mirá lo que pasó",
  "nadie lo vio venir"
];


/* ============================================================
   UTILIDADES
============================================================ */

function clamp(v,a,b){
  return Math.max(a,Math.min(b,v));
}

function lerp(a,b,t){
  return a+(b-a)*t;
}

function fmt(t){
  t=Math.max(0,t||0);
  const m=Math.floor(t/60);
  const s=Math.floor(t%60);
  return String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
}

function toast(text){
  const el=document.createElement("div");
  el.className="toast";
  el.textContent=text;
  toasts.appendChild(el);

  setTimeout(()=>{
    el.style.opacity="0";
    el.style.transition=".25s";
    setTimeout(()=>el.remove(),300);
  },2600);
}

function safeSeek(t){
  if(!video.duration || !isFinite(video.duration)) return;

  try{
    video.currentTime=clamp(
      t,
      0,
      Math.max(0,video.duration-.01)
    );
  }catch(e){}
}

function getAspect(){
  if(video.videoWidth && video.videoHeight){
    return video.videoHeight/video.videoWidth;
  }
  return 9/16;
}


/* ============================================================
   IMPORTACIÓN — CORREGIDA
============================================================ */

function isVideo(file){

  if(!file) return false;

  if(file.type && file.type.startsWith("video/")){
    return true;
  }

  return /\.(mp4|mov|webm|m4v|mkv|avi|ogv|3gp)$/i.test(
    file.name||""
  );
}

function handleFile(file){

  if(!file){
    toast("No se encontró el archivo.");
    return;
  }

  if(!isVideo(file)){
    toast("El archivo no parece ser un video.");
    status.textContent="Archivo no válido.";
    return;
  }

  status.textContent="Cargando "+file.name+"…";

  if(sourceURL){
    try{
      URL.revokeObjectURL(sourceURL);
    }catch(e){}
  }

  sourceBlob=file;
  sourceURL=URL.createObjectURL(file);
  sourceName=file.name;

  loadVideo(sourceURL);
}

function loadVideo(url){

  let finished=false;

  const timeout=setTimeout(()=>{
    if(finished) return;

    finished=true;

    video.removeEventListener("loadedmetadata",metadata);
    video.removeEventListener("error",error);

    toast("El video tardó demasiado en cargar.");
    status.textContent="No se pudo cargar el video.";
  },30000);


  function metadata(){

    if(finished) return;

    if(!isFinite(video.duration) || video.duration<=0){
      return;
    }

    finished=true;
    clearTimeout(timeout);

    video.removeEventListener("loadedmetadata",metadata);
    video.removeEventListener("error",error);

    duration=video.duration;

    project={
      segments:[
        {
          start:0,
          end:duration
        }
      ],

      screens:[],

      captions:[],

      texts:[],

      seed:Math.floor(Math.random()*99999)
    };

    selectedSegment=0;
    selectedScreen=0;
    playhead=0;
    undoStack=[];

    buildCaptions();

    importScreen.hidden=true;
    editorScreen.hidden=false;

    setTimeout(()=>{

      fitSource();

      setLayout("dividido");

      project.texts=project.texts||[];
      selectedTextId=null;
      renderTextList();
      rebuild();

      seek(0);

      updateVolume();

      toast("Video cargado correctamente.");

    },80);
  }


  function error(){

    if(finished) return;

    finished=true;
    clearTimeout(timeout);

    toast("El navegador no pudo decodificar este video.");
    status.textContent="Error al decodificar.";
  }


  video.addEventListener("loadedmetadata",metadata);
  video.addEventListener("error",error);

  video.src=url;
  video.load();
}


/* ============================================================
   INPUT
============================================================ */

fileInput.addEventListener("change",e=>{

  const file=e.target.files && e.target.files[0];

  if(file) handleFile(file);

  fileInput.value="";
});


dropzone.addEventListener("dragover",e=>{
  e.preventDefault();
  dropzone.classList.add("over");
});

dropzone.addEventListener("dragleave",()=>{
  dropzone.classList.remove("over");
});

dropzone.addEventListener("drop",e=>{

  e.preventDefault();

  dropzone.classList.remove("over");

  const file=e.dataTransfer.files[0];

  if(file) handleFile(file);
});


let dragDepth=0;

window.addEventListener("dragenter",e=>{

  e.preventDefault();

  dragDepth++;

  if(importScreen.hidden===false){
    dropOverlay.hidden=false;
  }
});

window.addEventListener("dragleave",e=>{

  e.preventDefault();

  dragDepth=Math.max(0,dragDepth-1);

  if(dragDepth===0){
    dropOverlay.hidden=true;
  }
});

window.addEventListener("dragover",e=>{
  e.preventDefault();
});

window.addEventListener("drop",e=>{

  e.preventDefault();

  dragDepth=0;
  dropOverlay.hidden=true;

  const file=e.dataTransfer.files[0];

  if(!file) return;

  if(!importScreen.hidden){
    handleFile(file);
  }
});


/* ============================================================
   DEMO
============================================================ */

demoBtn.addEventListener("click",()=>{

  if(!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream){
    toast("Tu navegador no soporta el video demo.");
    return;
  }

  const c=document.createElement("canvas");

  c.width=1280;
  c.height=720;

  const ctx=c.getContext("2d");

  const stream=c.captureStream(30);

  const types=[
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm"
  ];

  let mime="video/webm";

  for(const type of types){

    if(MediaRecorder.isTypeSupported(type)){
      mime=type;
      break;
    }
  }

  const rec=new MediaRecorder(stream,{mimeType:mime});

  const chunks=[];

  rec.ondataavailable=e=>{
    if(e.data.size) chunks.push(e.data);
  };

  rec.onstop=()=>{

    const blob=new Blob(chunks,{type:"video/webm"});
    sourceBlob=blob;

    if(sourceURL){
      try{URL.revokeObjectURL(sourceURL)}catch(e){}
    }

    sourceURL=URL.createObjectURL(blob);
    sourceName="demo-ineoclips.webm";

    loadVideo(sourceURL);
  };

  const start=performance.now();

  rec.start(200);

  function frame(now){

    const t=(now-start)/1000;

    ctx.fillStyle="#101322";
    ctx.fillRect(0,0,1280,720);

    const g1=ctx.createLinearGradient(0,0,640,720);
    g1.addColorStop(0,"#172554");
    g1.addColorStop(1,"#06b6d4");

    ctx.fillStyle=g1;
    ctx.fillRect(30,30,580,660);

    const g2=ctx.createLinearGradient(640,0,1280,720);
    g2.addColorStop(0,"#581c87");
    g2.addColorStop(1,"#db2777");

    ctx.fillStyle=g2;
    ctx.fillRect(650,30,600,660);

    ctx.fillStyle="#fff";
    ctx.textAlign="center";
    ctx.textBaseline="middle";

    ctx.font="130px Arial";
    ctx.fillText(
      "⚽",
      320+Math.sin(t*2)*100,
      340+Math.cos(t*2)*70
    );

    ctx.font="bold 55px Arial";
    ctx.fillText("STREAM",960,570);

    if(t<5){
      requestAnimationFrame(frame);
    }else{
      rec.stop();
    }
  }

  requestAnimationFrame(frame);

  toast("Generando demo…");
});


/* ============================================================
   LAYOUTS
============================================================ */

function slots(l,W,H){

  if(l==="dividido"){
    return [
      [0,0,W,H/2],
      [0,H/2,W,H/2]
    ];
  }

  if(l==="trio"){
    return [
      [0,0,W,H/3],
      [0,H/3,W,H/3],
      [0,H*2/3,W,H/3]
    ];
  }

  if(l==="centrado"){
    return [
      [0,(H-W)/2,W,W]
    ];
  }

  if(l==="horizontal"){

    const h=W*9/16;

    return [
      [0,(H-h)/2,W,h]
    ];
  }

  return [
    [0,0,W,H]
  ];
}


function defaultRects(l){

  const count=slots(l,360,640).length;

  const centers={
    vertical:[[.5,.5]],
    dividido:[[.5,.25],[.5,.75]],
    trio:[[.5,.166],[.5,.5],[.5,.833]],
    centrado:[[.5,.5]],
    horizontal:[[.5,.5]]
  };

  const result=[];

  for(let i=0;i<count;i++){

    const s=slots(l,360,640)[i];

    const slotRatio=s[2]/s[3];

    const sourceRatio=
      video.videoWidth/video.videoHeight || 16/9;

    let w,h;

    /*
      El rectángulo representa la zona visible
      del video fuente.
    */

    if(slotRatio<sourceRatio){
      w=slotRatio/sourceRatio;
      h=1;
    }else{
      w=1;
      h=sourceRatio/slotRatio;
    }

    w=clamp(w,.05,1);
    h=clamp(h,.05,1);

    const c=centers[l][i];

    result.push({
      x:clamp(c[0]-w/2,0,1-w),
      y:clamp(c[1]-h/2,0,1-h),
      w,
      h,
      scale:1
    });
  }

  return result;
}


function setLayout(l){

  layout=l;

  document.querySelectorAll("#layouts button").forEach(btn=>{
    btn.classList.toggle(
      "active",
      btn.dataset.layout===l
    );
  });

  const rects=defaultRects(l);

  project.screens=rects.map(r=>({
    base:{...r},
    keyframes:[]
  }));

  selectedScreen=0;

  buildOverlay();
  updateOverlay();
  drawPreview();
  renderTimeline();
  updateTransformControls();
}


/* ============================================================
   KEYFRAME ENGINE
============================================================ */

function cloneTransform(t){
  return {
    x:t.x,
    y:t.y,
    w:t.w,
    h:t.h,
    scale:t.scale
  };
}


function currentBaseTransform(index){

  if(!project.screens[index]){
    project.screens[index]={
      base:defaultRects(layout)[index],
      keyframes:[]
    };
  }

  return project.screens[index].base;
}


function getTransformAt(time,index){

  const screen=project.screens[index];

  if(!screen){
    return defaultRects(layout)[index];
  }

  const keys=screen.keyframes
    .slice()
    .sort((a,b)=>a.time-b.time);

  if(!keys.length){
    return cloneTransform(screen.base);
  }

  let before=null;
  let after=null;

  for(const key of keys){

    if(key.time<=time){
      before=key;
    }

    if(key.time>=time){
      after=key;
      break;
    }
  }

  if(!before){
    return cloneTransform(keys[0].transform);
  }

  if(!after){
    return cloneTransform(before.transform);
  }

  if(before.time===after.time){
    return cloneTransform(before.transform);
  }

  const f=clamp(
    (time-before.time)/(after.time-before.time),
    0,
    1
  );

  return {
    x:lerp(before.transform.x,after.transform.x,f),
    y:lerp(before.transform.y,after.transform.y,f),
    w:lerp(before.transform.w,after.transform.w,f),
    h:lerp(before.transform.h,after.transform.h,f),
    scale:lerp(before.transform.scale,after.transform.scale,f)
  };
}


function findKeyframe(index,time){

  const screen=project.screens[index];

  if(!screen) return null;

  const tolerance=.035;

  return screen.keyframes.find(
    k=>Math.abs(k.time-time)<=tolerance
  ) || null;
}


function addKeyframe(){

  if(!project) return;

  const transform=getTransformAt(
    playhead,
    selectedScreen
  );

  const screen=project.screens[selectedScreen];

  const existing=findKeyframe(
    selectedScreen,
    playhead
  );

  if(existing){

    existing.transform=cloneTransform(transform);

    toast("Keyframe actualizado.");
  }else{

    screen.keyframes.push({
      time:playhead,
      transform:cloneTransform(transform)
    });

    screen.keyframes.sort(
      (a,b)=>a.time-b.time
    );

    toast("◆ Keyframe agregado.");
  }

  renderTimeline();
  updateTransformControls();
}


function deleteKeyframe(){

  const screen=project.screens[selectedScreen];

  if(!screen) return;

  const index=screen.keyframes.findIndex(
    k=>Math.abs(k.time-playhead)<=.035
  );

  if(index<0){
    toast("No hay keyframe en este punto.");
    return;
  }

  screen.keyframes.splice(index,1);

  toast("Keyframe eliminado.");

  renderTimeline();
  updateTransformControls();
}


function updateCurrentKeyframe(){

  const screen=project.screens[selectedScreen];

  if(!screen) return;

  const key=findKeyframe(
    selectedScreen,
    playhead
  );

  if(key){

    const transform=screen.base;

    key.transform=cloneTransform(transform);

    renderTimeline();
  }
}


/* ============================================================
   OVERLAY
============================================================ */

function buildOverlay(){

  overlay.innerHTML="";

  const rects=defaultRects(layout);

  const labels=LABELS[layout];

  rects.forEach((r,index)=>{

    const el=document.createElement("div");

    el.className="crop";

    el.dataset.index=index;

    el.style.setProperty(
      "border-color",
      COLORS[index%COLORS.length]
    );

    el.innerHTML=`
      <span class="cropLabel">${labels[index]}</span>
      <span class="cropZoom">1.0x</span>

      <div class="handle nw" data-corner="nw"></div>
      <div class="handle ne" data-corner="ne"></div>
      <div class="handle sw" data-corner="sw"></div>
      <div class="handle se" data-corner="se"></div>
    `;

    el.addEventListener("click",e=>{
      e.stopPropagation();

      selectedScreen=index;

      updateOverlay();
      updateTransformControls();
    });

    el.addEventListener("dblclick",e=>{
      e.stopPropagation();

      const base=defaultRects(layout)[index];

      project.screens[index].base={
        ...base,
        scale:1
      };

      if($("#autoKeyframe").checked){
        addKeyframe();
      }

      updateOverlay();
      updateTransformControls();
      drawPreview();

      toast("Recorte recentrado.");
    });

    overlay.appendChild(el);
  });
}


function updateOverlay(){

  const boxes=overlay.querySelectorAll(".crop");

  boxes.forEach((el,index)=>{

    const r=getTransformAt(
      playhead,
      index
    );

    el.style.left=(r.x*100)+"%";
    el.style.top=(r.y*100)+"%";
    el.style.width=(r.w*100)+"%";
    el.style.height=(r.h*100)+"%";

    el.style.zIndex=index===selectedScreen?10:1;

    el.querySelector(".cropZoom").textContent=
      r.scale.toFixed(2)+"x";

    el.style.borderColor=
      COLORS[index%COLORS.length];
  });
}


/* ============================================================
   DRAG / RESIZE
============================================================ */

overlay.addEventListener("pointerdown",e=>{

  const box=e.target.closest(".crop");

  if(!box) return;

  e.preventDefault();

  pause();

  const index=Number(box.dataset.index);

  selectedScreen=index;

  const corner=e.target.closest(".handle");

  const rect=source.getBoundingClientRect();

  const original=getTransformAt(
    playhead,
    index
  );

  const startX=e.clientX;
  const startY=e.clientY;

  dragging=true;

  function move(ev){

    const dx=(ev.clientX-startX)/rect.width;
    const dy=(ev.clientY-startY)/rect.height;

    let r={...original};

    if(!corner){

      r.x=clamp(
        original.x+dx,
        0,
        1-original.w
      );

      r.y=clamp(
        original.y+dy,
        0,
        1-original.h
      );

    }else{

      const c=corner.dataset.corner;

      if(c.includes("e")){
        r.w=clamp(
          original.w+dx,
          .05,
          1-original.x
        );
      }

      if(c.includes("s")){
        r.h=clamp(
          original.h+dy,
          .05,
          1-original.y
        );
      }

      if(c.includes("w")){

        const nx=clamp(
          original.x+dx,
          0,
          original.x+original.w-.05
        );

        r.w=original.x+original.w-nx;
        r.x=nx;
      }

      if(c.includes("n")){

        const ny=clamp(
          original.y+dy,
          0,
          original.y+original.h-.05
        );

        r.h=original.y+original.h-ny;
        r.y=ny;
      }
    }

    /*
      Drag/resize cambia la transformación actual.
    */

    applyTransformEdit(index,r);

    updateOverlay();
    updateTransformControls();
    drawPreview();
  }

  function up(){

    dragging=false;

    if($("#autoKeyframe").checked){
      renderTimeline();
    }

    window.removeEventListener("pointermove",move);
  }

  window.addEventListener(
    "pointermove",
    move
  );

  window.addEventListener(
    "pointerup",
    up,
    {once:true}
  );
});


/* ============================================================
   TRANSFORM CONTROLS
============================================================ */

const xRange=$("#xRange");
const yRange=$("#yRange");
const scaleRange=$("#scaleRange");

const xNumber=$("#xNumber");
const yNumber=$("#yNumber");
const scaleNumber=$("#scaleNumber");


function updateTransformControls(){

  if(!project) return;

  const r=getTransformAt(
    playhead,
    selectedScreen
  );

  const x=r.x*100;
  const y=r.y*100;
  const scale=r.scale;

  xRange.value=x;
  xNumber.value=x.toFixed(1);

  yRange.value=y;
  yNumber.value=y.toFixed(1);

  scaleRange.value=scale*100;
  scaleNumber.value=scale.toFixed(2);

  const keyBtn=$("#addKeyframe");
  const atKey=!!findKeyframe(selectedScreen,playhead);
  keyBtn.textContent=atKey?"◆ Actualizar keyframe":"◆ Crear keyframe";
  keyBtn.classList.toggle("primary",!atKey);
  keyBtn.classList.toggle("ghost",atKey);
}


function applyTransformEdit(index,transform){

  const screen=project.screens[index];
  if(!screen) return;

  const clean=cloneTransform(transform);
  const existing=findKeyframe(index,playhead);

  /*
    Una vez que existe al menos un keyframe, cualquier cambio de
    transformación se convierte en un punto de animación en el
    playhead. Esto evita que el primer keyframe "bloquee" el recorte.
  */
  if(existing){
    existing.transform=clean;
  }else if(screen.keyframes.length>0 || $("#autoKeyframe").checked){
    screen.keyframes.push({
      time:playhead,
      transform:clean
    });
    screen.keyframes.sort((a,b)=>a.time-b.time);
  }else{
    screen.base=clean;
  }

  updateOverlay();
  updateTransformControls();
  drawPreview();
}


function modifyTransform(property,value){

  if(!project) return;

  value=Number(value);

  const r=getTransformAt(
    playhead,
    selectedScreen
  );

  if(property==="x"){
    r.x=clamp(value/100,0,1-r.w);
  }

  if(property==="y"){
    r.y=clamp(value/100,0,1-r.h);
  }

  if(property==="scale"){
    r.scale=clamp(value,.5,5);
  }

  applyTransformEdit(selectedScreen,r);
  renderTimeline();
}


xRange.addEventListener("input",()=>{
  modifyTransform("x",xRange.value);
});

xNumber.addEventListener("input",()=>{
  modifyTransform("x",xNumber.value);
});

yRange.addEventListener("input",()=>{
  modifyTransform("y",yRange.value);
});

yNumber.addEventListener("input",()=>{
  modifyTransform("y",yNumber.value);
});

scaleRange.addEventListener("input",()=>{
  modifyTransform(
    "scale",
    Number(scaleRange.value)/100
  );
});

scaleNumber.addEventListener("input",()=>{
  modifyTransform(
    "scale",
    scaleNumber.value
  );
});


$("#resetTransform").addEventListener("click",()=>{

  const base=defaultRects(layout)[selectedScreen];

  applyTransformEdit(selectedScreen,{
    ...base,
    scale:1
  });
  renderTimeline();

  toast("Transformación restablecida.");
});


$("#addKeyframe").addEventListener(
  "click",
  addKeyframe
);

$("#deleteKeyframe").addEventListener(
  "click",
  deleteKeyframe
);


/* ============================================================
   LAYOUT BUTTONS
============================================================ */

$("#layouts").addEventListener("click",e=>{

  const btn=e.target.closest("button");

  if(!btn) return;

  setLayout(btn.dataset.layout);

  toast("Layout: "+btn.textContent);
});


/* ============================================================
   INSPECTOR PROFESIONAL
============================================================ */

const inspectorTabs=document.querySelectorAll(".inspectorTab");
const inspectorPanels=document.querySelectorAll(".inspectorPanel");

function setInspectorPanel(panel){
  inspectorTabs.forEach(btn=>{
    btn.classList.toggle("active",btn.dataset.panel===panel);
  });

  inspectorPanels.forEach(block=>{
    block.hidden=block.dataset.panelSection!==panel;
  });
}

inspectorTabs.forEach(btn=>{
  btn.addEventListener("click",()=>setInspectorPanel(btn.dataset.panel));
});

setInspectorPanel("transform");


/* ============================================================
   COMPOSICIÓN
============================================================ */

function drawComposite(ctx,W,H){

  ctx.fillStyle="#000";
  ctx.fillRect(0,0,W,H);

  if(!video.videoWidth) return;

  const slotList=slots(layout,W,H);

  for(let i=0;i<slotList.length;i++){

    const r=getTransformAt(
      playhead,
      i
    );

    const s=slotList[i];

    /*
      La escala se aplica alrededor
      del centro del recorte.
    */

    const sourceW=
      video.videoWidth*r.w;

    const sourceH=
      video.videoHeight*r.h;

    const zoom=Math.max(.01,r.scale||1);

    const scaleX=s[2]/sourceW;
    const scaleY=s[3]/sourceH;

    const baseScale=Math.max(
      scaleX,
      scaleY
    );

    const finalScale=baseScale*zoom;

    const dw=video.videoWidth*finalScale;
    const dh=video.videoHeight*finalScale;

    const cx=
      (r.x+r.w/2)*video.videoWidth;

    const cy=
      (r.y+r.h/2)*video.videoHeight;

    const dx=
      s[0]+s[2]/2-cx*finalScale;

    const dy=
      s[1]+s[3]/2-cy*finalScale;

    ctx.save();

    ctx.beginPath();

    ctx.rect(
      s[0],
      s[1],
      s[2],
      s[3]
    );

    ctx.clip();

    ctx.drawImage(
      video,
      dx,
      dy,
      dw,
      dh
    );

    ctx.restore();

    if(i>0){

      ctx.strokeStyle=
        COLORS[i%COLORS.length];

      ctx.lineWidth=3;

      ctx.beginPath();

      ctx.moveTo(s[0],s[1]);
      ctx.lineTo(s[0]+s[2],s[1]);

      ctx.stroke();
    }
  }
}


/* ============================================================
   SUBTÍTULOS / MARCA
============================================================ */

function buildCaptions(){

  if(!project) return;

  const cues=[];

  let t=0;
  let index=project.seed%PHRASES.length;

  while(t<duration){

    const d=Math.min(
      1.5+((index*17)%8)*.12,
      duration-t
    );

    cues.push({
      start:t,
      end:t+d,
      text:PHRASES[index%PHRASES.length]
    });

    t+=d;
    index++;
  }

  project.captions=cues;
}



/* ============================================================
   TEXTOS PERSONALIZADOS
============================================================ */
let selectedTextId=null;

function activeText(){
  if(!project || !project.texts) return null;
  return project.texts.find(t=>t.id===selectedTextId) || null;
}

function renderTextList(){
  const list=$("#textList");
  if(!list || !project) return;
  list.innerHTML="";
  (project.texts||[]).forEach((t,i)=>{
    const b=document.createElement("button");
    b.className="textChip"+(t.id===selectedTextId?" active":"");
    b.textContent=(i+1)+". "+(t.text||"Texto");
    b.addEventListener("click",()=>{selectedTextId=t.id; loadTextControls(); renderTextList(); drawPreview();});
    list.appendChild(b);
  });
}

function loadTextControls(){
  const t=activeText();
  if(!t) return;
  $("#textContent").value=t.text;
  $("#textStart").value=t.start.toFixed(1);
  $("#textEnd").value=t.end.toFixed(1);
  $("#textX").value=t.x.toFixed(1);
  $("#textY").value=t.y.toFixed(1);
  $("#textSize").value=t.size;
  $("#textColor").value=t.color;
  $("#textStyle").value=t.style;
  $("#textAlign").value=t.align;
}

function applyTextControls(){
  const t=activeText();
  if(!t) return;
  t.text=$("#textContent").value;
  t.start=clamp(Number($("#textStart").value)||0,0,duration);
  t.end=clamp(Number($("#textEnd").value)||0,0,duration);
  if(t.end<=t.start) t.end=Math.min(duration,t.start+.1);
  t.x=clamp(Number($("#textX").value)||0,0,100);
  t.y=clamp(Number($("#textY").value)||0,0,100);
  t.size=clamp(Number($("#textSize").value)||44,8,240);
  t.color=$("#textColor").value||"#ffffff";
  t.style=$("#textStyle").value||"bold";
  t.align=$("#textAlign").value||"center";
  renderTextList();
  drawPreview();
  toast("Texto actualizado.");
}

$("#addTextBtn").addEventListener("click",()=>{
  if(!project) return;
  const t={
    id:"txt_"+Date.now()+"_"+Math.random().toString(36).slice(2,7),
    text:"Nuevo texto",
    start:clamp(playhead,0,duration),
    end:clamp(playhead+2,0,duration),
    x:50,y:85,size:44,color:"#ffffff",style:"bold",align:"center"
  };
  if(t.end<=t.start) t.end=Math.min(duration,t.start+.1);
  project.texts.push(t);
  selectedTextId=t.id;
  renderTextList();
  loadTextControls();
  drawPreview();
});

$("#deleteTextBtn").addEventListener("click",()=>{
  if(!project || !selectedTextId) return;
  project.texts=project.texts.filter(t=>t.id!==selectedTextId);
  selectedTextId=project.texts.at(-1)?.id||null;
  renderTextList();
  loadTextControls();
  drawPreview();
  toast("Texto eliminado.");
});

$("#textApplyBtn").addEventListener("click",applyTextControls);

function drawCustomTexts(ctx,W,H){
  if(!project || !project.texts) return;
  for(const t of project.texts){
    if(!t.text || playhead<t.start || playhead>=t.end) continue;
    const fs=Math.max(8,Math.round(t.size*(H/640)));
    ctx.save();
    ctx.font=`${t.style||"bold"} ${fs}px Inter, Arial, sans-serif`;
    ctx.textAlign=t.align||"center";
    ctx.textBaseline="middle";
    ctx.lineWidth=Math.max(2,fs*.12);
    ctx.strokeStyle="rgba(0,0,0,.9)";
    ctx.fillStyle=t.color||"#fff";
    const x=W*clamp(t.x,0,100)/100;
    const y=H*clamp(t.y,0,100)/100;
    ctx.strokeText(t.text,x,y);
    ctx.fillText(t.text,x,y);
    ctx.restore();
  }
}

function drawExtras(ctx,W,H){

  if($("#brandToggle").checked){

    ctx.font=
      "700 "+Math.round(H*.018)+"px Inter";

    ctx.textAlign="left";
    ctx.textBaseline="middle";

    const text="@ineoclips";

    const width=
      ctx.measureText(text).width+18;

    ctx.fillStyle="rgba(0,0,0,.6)";

    ctx.fillRect(
      W-width-10,
      10,
      width,
      26
    );

    ctx.fillStyle="#d8ff3e";

    ctx.fillText(
      text,
      W-width-1,
      23
    );
  }


  if($("#captionsToggle").checked){

    const cue=project.captions.find(
      c=>playhead>=c.start &&
         playhead<c.end
    );

    if(cue){
      const fs=Math.round(H*.035);

    ctx.font=
      "700 "+fs+"px Inter";

    ctx.textAlign="center";
    ctx.textBaseline="middle";

    ctx.lineWidth=fs*.2;
    ctx.strokeStyle="rgba(0,0,0,.9)";
    ctx.fillStyle="#fff";

    ctx.strokeText(
      cue.text,
      W/2,
      H*.89
    );

      ctx.fillText(
        cue.text,
        W/2,
        H*.89
      );
    }
  }

  drawCustomTexts(ctx,W,H);
}


function drawPreview(){

  try{

    drawComposite(
      pctx,
      preview.width,
      preview.height
    );

    drawExtras(
      pctx,
      preview.width,
      preview.height
    );

  }catch(e){}
}


$("#captionsToggle").addEventListener(
  "change",
  drawPreview
);

$("#brandToggle").addEventListener(
  "change",
  drawPreview
);


/* ============================================================
   TIMELINE
============================================================ */

function totalDuration(){

  if(!project) return 0;

  return project.segments.reduce(
    (sum,s)=>sum+(s.end-s.start),
    0
  );
}


function sequence(){

  let current=0;

  return project.segments.map(
    (s,index)=>{

      const d=s.end-s.start;

      const item={
        index,
        start:s.start,
        end:s.end,
        duration:d,
        seqStart:current,
        seqEnd:current+d
      };

      current+=d;

      return item;
    }
  );
}


function segmentAt(t){

  const list=sequence();

  return list.find(
    s=>t>=s.seqStart && t<s.seqEnd
  ) || list[list.length-1];
}


function renderTimeline(){

  if(!project) return;

  const total=totalDuration();

  const width=
    track.clientWidth || 800;

  pps=total>0?width/total:60;

  ruler.innerHTML="";

  const step=
    total<=20?2:
    total<=60?5:
    total<=180?15:
    30;

  for(let t=0;t<=total;t+=step){

    const tick=document.createElement("div");

    tick.className="tick";

    tick.style.left=
      (t*pps)+"px";

    tick.textContent=fmt(t);

    ruler.appendChild(tick);
  }


  segmentsEl.innerHTML="";

  sequence().forEach(item=>{

    const el=document.createElement("div");

    el.className=
      "segment"+
      (item.index===selectedSegment?" selected":"");

    el.dataset.index=item.index;

    el.style.left=
      item.seqStart*pps+"px";

    el.style.width=
      Math.max(12,item.duration*pps)+"px";

    el.style.setProperty(
      "--seg",
      ["#8b5cf6","#ec4899","#22d3ee","#34d399"][
        item.index%4
      ]
    );

    el.innerHTML=`
      <span class="segText">
        #${item.index+1} · ${item.duration.toFixed(1)}s
      </span>
      <div class="trim left"></div>
      <div class="trim right"></div>
    `;

    segmentsEl.appendChild(el);
  });


  /* TEXT MARKERS */
  (project.texts||[]).forEach((t)=>{
    const a=document.createElement("div");
    a.className="keyMarker";
    a.style.left=(t.start*pps)+"px";
    a.style.top="31px";
    a.style.borderBottomColor=t.color||"#fff";
    a.title="Texto: "+(t.text||"")+" · "+fmt(t.start)+"–"+fmt(t.end);
    a.addEventListener("click",e=>{
      e.stopPropagation();
      selectedTextId=t.id;
      loadTextControls();
      renderTextList();
      seek(t.start);
    });
    track.appendChild(a);
  });

  /*
    KEYFRAME MARKERS
  */

  project.screens.forEach(
    (screen,screenIndex)=>{

      screen.keyframes.forEach(key=>{

        const marker=document.createElement("div");

        marker.className="keyMarker";

        marker.style.left=
          key.time*pps+"px";

        marker.style.borderBottomColor=
          COLORS[screenIndex%COLORS.length];

        marker.title=
          "Keyframe · Pantalla "+(screenIndex+1)+
          " · "+fmt(key.time);

        marker.addEventListener(
          "click",
          e=>{
            e.stopPropagation();

            selectedScreen=screenIndex;

            seek(key.time);

            updateTransformControls();

            updateOverlay();
          }
        );

        track.appendChild(marker);
      });
    }
  );


  updateTime();
}


function updateTime(){

  const total=totalDuration();

  timeEl.textContent=
    fmt(playhead)+" / "+fmt(total);

  playheadEl.style.left=
    playhead*pps+"px";
}


function seek(t){

  if(!project) return;

  playhead=clamp(
    t,
    0,
    totalDuration()
  );

  const seg=segmentAt(playhead);

  if(seg){

    const local=
      playhead-seg.seqStart;

    safeSeek(
      seg.start+local
    );
  }

  updateOverlay();
  updateTransformControls();
  drawPreview();
  updateTime();
}


track.addEventListener("pointerdown",e=>{

  if(!project) return;

  const rect=track.getBoundingClientRect();

  function calculate(clientX){

    const t=
      clamp(
        (clientX-rect.left)/pps,
        0,
        totalDuration()
      );

    seek(t);
  }

  calculate(e.clientX);

  pause();

  function move(ev){
    calculate(ev.clientX);
  }

  function up(){
    window.removeEventListener(
      "pointermove",
      move
    );
  }

  window.addEventListener(
    "pointermove",
    move
  );

  window.addEventListener(
    "pointerup",
    up,
    {once:true}
  );
});


segmentsEl.addEventListener("pointerdown",e=>{

  const seg=e.target.closest(".segment");

  if(!seg) return;

  selectedSegment=
    Number(seg.dataset.index);

  renderTimeline();
});


/* ============================================================
   TRIM
============================================================ */

track.addEventListener("pointerdown",e=>{

  const handle=e.target.closest(".trim");

  if(!handle) return;

  const seg=e.target.closest(".segment");

  if(!seg) return;

  e.stopPropagation();

  const index=Number(seg.dataset.index);

  selectedSegment=index;

  pause();

  const original={
    ...project.segments[index]
  };

  const x0=e.clientX;

  function move(ev){

    const delta=
      (ev.clientX-x0)/pps;

    if(handle.classList.contains("left")){

      project.segments[index].start=
        clamp(
          original.start+delta,
          0,
          original.end-.1
        );

    }else{

      project.segments[index].end=
        clamp(
          original.end+delta,
          original.start+.1,
          duration
        );
    }

    renderTimeline();
  }

  window.addEventListener(
    "pointermove",
    move
  );

  window.addEventListener(
    "pointerup",
    ()=>{
      window.removeEventListener(
        "pointermove",
        move
      );

      seek(playhead);
    },
    {once:true}
  );
});


/* ============================================================
   PLAYBACK
============================================================ */

function play(){

  if(!project) return;

  if(playhead>=totalDuration()-.01){
    seek(0);
  }

  playing=true;

  playBtn.textContent="⏸";

  updateVideoVolume();

  video.play().catch(()=>{});

  lastFrame=performance.now();

  requestAnimationFrame(loop);
}


function pause(){

  playing=false;

  playBtn.textContent="▶";

  try{
    video.pause();
  }catch(e){}
}


function loop(now){

  if(!playing) return;

  const delta=
    Math.min(.1,(now-lastFrame)/1000);

  lastFrame=now;

  playhead+=delta;

  const total=totalDuration();

  if(playhead>=total){

    playhead=total;

    pause();

    if(exporting && recorder && recorder.state!=="inactive"){
      try{ recorder.stop(); }catch(e){}
    }

    updateTime();
    return;
  }


  const seg=segmentAt(playhead);

  if(seg){

    const target=
      seg.start+
      (playhead-seg.seqStart);

    if(
      Math.abs(video.currentTime-target)>.12
    ){
      safeSeek(target);
    }
  }


  updateOverlay();
  updateTransformControls();
  drawPreview();
  updateTime();

  if(exporting){

    try{
      drawExportFrame();
    }catch(e){}

    const percent=
      total>0?(playhead/total)*100:0;

    progressBar.style.width=
      percent+"%";

    progressText.textContent=
      Math.round(percent)+"%";
  }


  requestAnimationFrame(loop);
}


playBtn.addEventListener("click",()=>{
  playing?pause():play();
});


$("#prevBtn").addEventListener("click",()=>{

  const list=sequence();

  const current=segmentAt(playhead);

  if(!current) return;

  const index=
    Math.max(0,current.index-1);

  seek(list[index].seqStart+.001);
});


$("#nextBtn").addEventListener("click",()=>{

  const list=sequence();

  const current=segmentAt(playhead);

  if(!current) return;

  const index=
    Math.min(
      list.length-1,
      current.index+1
    );

  seek(list[index].seqStart+.001);
});


/* ============================================================
   SPLIT / DELETE / MOVE
============================================================ */

function saveUndo(){

  if(!project) return;

  undoStack.push(
    JSON.stringify(project.segments)
  );

  if(undoStack.length>40){
    undoStack.shift();
  }
}


function split(){

  const seg=segmentAt(playhead);

  if(!seg){
    toast("Nada que cortar.");
    return;
  }

  const local=
    playhead-seg.seqStart;

  if(local<.15 || local>seg.duration-.15){
    toast("Demasiado cerca del borde.");
    return;
  }

  saveUndo();

  const mid=
    seg.start+local;

  project.segments.splice(
    seg.index,
    1,
    {
      start:seg.start,
      end:mid
    },
    {
      start:mid,
      end:seg.end
    }
  );

  selectedSegment=seg.index+1;

  renderTimeline();

  toast("Video dividido.");
}


function deleteSegment(){

  if(project.segments.length<=1){
    toast("No podés eliminar el último segmento.");
    return;
  }

  saveUndo();

  project.segments.splice(
    selectedSegment,
    1
  );

  selectedSegment=
    clamp(
      selectedSegment,
      0,
      project.segments.length-1
    );

  seek(
    Math.min(
      playhead,
      totalDuration()
    )
  );

  renderTimeline();

  toast("Segmento eliminado.");
}


function moveSegment(dir){

  const target=
    selectedSegment+dir;

  if(
    target<0 ||
    target>=project.segments.length
  ) return;

  saveUndo();

  const a=project.segments;

  [
    a[selectedSegment],
    a[target]
  ]=[
    a[target],
    a[selectedSegment]
  ];

  selectedSegment=target;

  renderTimeline();

  toast("Segmento reordenado.");
}


function undo(){

  if(!undoStack.length){
    toast("Nada que deshacer.");
    return;
  }

  project.segments=
    JSON.parse(
      undoStack.pop()
    );

  renderTimeline();

  toast("Deshecho.");
}


$("#splitBtn").addEventListener(
  "click",
  split
);

$("#deleteBtn").addEventListener(
  "click",
  deleteSegment
);

$("#moveLeft").addEventListener(
  "click",
  ()=>moveSegment(-1)
);

$("#moveRight").addEventListener(
  "click",
  ()=>moveSegment(1)
);

$("#undoBtn").addEventListener(
  "click",
  undo
);

$("#newBtn").addEventListener(
  "click",
  ()=>{
    location.reload();
  }
);


/* ============================================================
   AUDIO
============================================================ */

const volumeTransport=$("#volumeTransport");
const volumeSide=$("#volumeSide");
const volumeValue=$("#volumeValue");
const muteToggle=$("#muteToggle");
const volumeIcon=$("#volumeIcon");
const sideVolumeIcon=$("#sideVolumeIcon");


function updateVideoVolume(){

  video.volume=muted?0:clamp(volume,0,1);
  video.muted=muted;
}


function updateVolume(){

  volumeTransport.value=
    Math.round(volume*100);

  volumeSide.value=
    Math.round(volume*100);

  volumeValue.textContent=
    Math.round(volume*100)+"%";

  const icon=
    muted || volume===0
      ?"🔇"
      :volume<.5
        ?"🔉"
        :"🔊";

  volumeIcon.textContent=icon;
  sideVolumeIcon.textContent=icon;

  updateVideoVolume();
}


function setVolume(value){

  volume=
    clamp(Number(value)/100,0,2);

  if(volume>0 && muted){
    muted=false;
    muteToggle.checked=false;
  }

  updateVolume();
}


volumeTransport.addEventListener(
  "input",
  e=>setVolume(e.target.value)
);

volumeSide.addEventListener(
  "input",
  e=>setVolume(e.target.value)
);

muteToggle.addEventListener(
  "change",
  ()=>{
    muted=muteToggle.checked;
    updateVolume();
  }
);


/* ============================================================
   EXPORTACIÓN
============================================================ */


function drawExportFrame(){
  const ctx=exportCanvas.getContext("2d",{alpha:false});
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality="high";
  drawComposite(ctx,EXPORT_W,EXPORT_H);
  drawExtras(ctx,EXPORT_W,EXPORT_H);
}

async function blobToUint8(blob){
  return new Uint8Array(await blob.arrayBuffer());
}

async function loadFFmpeg(){
  if(ffmpegLoaded && ffmpegInstance) return ffmpegInstance;
  const statusEl=$("#ffmpegStatus");
  statusEl.textContent="Cargando FFmpeg WebAssembly…";
  await window.__loadIneoFFmpegWASM;
  if(!window.FFmpegWASM || !window.FFmpegWASM.FFmpeg){
    throw new Error("No se pudo cargar la librería FFmpeg WebAssembly.");
  }
  const ffmpeg=new window.FFmpegWASM.FFmpeg();
  ffmpeg.on("log",({message})=>{
    if(message && /error|invalid|failed/i.test(message)) console.warn("[FFmpeg]",message);
  });
  ffmpeg.on("progress",({progress})=>{
    if(exporting){
      const p=Math.max(0,Math.min(1,progress||0));
      progressBar.style.width=Math.round(p*100)+"%";
      progressText.textContent=Math.round(p*100)+"% · FFmpeg";
    }
  });
  const toBlobURL=async(url,mime)=>{
    const r=await fetch(url,{mode:"cors",cache:"force-cache"});
    if(!r.ok) throw new Error("No se pudo descargar "+url+" ("+r.status+")");
    const b=await r.blob();
    return URL.createObjectURL(new Blob([b],{type:mime}));
  };
  const base="https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
  const coreURL=await toBlobURL(base+"/ffmpeg-core.js","text/javascript");
  const wasmURL=await toBlobURL(base+"/ffmpeg-core.wasm","application/wasm");
  const workerLoadURL=window.__ineoffmpegWorkerURL;
  if(!workerLoadURL) throw new Error("No se pudo preparar el Worker 814 de FFmpeg.");
  await ffmpeg.load({workerLoadURL,coreURL,wasmURL});

  ffmpegInstance=ffmpeg;
  ffmpegLoaded=true;
  statusEl.textContent="FFmpeg listo. Exportación MP4 habilitada.";
  return ffmpeg;
}

function getInputExtension(){
  const m=(sourceName||"").match(/\.([a-z0-9]+)$/i);
  return m?m[1].toLowerCase():"webm";
}

function makeAudioFilter(){
  const segs=project.segments||[];
  if(!segs.length) return null;
  const vol=muted?0:clamp(volume,0,2);
  const parts=segs.map((s,i)=>
    `[1:a]atrim=start=${s.start.toFixed(4)}:end=${s.end.toFixed(4)},asetpts=PTS-STARTPTS,volume=${vol.toFixed(3)}[a${i}]`
  );
  if(segs.length===1) return {filter:parts[0]+";[a0]anull[aout]",map:"[aout]"};
  return {
    filter:parts.join(";")+";"+segs.map((_,i)=>`[a${i}]`).join("")+
      `concat=n=${segs.length}:v=0:a=1[aout]`,
    map:"[aout]"
  };
}



async function recordRenderedVideo(duration, fps, canvas, video, drawFrame, onProgress){
  if(!window.VideoEncoder || !window.VideoFrame){
    throw new Error("WebCodecs no está disponible. Usá Chrome o Edge actualizado.");
  }
  if(!canvas || !canvas.width || !canvas.height){
    throw new Error("El canvas de exportación no está inicializado.");
  }
  if(!video || !video.videoWidth){
    throw new Error("El video fuente todavía no está listo.");
  }

  const width=canvas.width, height=canvas.height;
  const totalFrames=Math.max(1,Math.ceil(duration*fps));
  const frameDurationUs=Math.round(1000000/fps);
  const chunks=[];
  let encoderError=null;

  const config={
    codec:"avc1.4D002A",
    width, height,
    bitrate: Math.max(4000000, Math.min(18000000, Math.round(width*height*fps*0.055))),
    framerate:fps,
    latencyMode:"quality"
  };
  const support=await VideoEncoder.isConfigSupported(config);
  if(!support.supported) throw new Error("H.264/WebCodecs no admite 720x1280 a "+fps+" FPS en este navegador.");

  const encoder=new VideoEncoder({
    output(chunk){ chunks.push(chunk); },
    error(err){ encoderError=err; }
  });
  encoder.configure(config);

  const seekTo=async t=>{
    if(video.readyState<2) await new Promise(r=>video.addEventListener("loadeddata",r,{once:true}));
    await new Promise((resolve,reject)=>{
      let done=false;
      const finish=()=>{ if(done)return; done=true; cleanup(); resolve(); };
      const fail=()=>{ if(done)return; done=true; cleanup(); reject(new Error("No se pudo decodificar el frame en "+t.toFixed(3)+"s.")); };
      const cleanup=()=>{ video.removeEventListener("seeked",finish); video.removeEventListener("error",fail); };
      video.addEventListener("seeked",finish,{once:true});
      video.addEventListener("error",fail,{once:true});
      video.currentTime=Math.min(Math.max(0,t),Math.max(0,video.duration-0.001));
    });
  };

  try{
    video.pause();
    for(let n=0;n<totalFrames;n++){
      if(cancelExport) break;
      if(encoderError) throw encoderError;

      const t=n/fps;
      await seekTo(t);
      drawFrame(t);

      const frame=new VideoFrame(canvas,{timestamp:n*frameDurationUs,duration:frameDurationUs});
      encoder.encode(frame,{keyFrame:n===0 || n%Math.max(1,Math.round(fps*2))===0});
      frame.close();

      if(encoder.encodeQueueSize>6) await encoder.flush();
      if(onProgress) onProgress((n+1)/totalFrames);
    }
    await encoder.flush();
    if(encoderError) throw encoderError;
    return {chunks,width,height,fps};
  }finally{
    try{encoder.close();}catch(e){}
  }
}

function h264ChunksToUint8Array(chunks){
  let total=0;
  for(const c of chunks) total+=c.byteLength;
  const out=new Uint8Array(total);
  let off=0;
  for(const c of chunks){
    const part=new Uint8Array(c.byteLength);
    c.copyTo(part);
    out.set(part,off);
    off+=part.byteLength;
  }
  return out;
}




async function startExport(){
  if(exporting) return;
  if(!project || totalDuration()<=0){ toast("No hay contenido para exportar."); return; }
  if(!sourceBlob){ toast("No hay archivo fuente para exportar."); return; }

  exporting=true;
  cancelExport=false;
  exportOverlay.hidden=false;
  progressBar.style.width="0%";
  progressText.textContent="0% · Renderizando frames…";

  try{
    const fps=Math.max(1,Number($("#fpsSelect").value||30));
    const bitrate=Math.max(1000000,Number($("#qualitySelect").value||6000000));
    const duration=totalDuration();

    // Render directly into the real 720x1280 canvas. No MediaRecorder.
    const rendered=await recordRenderedVideo(
      duration,fps,exportCanvas,video,drawExportFrame,
      p=>{
        const pct=Math.round(p*85);
        progressBar.style.width=pct+"%";
        progressText.textContent=pct+"% · Renderizando frame "+Math.round(p*duration*fps)+" / "+Math.ceil(duration*fps);
      }
    );
    if(cancelExport) return;

    progressText.textContent="86% · Preparando MP4…";
    const ffmpeg=await loadFFmpeg();
    if(cancelExport) return;

    const inputExt=getInputExtension();
    const inputName=`source.${inputExt}`;
    const rawName="render.h264";
    const output="ineoclips-output.mp4";

    await ffmpeg.writeFile(inputName,await blobToUint8(sourceBlob));
    await ffmpeg.writeFile(rawName,h264ChunksToUint8Array(rendered.chunks));

    const audio=makeAudioFilter();
    const baseVideoArgs=[
      "-f","h264","-framerate",String(fps),"-i",rawName,
      "-i",inputName
    ];

    let args=[...baseVideoArgs];
    if(audio){
      args.push("-filter_complex",audio.filter,"-map","0:v:0","-map",audio.map);
    }else{
      args.push("-map","0:v:0");
    }

    args.push(
      "-c:v","copy"
    );

    if(audio) args.push("-c:a","aac","-b:a","192k","-shortest");
    else args.push("-an");

    args.push("-movflags","+faststart",output);

    progressText.textContent="88% · Generando MP4…";
    let execCode=await ffmpeg.exec(args);

    if((typeof execCode==="number" && execCode!==0) || cancelExport){
      throw new Error("FFmpeg no pudo empaquetar el H.264 en MP4 (código "+execCode+").");
    }

    let data;
    try{
      data=await ffmpeg.readFile(output);
    }catch(readErr){
      if(audio){
        console.warn("[Export] Falló el audio; reintentando video solamente.",readErr);
        try{await ffmpeg.deleteFile(output);}catch(e){}
        const videoOnly=[
          "-f","h264","-framerate",String(fps),"-i",rawName,
          "-map","0:v:0","-c:v","copy","-an","-movflags","+faststart",output
        ];
        execCode=await ffmpeg.exec(videoOnly);
        if(typeof execCode==="number" && execCode!==0) throw readErr;
        data=await ffmpeg.readFile(output);
      }else throw readErr;
    }

    const blob=new Blob([data],{type:"video/mp4"});
    const filename=`ineoclips-${layout}-720x1280-${fps}fps.mp4`;
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download=filename; a.rel="noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);

    try{await ffmpeg.deleteFile(output);}catch(e){}
    try{await ffmpeg.deleteFile(rawName);}catch(e){}
    try{await ffmpeg.deleteFile(inputName);}catch(e){}

    progressBar.style.width="100%";
    progressText.textContent="100% · MP4 listo";
    toast("MP4 exportado correctamente.");
  }catch(err){
    console.error("[Export]",err);
    toast("Error al exportar MP4: "+(err.message||String(err)));
    progressText.textContent="Error de exportación";
  }finally{
    exporting=false;
    exportOverlay.hidden=true;
    playing=false;
    try{video.pause();}catch(e){}
    playBtn.textContent="▶";
  }
}


function finishExport(){
  if(!exporting) return;
  cancelExport=true;
  exporting=false;
  playing=false;
  try{video.pause();}catch(e){}
  playBtn.textContent="▶";
  if(recorder && recorder.state!=="inactive"){
    try{recorder.stop();}catch(e){}
  }
}

$("#exportBtn").addEventListener("click",startExport);
$("#cancelExport").addEventListener("click",()=>{
  cancelExport=true;
  finishExport();
});

/* ============================================================
   KEYBOARD
============================================================ */

window.addEventListener("keydown",e=>{

  if(editorScreen.hidden) return;

  if(
    e.target.matches(
      "input,textarea,select"
    )
  ) return;

  if(e.code==="Space"){

    e.preventDefault();

    playing?pause():play();
  }

  else if(e.key==="s" || e.key==="S"){
    split();
  }

  else if(
    e.key==="Delete" ||
    e.key==="Backspace"
  ){
    deleteSegment();
  }

  else if(
    (e.ctrlKey||e.metaKey) &&
    e.key.toLowerCase()==="z"
  ){

    e.preventDefault();

    undo();
  }

  else if(e.key==="ArrowLeft"){

    e.preventDefault();

    seek(
      playhead-
      (e.shiftKey?1:.2)
    );
  }

  else if(e.key==="ArrowRight"){

    e.preventDefault();

    seek(
      playhead+
      (e.shiftKey?1:.2)
    );
  }

  else if(e.key==="k" || e.key==="K"){

    e.preventDefault();

    addKeyframe();
  }
});


/* ============================================================
   RESIZE
============================================================ */

function fitSource(){

  if(!video.videoWidth || !video.videoHeight){
    return;
  }

  const available=
    Math.max(
      300,
      document.querySelector(".left").clientWidth-2
    );

  const maxHeight=
    Math.max(
      300,
      window.innerHeight*.57
    );

  let width=available;

  let height=
    width*
    video.videoHeight/
    video.videoWidth;

  if(height>maxHeight){

    height=maxHeight;

    width=
      height*
      video.videoWidth/
      video.videoHeight;
  }

  source.style.width=
    Math.round(width)+"px";

  source.style.height=
    Math.round(height)+"px";
}


window.addEventListener(
  "resize",
  ()=>{
    if(editorScreen.hidden) return;

    fitSource();
    renderTimeline();
    updateOverlay();
    drawPreview();
  }
);


/* ============================================================
   REBUILD
============================================================ */

function rebuild(){

  if(!project) return;

  renderTimeline();
  updateOverlay();
  updateTransformControls();
  updateTime();
  drawPreview();
}


/* ============================================================
   INICIALIZACIÓN
============================================================ */

$("#captionsToggle").checked=true;

updateVolume();

})();
