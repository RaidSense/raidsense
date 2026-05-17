"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { entitySize } from "@/lib/data/grid-occupation";

const GRID = 44;

export interface RawRecognizedItem {
  id: string; pixelX: number; pixelY: number; level: number;
}
export interface CalibrationResult {
  defenses:  { id: string; x: number; y: number; level: number }[];
  buildings: { id: string; x: number; y: number; level: number }[];
  walls:     { x: number; y: number }[];
}

// Vrais sommets du losange CoC (44×44 grid) — coord tile (tx, ty)
//       (0,0)         ← Haut
//      /     \
// (0,43)     (43,0)   ← Gauche / Droit
//      \     /
//       (43,43)       ← Bas
const PRESETS = [
  { key: "top",    label: "◆ Sommet Haut",   tile: [ 0,  0] as [number,number], color: "#22d3ee" },
  { key: "right",  label: "◆ Sommet Droit",  tile: [43,  0] as [number,number], color: "#facc15" },
  { key: "bottom", label: "◆ Sommet Bas",    tile: [43, 43] as [number,number], color: "#4ade80" },
  { key: "left",   label: "◆ Sommet Gauche", tile: [ 0, 43] as [number,number], color: "#c084fc" },
  { key: "center", label: "◆ Centre (HDV)",  tile: [22, 22] as [number,number], color: "#f97316" },
] as const;
type PK = typeof PRESETS[number]["key"];

interface T { ox:number; oy:number; s:number; r:number }

function t2s(tx:number, ty:number, t:T):[number,number] {
  return [t.ox+(tx-ty)*t.s, t.oy+(tx+ty)*t.s*t.r];
}
function s2t(px:number, py:number, t:T):{x:number;y:number} {
  const dx=px-t.ox, dy=py-t.oy, sr=t.s*t.r;
  return {
    x: Math.max(0,Math.min(43,Math.floor((dx/t.s+dy/sr)/2))),
    y: Math.max(0,Math.min(43,Math.floor((dy/sr-dx/t.s)/2))),
  };
}

// Moindres carrés pour n ≥ 2 points de référence.
// Décompose en deux systèmes linéaires 2×2 indépendants :
//   px_i = ox + (tx_i - ty_i) * s
//   py_i = oy + (tx_i + ty_i) * s*r
function calcN(pts:{px:{x:number;y:number};tile:[number,number]}[]):T|null {
  const n=pts.length; if(n<2) return null;
  let sK=0,sKK=0,sPx=0,sKPx=0;
  let sL=0,sLL=0,sPy=0,sLPy=0;
  for(const {px,tile} of pts){
    const k=tile[0]-tile[1], l=tile[0]+tile[1];
    sK+=k; sKK+=k*k; sPx+=px.x; sKPx+=k*px.x;
    sL+=l; sLL+=l*l; sPy+=px.y; sLPy+=l*px.y;
  }
  const detX=n*sKK-sK*sK; if(Math.abs(detX)<1e-6) return null;
  const ox=(sKK*sPx-sK*sKPx)/detX;
  const s =(n*sKPx-sK*sPx)/detX;   if(s<=0) return null;
  const detY=n*sLL-sL*sL;  if(Math.abs(detY)<1e-6) return null;
  const oy=(sLL*sPy-sL*sLPy)/detY;
  const sr=(n*sLPy-sL*sPy)/detY;   if(sr<=0) return null;
  return {ox,oy,s,r:sr/s};
}

export interface RawWallSegment {
  startPixelX: number; startPixelY: number;
  endPixelX:   number; endPixelY:   number;
}

interface Props {
  imageSrc:string; rawDefenses:RawRecognizedItem[]; rawBuildings:RawRecognizedItem[];
  rawWallSegments: RawWallSegment[]; onConfirm:(r:CalibrationResult)=>void; onCancel:()=>void;
}

