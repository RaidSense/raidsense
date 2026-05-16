"use client";
import { useState, useRef, useEffect, useCallback } from "react";

const GRID = 44;

export interface RawRecognizedItem {
  id: string; pixelX: number; pixelY: number; level: number;
}
export interface CalibrationResult {
  defenses:  { id: string; x: number; y: number; level: number }[];
  buildings: { id: string; x: number; y: number; level: number }[];
  walls:     { x: number; y: number }[];
}

const PRESETS = [
  { key: "top",    label: "◆ Sommet Haut",   tile: [22,  0] as [number,number], color: "#22d3ee" },
  { key: "right",  label: "◆ Sommet Droit",  tile: [43, 22] as [number,number], color: "#facc15" },
  { key: "bottom", label: "◆ Sommet Bas",    tile: [22, 43] as [number,number], color: "#4ade80" },
  { key: "left",   label: "◆ Sommet Gauche", tile: [ 0, 22] as [number,number], color: "#c084fc" },
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
    x: Math.max(0,Math.min(43,Math.round((dx/t.s+dy/sr)/2))),
    y: Math.max(0,Math.min(43,Math.round((dy/sr-dx/t.s)/2))),
  };
}
function calc(pA:{x:number;y:number}, tA:[number,number], pB:{x:number;y:number}, tB:[number,number]):T|null {
  const [ax,ay]=tA,[bx,by]=tB;
  const dka=(ax-ay)-(bx-by), dla=(ax+ay)-(bx+by);
  if(Math.abs(dka)<0.01||Math.abs(dla)<0.01) return null;
  const s=(pA.x-pB.x)/dka; if(s<=0) return null;
  const r=(pA.y-pB.y)/(dla*s); if(r<=0) return null;
  return {ox:pA.x-(ax-ay)*s, oy:pA.y-(ax+ay)*s*r, s, r};
}

interface Props {
  imageSrc:string; rawDefenses:RawRecognizedItem[]; rawBuildings:RawRecognizedItem[];
  rawWalls:{pixelX:number;pixelY:number}[]; onConfirm:(r:CalibrationResult)=>void; onCancel:()=>void;
}

export default function RecognitionCalibrationModal({
  imageSrc, rawDefenses, rawBuildings, rawWalls, onConfirm, onCancel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef       = useRef<HTMLImageElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const handleARef   = useRef<HTMLDivElement>(null);
  const handleBRef   = useRef<HTMLDivElement>(null);

  // Refs for live drag positions (no React re-renders during drag)
  const liveA    = useRef({x:0,y:0});
  const liveB    = useRef({x:0,y:0});
  const imgRectR = useRef({left:0,top:0,width:0,height:0});
  const tileAR   = useRef<[number,number]>([22,0]);
  const tileBR   = useRef<[number,number]>([22,43]);
  const dragging = useRef<"a"|"b"|null>(null);
  const rafPending = useRef(false);

  // React state — only for non-drag UI
  const [presetA, setPresetA] = useState<PK>("top");
  const [presetB, setPresetB] = useState<PK>("bottom");
  const [transform, setTransform] = useState<T|null>(null);
  const [hint, setHint] = useState<string>("");

  // Keep tile refs in sync with preset state
  useEffect(() => { tileAR.current = PRESETS.find(p=>p.key===presetA)!.tile; }, [presetA]);
  useEffect(() => { tileBR.current = PRESETS.find(p=>p.key===presetB)!.tile; }, [presetB]);

  // Canvas draw (imperative — zero React re-renders)
  const draw = useCallback(() => {
    const canvas = canvasRef.current; if(!canvas) return;
    const ctx = canvas.getContext("2d"); if(!ctx) return;
    const W=canvas.width, H=canvas.height;
    ctx.clearRect(0,0,W,H);
    const t = calc(liveA.current, tileAR.current, liveB.current, tileBR.current);

    if(t) {
      // Grid lines every 4 tiles
      for(let ti=0;ti<=GRID;ti+=4) {
        const ol=ti===0||ti===GRID;
        ctx.strokeStyle = ol?"rgba(34,211,238,0.85)":"rgba(34,211,238,0.28)";
        ctx.lineWidth   = ol?1.5:0.7;
        const [x1,y1]=t2s(ti,0,t);const[x2,y2]=t2s(ti,GRID,t);
        ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
        const [x3,y3]=t2s(0,ti,t);const[x4,y4]=t2s(GRID,ti,t);
        ctx.beginPath();ctx.moveTo(x3,y3);ctx.lineTo(x4,y4);ctx.stroke();
      }
      // Vertex labels
      PRESETS.forEach(p=>{
        const [vx,vy]=t2s(p.tile[0],p.tile[1],t);
        ctx.beginPath();ctx.arc(vx,vy,3,0,Math.PI*2);
        ctx.fillStyle=p.color+"99";ctx.fill();
      });
    }
    // Wall dots
    const ir=imgRectR.current;
    ctx.fillStyle="rgba(148,163,184,0.4)";
    rawWalls.slice(0,400).forEach(w=>{
      const dx=ir.left+(w.pixelX/100)*ir.width, dy=ir.top+(w.pixelY/100)*ir.height;
      ctx.beginPath();ctx.arc(dx,dy,2,0,Math.PI*2);ctx.fill();
    });
    // Building dots
    [...rawDefenses,...rawBuildings].forEach(item=>{
      const dx=ir.left+(item.pixelX/100)*ir.width, dy=ir.top+(item.pixelY/100)*ir.height;
      ctx.beginPath();ctx.arc(dx,dy,4,0,Math.PI*2);
      ctx.fillStyle="rgba(251,146,60,0.85)";ctx.fill();
      ctx.strokeStyle="white";ctx.lineWidth=1;ctx.stroke();
    });
    // Line between handles
    ctx.strokeStyle="rgba(255,255,255,0.2)";ctx.setLineDash([4,3]);ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(liveA.current.x,liveA.current.y);
    ctx.lineTo(liveB.current.x,liveB.current.y);ctx.stroke();ctx.setLineDash([]);

    // Update React state once (for confirm button / ratio display)
    setTransform(t);
    setHint(t?`échelle ${t.s.toFixed(1)}px · ratio ${t.r.toFixed(2)}`:"Paire invalide");
  }, [rawDefenses, rawBuildings, rawWalls]);

  const scheduleDraw = useCallback(() => {
    if(rafPending.current) return;
    rafPending.current = true;
    requestAnimationFrame(()=>{ rafPending.current=false; draw(); });
  }, [draw]);

  // Measure image and init positions
  const measure = useCallback(() => {
    const img=imgRef.current, con=containerRef.current;
    if(!img||!con||!img.naturalWidth) return;
    const iR=img.getBoundingClientRect(), cR=con.getBoundingClientRect();
    const rect={left:iR.left-cR.left,top:iR.top-cR.top,width:iR.width,height:iR.height};
    imgRectR.current=rect;
    // Resize canvas
    const canvas=canvasRef.current;
    if(canvas){canvas.width=con.clientWidth;canvas.height=con.clientHeight;}
    // Default: A = top tip, B = bottom tip
    liveA.current={x:rect.left+rect.width*0.50, y:rect.top+rect.height*0.08};
    liveB.current={x:rect.left+rect.width*0.50, y:rect.top+rect.height*0.90};
    // Move handle divs
    if(handleARef.current){handleARef.current.style.left=(liveA.current.x-11)+"px";handleARef.current.style.top=(liveA.current.y-11)+"px";}
    if(handleBRef.current){handleBRef.current.style.left=(liveB.current.x-11)+"px";handleBRef.current.style.top=(liveB.current.y-11)+"px";}
    scheduleDraw();
  }, [scheduleDraw]);

  useEffect(()=>{
    const con=containerRef.current; if(!con) return;
    const obs=new ResizeObserver(measure); obs.observe(con);
    return ()=>obs.disconnect();
  },[measure]);

  // Redraw when presets change
  useEffect(()=>{ scheduleDraw(); },[presetA, presetB, scheduleDraw]);

  // Global mouse listeners (no React re-renders during drag)
  useEffect(()=>{
    function onMove(e:MouseEvent) {
      if(!dragging.current||!containerRef.current) return;
      const cR=containerRef.current.getBoundingClientRect();
      const pt={x:e.clientX-cR.left, y:e.clientY-cR.top};
      if(dragging.current==="a"){
        liveA.current=pt;
        if(handleARef.current){handleARef.current.style.left=(pt.x-11)+"px";handleARef.current.style.top=(pt.y-11)+"px";}
      } else {
        liveB.current=pt;
        if(handleBRef.current){handleBRef.current.style.left=(pt.x-11)+"px";handleBRef.current.style.top=(pt.y-11)+"px";}
      }
      scheduleDraw();
    }
    function onUp(){dragging.current=null;}
    document.addEventListener("mousemove",onMove);
    document.addEventListener("mouseup",onUp);
    return ()=>{
      document.removeEventListener("mousemove",onMove);
      document.removeEventListener("mouseup",onUp);
    };
  },[scheduleDraw]);

  const pa=PRESETS.find(p=>p.key===presetA)!;
  const pb=PRESETS.find(p=>p.key===presetB)!;
  const invalidPair = presetA===presetB ||
    Math.abs((pa.tile[0]-pa.tile[1])-(pb.tile[0]-pb.tile[1]))<0.01 ||
    Math.abs((pa.tile[0]+pa.tile[1])-(pb.tile[0]+pb.tile[1]))<0.01;

  function handleConfirm() {
    const t=calc(liveA.current,tileAR.current,liveB.current,tileBR.current);
    if(!t) return;
    const validT = t;
    const ir=imgRectR.current;
    function conv(pxPct:number,pyPct:number) {
      return s2t(ir.left+(pxPct/100)*ir.width, ir.top+(pyPct/100)*ir.height, validT);
    }
    onConfirm({
      defenses:  rawDefenses.map(d=>({id:d.id,level:d.level,...conv(d.pixelX,d.pixelY)})),
      buildings: rawBuildings.map(b=>({id:b.id,level:b.level,...conv(b.pixelX,b.pixelY)})),
      walls:     rawWalls.map(w=>conv(w.pixelX,w.pixelY)),
    });
  }

  const handles=[
    {id:"a" as const, ref:handleARef, color:pa.color, label:pa.label, presetKey:presetA, setPreset:setPresetA},
    {id:"b" as const, ref:handleBRef, color:pb.color, label:pb.label, presetKey:presetB, setPreset:setPresetB},
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3">
      <div className="flex flex-col w-full max-w-3xl rounded-xl border border-[#1e2a45] bg-[#06080f] overflow-hidden"
        style={{maxHeight:"93vh"}}>

        <div className="px-4 py-2.5 border-b border-[#1e2a45] flex-shrink-0">
          <h2 className="text-sm font-bold text-cyan-400">Calibrer la grille isométrique</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Glisse les <b>deux poignées</b> sur des points identifiables de ta base.
            Choisis des points <b>opposés</b> pour plus de précision.
            Les <span className="text-orange-400">● orange</span> = bâtiments détectés.
          </p>
        </div>

        {/* Preset selectors */}
        <div className="flex gap-3 px-4 py-2 border-b border-[#1e2a45] flex-shrink-0">
          {handles.map(h=>(
            <div key={h.id} className="flex items-center gap-2 flex-1">
              <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{backgroundColor:h.color}}/>
              <span className="text-xs text-slate-500 flex-shrink-0">{h.id.toUpperCase()} =</span>
              <select value={h.presetKey} onChange={e=>h.setPreset(e.target.value as PK)}
                className="flex-1 rounded border border-[#1e2a45] bg-[#0d1020] px-2 py-0.5 text-xs text-slate-200 focus:outline-none">
                {PRESETS.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
          ))}
        </div>

        {invalidPair&&(
          <div className="px-4 py-1.5 bg-rose-950/50 border-b border-rose-800 flex-shrink-0">
            <p className="text-xs text-rose-400">⚠ Paire invalide — choisir des points non-alignés (ex : Haut + Bas, Haut + Droit).</p>
          </div>
        )}

        {/* Image + canvas overlay + handles */}
        <div ref={containerRef} className="relative flex-1 overflow-hidden select-none"
          style={{minHeight:260}}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imgRef} src={imageSrc} alt="Base CoC"
            className="w-full h-full object-contain pointer-events-none" onLoad={measure}/>

          {/* Canvas overlay — all visuals drawn here, no React re-renders */}
          <canvas ref={canvasRef}
            className="absolute inset-0 pointer-events-none"
            style={{left:0,top:0}}/>

          {/* Draggable handles (HTML divs, positioned via style.left/top during drag) */}
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
              {[...rawDefenses,...rawBuildings].length} bâtiments · {rawWalls.length} murs
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