export default function RecognitionCalibrationModal({
  imageSrc, rawDefenses, rawBuildings, rawWallSegments, onConfirm, onCancel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef       = useRef<HTMLImageElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const handleARef   = useRef<HTMLDivElement>(null);
  const handleBRef   = useRef<HTMLDivElement>(null);
  const handleCRef   = useRef<HTMLDivElement>(null);

  const liveA    = useRef({x:0,y:0});
  const liveB    = useRef({x:0,y:0});
  const liveC    = useRef({x:0,y:0});
  const imgRectR = useRef({left:0,top:0,width:0,height:0});
  const tileAR   = useRef<[number,number]>([0,0]);    // default A = top
  const tileBR   = useRef<[number,number]>([43,0]);   // default B = right
  const tileCR   = useRef<[number,number]>([0,43]);   // default C = left
  const dragging = useRef<"a"|"b"|"c"|null>(null);
  const rafPending = useRef(false);

  const [presetA, setPresetA] = useState<PK>("top");
  const [presetB, setPresetB] = useState<PK>("right");
  const [presetC, setPresetC] = useState<PK>("left");
  const [transform, setTransform] = useState<T|null>(null);
  const [hint, setHint] = useState<string>("");

  useEffect(()=>{ tileAR.current=PRESETS.find(p=>p.key===presetA)!.tile; },[presetA]);
  useEffect(()=>{ tileBR.current=PRESETS.find(p=>p.key===presetB)!.tile; },[presetB]);
  useEffect(()=>{ tileCR.current=PRESETS.find(p=>p.key===presetC)!.tile; },[presetC]);

  const draw = useCallback(()=>{
    const canvas=canvasRef.current; if(!canvas) return;
    const ctx=canvas.getContext("2d"); if(!ctx) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);

    const t=calcN([
      {px:liveA.current,tile:tileAR.current},
      {px:liveB.current,tile:tileBR.current},
      {px:liveC.current,tile:tileCR.current},
    ]);

    if(t){
      // Grille isométrique toutes les 4 tuiles
      for(let ti=0;ti<=GRID;ti+=4){
        const ol=ti===0||ti===GRID;
        ctx.strokeStyle=ol?"rgba(34,211,238,0.85)":"rgba(34,211,238,0.28)";
        ctx.lineWidth=ol?1.5:0.7;
        const[x1,y1]=t2s(ti,0,t);const[x2,y2]=t2s(ti,GRID,t);
        ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
        const[x3,y3]=t2s(0,ti,t);const[x4,y4]=t2s(GRID,ti,t);
        ctx.beginPath();ctx.moveTo(x3,y3);ctx.lineTo(x4,y4);ctx.stroke();
      }
      PRESETS.forEach(p=>{
        const[vx,vy]=t2s(p.tile[0],p.tile[1],t);
        ctx.beginPath();ctx.arc(vx,vy,3,0,Math.PI*2);
        ctx.fillStyle=p.color+"99";ctx.fill();
      });
    }

    // Segments de murs sur l'image
    const ir=imgRectR.current;
    ctx.strokeStyle="rgba(148,163,184,0.7)";ctx.lineWidth=1.5;
    ctx.fillStyle="rgba(148,163,184,0.9)";
    rawWallSegments.forEach(seg=>{
      const x1=ir.left+(seg.startPixelX/100)*ir.width,y1=ir.top+(seg.startPixelY/100)*ir.height;
      const x2=ir.left+(seg.endPixelX/100)*ir.width,  y2=ir.top+(seg.endPixelY/100)*ir.height;
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
      ctx.beginPath();ctx.arc(x1,y1,2.5,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(x2,y2,2.5,0,Math.PI*2);ctx.fill();
    });

    if(t){
      // Aperçu tuiles de murs sur la grille isométrique
      ctx.fillStyle="rgba(148,163,184,0.22)";
      rawWallSegments.forEach(seg=>{
        const s=s2t(ir.left+(seg.startPixelX/100)*ir.width,ir.top+(seg.startPixelY/100)*ir.height,t);
        const e=s2t(ir.left+(seg.endPixelX/100)*ir.width,  ir.top+(seg.endPixelY/100)*ir.height,  t);
        const dx=e.x-s.x,dy=e.y-s.y;
        const steps=Math.max(Math.abs(dx),Math.abs(dy));
        for(let i=0;i<=steps;i++){
          const f=steps?i/steps:0;
          const tx=Math.max(0,Math.min(43,Math.round(s.x+dx*f)));
          const ty=Math.max(0,Math.min(43,Math.round(s.y+dy*f)));
          const[ax,ay]=t2s(tx,ty,t);const[bx,by]=t2s(tx+1,ty,t);
          const[cx2,cy2]=t2s(tx+1,ty+1,t);const[dx2,dy2]=t2s(tx,ty+1,t);
          ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.lineTo(cx2,cy2);ctx.lineTo(dx2,dy2);ctx.closePath();ctx.fill();
        }
      });
      // Aperçu footprints bâtiments (parallelogrammes jaunes)
      [...rawDefenses,...rawBuildings].forEach(item=>{
        const sx=ir.left+(item.pixelX/100)*ir.width;
        const sy=ir.top+(item.pixelY/100)*ir.height;
        const tile=s2t(sx,sy,t);
        const sz=entitySize(item.id);
        const off=Math.floor(sz/2);
        const tx=Math.max(0,Math.min(43,tile.x-off));
        const ty=Math.max(0,Math.min(43,tile.y-off));
        const[ax,ay]=t2s(tx,ty,t);const[bx,by]=t2s(tx+sz,ty,t);
        const[cx2,cy2]=t2s(tx+sz,ty+sz,t);const[dx2,dy2]=t2s(tx,ty+sz,t);
        ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.lineTo(cx2,cy2);ctx.lineTo(dx2,dy2);ctx.closePath();
        ctx.fillStyle="rgba(250,204,21,0.18)";ctx.fill();
        ctx.strokeStyle="rgba(250,204,21,0.7)";ctx.lineWidth=1;ctx.stroke();
      });
    }

    // Points détectés par Claude (orange)
    [...rawDefenses,...rawBuildings].forEach(item=>{
      const dx=ir.left+(item.pixelX/100)*ir.width,dy=ir.top+(item.pixelY/100)*ir.height;
      ctx.beginPath();ctx.arc(dx,dy,4,0,Math.PI*2);
      ctx.fillStyle="rgba(251,146,60,0.85)";ctx.fill();
      ctx.strokeStyle="white";ctx.lineWidth=1;ctx.stroke();
    });

    // Triangle reliant les 3 poignées
    ctx.strokeStyle="rgba(255,255,255,0.18)";ctx.setLineDash([4,3]);ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(liveA.current.x,liveA.current.y);
    ctx.lineTo(liveB.current.x,liveB.current.y);
    ctx.lineTo(liveC.current.x,liveC.current.y);
    ctx.closePath();ctx.stroke();ctx.setLineDash([]);

    setTransform(t);
    setHint(t?`échelle ${t.s.toFixed(1)}px/tile · ratio ${t.r.toFixed(2)}`:"Points invalides");
  },[rawDefenses,rawBuildings,rawWallSegments]);

  const scheduleDraw=useCallback(()=>{
    if(rafPending.current) return;
    rafPending.current=true;
    requestAnimationFrame(()=>{ rafPending.current=false; draw(); });
  },[draw]);

  const measure=useCallback(()=>{
    const img=imgRef.current,con=containerRef.current;
    if(!img||!con||!img.naturalWidth) return;
    const iR=img.getBoundingClientRect(),cR=con.getBoundingClientRect();
    const rect={left:iR.left-cR.left,top:iR.top-cR.top,width:iR.width,height:iR.height};
    imgRectR.current=rect;
    const canvas=canvasRef.current;
    if(canvas){canvas.width=con.clientWidth;canvas.height=con.clientHeight;}
    // A = sommet haut, B = sommet droit, C = sommet gauche
    liveA.current={x:rect.left+rect.width*0.50, y:rect.top+rect.height*0.06};
    liveB.current={x:rect.left+rect.width*0.82, y:rect.top+rect.height*0.48};
    liveC.current={x:rect.left+rect.width*0.18, y:rect.top+rect.height*0.48};
    if(handleARef.current){handleARef.current.style.left=(liveA.current.x-11)+"px";handleARef.current.style.top=(liveA.current.y-11)+"px";}
    if(handleBRef.current){handleBRef.current.style.left=(liveB.current.x-11)+"px";handleBRef.current.style.top=(liveB.current.y-11)+"px";}
    if(handleCRef.current){handleCRef.current.style.left=(liveC.current.x-11)+"px";handleCRef.current.style.top=(liveC.current.y-11)+"px";}
    scheduleDraw();
  },[scheduleDraw]);

  useEffect(()=>{
    const con=containerRef.current; if(!con) return;
    const obs=new ResizeObserver(measure); obs.observe(con);
    return ()=>obs.disconnect();
  },[measure]);

  useEffect(()=>{ scheduleDraw(); },[presetA,presetB,presetC,scheduleDraw]);

  useEffect(()=>{
    function onMove(e:MouseEvent){
      const d=dragging.current; if(!d||!containerRef.current) return;
      const cR=containerRef.current.getBoundingClientRect();
      const pt={x:e.clientX-cR.left,y:e.clientY-cR.top};
      if(d==="a"){ liveA.current=pt; if(handleARef.current){handleARef.current.style.left=(pt.x-11)+"px";handleARef.current.style.top=(pt.y-11)+"px";} }
      else if(d==="b"){ liveB.current=pt; if(handleBRef.current){handleBRef.current.style.left=(pt.x-11)+"px";handleBRef.current.style.top=(pt.y-11)+"px";} }
      else { liveC.current=pt; if(handleCRef.current){handleCRef.current.style.left=(pt.x-11)+"px";handleCRef.current.style.top=(pt.y-11)+"px";} }
      scheduleDraw();
    }
    function onUp(){ dragging.current=null; }
    document.addEventListener("mousemove",onMove);
    document.addEventListener("mouseup",onUp);
    return ()=>{ document.removeEventListener("mousemove",onMove); document.removeEventListener("mouseup",onUp); };
  },[scheduleDraw]);

  const pa=PRESETS.find(p=>p.key===presetA)!;
  const pb=PRESETS.find(p=>p.key===presetB)!;
  const pc=PRESETS.find(p=>p.key===presetC)!;

  // Invalide si : preset dupliqué, ou tous les k (tx-ty) identiques, ou tous les l (tx+ty) identiques
  const ks=[pa.tile[0]-pa.tile[1], pb.tile[0]-pb.tile[1], pc.tile[0]-pc.tile[1]];
  const ls=[pa.tile[0]+pa.tile[1], pb.tile[0]+pb.tile[1], pc.tile[0]+pc.tile[1]];
  const invalidPair=
    presetA===presetB||presetA===presetC||presetB===presetC||
    new Set(ks).size<2||new Set(ls).size<2;

  function handleConfirm(){
    const t=calcN([
      {px:liveA.current,tile:tileAR.current},
      {px:liveB.current,tile:tileBR.current},
      {px:liveC.current,tile:tileCR.current},
    ]);
    if(!t) return;
    const validT=t;
    const ir=imgRectR.current;
    function conv(pxPct:number,pyPct:number){
      return s2t(ir.left+(pxPct/100)*ir.width,ir.top+(pyPct/100)*ir.height,validT);
    }
    function interpolateSegment(seg:RawWallSegment):{x:number;y:number}[]{
      const s=conv(seg.startPixelX,seg.startPixelY);
      const e=conv(seg.endPixelX,  seg.endPixelY);
      const dx=e.x-s.x,dy=e.y-s.y;
      const steps=Math.max(Math.abs(dx),Math.abs(dy));
      if(steps===0) return [s];
      const tiles:{x:number;y:number}[]=[];
      for(let i=0;i<=steps;i++){
        const f=i/steps;
        tiles.push({x:Math.max(0,Math.min(43,Math.round(s.x+dx*f))),y:Math.max(0,Math.min(43,Math.round(s.y+dy*f)))});
      }
      return tiles;
    }
    onConfirm({
      defenses:  rawDefenses.map(d=>({id:d.id,level:d.level,...conv(d.pixelX,d.pixelY)})),
      buildings: rawBuildings.map(b=>({id:b.id,level:b.level,...conv(b.pixelX,b.pixelY)})),
      walls:     rawWallSegments.flatMap(seg=>interpolateSegment(seg)),
    });
  }

  const handles=[
    {id:"a" as const,ref:handleARef,color:pa.color,label:pa.label,presetKey:presetA,setPreset:setPresetA},
    {id:"b" as const,ref:handleBRef,color:pb.color,label:pb.label,presetKey:presetB,setPreset:setPresetB},
    {id:"c" as const,ref:handleCRef,color:pc.color,label:pc.label,presetKey:presetC,setPreset:setPresetC},
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3">
      <div className="flex flex-col w-full max-w-3xl rounded-xl border border-[#1e2a45] bg-[#06080f] overflow-hidden"
        style={{maxHeight:"93vh"}}>

        <div className="px-4 py-2.5 border-b border-[#1e2a45] flex-shrink-0">
          <h2 className="text-sm font-bold text-cyan-400">Calibrer la grille isométrique — 3 points</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Glisse les <b>3 poignées</b> sur des sommets identifiables du losange.
            Plus les points sont éloignés, meilleure est la précision.
            <span className="text-orange-400"> ● orange</span> = détection ·{" "}
            <span className="text-yellow-400">◆ jaune</span> = placement prévu.
          </p>
        </div>

        {/* Sélecteurs de preset — 3 colonnes compactes */}
        <div className="flex gap-2 px-4 py-2 border-b border-[#1e2a45] flex-shrink-0">
          {handles.map(h=>(
            <div key={h.id} className="flex items-center gap-1.5 flex-1 min-w-0">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{backgroundColor:h.color}}/>
              <span className="text-xs text-slate-500 flex-shrink-0">{h.id.toUpperCase()}</span>
              <select value={h.presetKey} onChange={e=>h.setPreset(e.target.value as PK)}
                className="flex-1 min-w-0 rounded border border-[#1e2a45] bg-[#0d1020] px-1.5 py-0.5 text-xs text-slate-200 focus:outline-none">
                {PRESETS.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
          ))}
        </div>

        {invalidPair&&(
          <div className="px-4 py-1.5 bg-rose-950/50 border-b border-rose-800 flex-shrink-0">
            <p className="text-xs text-rose-400">⚠ Points invalides — pas de preset dupliqué. Au moins 2 k (tx−ty) différents ET 2 l (tx+ty) différents. Ex valide : Haut + Droit + Gauche.</p>
          </div>
        )}

        {/* Image + canvas + poignées */}
        <div ref={containerRef} className="relative flex-1 overflow-hidden select-none" style={{minHeight:260}}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imgRef} src={imageSrc} alt="Base CoC"
            className="w-full h-full object-contain pointer-events-none" onLoad={measure}/>
          <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{left:0,top:0}}/>
          {handles.map(h=>(
            <div key={h.id} ref={h.ref}
              onMouseDown={e=>{e.preventDefault();e.stopPropagation();dragging.current=h.id;}}
              title={h.label}
              style={{
                position:"absolute",width:22,height:22,borderRadius:"50%",
                backgroundColor:h.color,border:"2.5px solid white",
                cursor:"grab",display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:10,fontWeight:"bold",color:"black",userSelect:"none",
                boxShadow:"0 2px 8px rgba(0,0,0,0.6)",zIndex:10,
              }}>
              {h.id.toUpperCase()}
            </div>
          ))}
        </div>

        <div className="px-4 py-2.5 border-t border-[#1e2a45] flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-600">
              {[...rawDefenses,...rawBuildings].length} bâtiments · {rawWallSegments.length} segments de murs
              {hint?" · "+hint:""}
            </p>
            <div className="flex gap-2">
              <button onClick={onCancel}
                className="rounded-lg border border-[#1e2a45] px-4 py-1.5 text-xs text-slate-400 hover:border-slate-500 transition-colors">
                Annuler
              </button>
              <button onClick={handleConfirm} disabled={!transform||invalidPair}
                className="rounded-lg bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 px-4 py-1.5 text-xs font-semibold text-white transition-colors">
                Confirmer le placement
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
