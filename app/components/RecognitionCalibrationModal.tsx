"use client";
import { useState, useRef, useEffect, useCallback } from "react";

const GRID = 44;

export interface RawRecognizedItem {
  id:     string;
  pixelX: number; // 0-100 % of image width
  pixelY: number; // 0-100 % of image height
  level:  number;
}

export interface CalibrationResult {
  defenses:  { id: string; x: number; y: number; level: number }[];
  buildings: { id: string; x: number; y: number; level: number }[];
  walls:     { x: number; y: number }[];
}

interface Transform { ox: number; oy: number; s: number; r: number }

interface Props {
  imageSrc:     string;
  rawDefenses:  RawRecognizedItem[];
  rawBuildings: RawRecognizedItem[];
  rawWalls:     { pixelX: number; pixelY: number }[];
  onConfirm:    (r: CalibrationResult) => void;
  onCancel:     () => void;
}

// Forward: tile (tx, ty) → display pixel
function tile2px(tx: number, ty: number, t: Transform): [number, number] {
  return [
    t.ox + (tx - ty) * t.s,
    t.oy + (tx + ty) * t.s * t.r,
  ];
}

// Inverse: display pixel → tile (clamped 0–43)
function px2tile(px: number, py: number, t: Transform): { x: number; y: number } {
  if (t.s <= 0 || t.r <= 0) return { x: 0, y: 0 };
  const dx = px - t.ox;
  const dy = py - t.oy;
  const sr = t.s * t.r;
  return {
    x: Math.max(0, Math.min(43, Math.round((dx / t.s + dy / sr) / 2))),
    y: Math.max(0, Math.min(43, Math.round((dy / sr - dx / t.s) / 2))),
  };
}

// Compute transform from the 2 user-placed handles
function computeTransform(
  topPt:   { x: number; y: number }, // display px of tile(0,0)
  rightPt: { x: number; y: number }, // display px of tile(43,0)
): Transform | null {
  const s = (rightPt.x - topPt.x) / GRID;
  const r = s > 0 ? (rightPt.y - topPt.y) / (GRID * s) : 0;
  if (s <= 0) return null;
  return { ox: topPt.x, oy: topPt.y, s, r: Math.max(0.1, r) };
}

export default function RecognitionCalibrationModal({
  imageSrc, rawDefenses, rawBuildings, rawWalls, onConfirm, onCancel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef       = useRef<HTMLImageElement>(null);
  const [imgRect, setImgRect] = useState({ left: 0, top: 0, width: 0, height: 0 });

  // Two control handles (display px, container-relative)
  const [topPt,   setTopPt]   = useState({ x: 0, y: 0 }); // tile(0,0) = top of diamond
  const [rightPt, setRightPt] = useState({ x: 0, y: 0 }); // tile(43,0) = right of diamond

  const dragging = useRef<"top" | "right" | null>(null);

  const measure = useCallback(() => {
    const img = imgRef.current;
    const con = containerRef.current;
    if (!img || !con || !img.naturalWidth) return;
    const iR = img.getBoundingClientRect();
    const cR = con.getBoundingClientRect();
    const rect = {
      left:   iR.left - cR.left,
      top:    iR.top  - cR.top,
      width:  iR.width,
      height: iR.height,
    };
    setImgRect(rect);

    // Default handle positions:
    // TOP  ≈ top-centre of the base diamond (about 10% from top of image)
    // RIGHT ≈ right vertex (about 85% from left, 45% from top)
    setTopPt({
      x: rect.left + rect.width  * 0.50,
      y: rect.top  + rect.height * 0.10,
    });
    setRightPt({
      x: rect.left + rect.width  * 0.88,
      y: rect.top  + rect.height * 0.48,
    });
  }, []);

  useEffect(() => {
    const con = containerRef.current;
    if (!con) return;
    const obs = new ResizeObserver(measure);
    obs.observe(con);
    return () => obs.disconnect();
  }, [measure]);

  const onMouseDown = useCallback((target: "top" | "right") => (e: React.MouseEvent) => {
    dragging.current = target;
    e.stopPropagation();
    e.preventDefault();
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const cR = containerRef.current.getBoundingClientRect();
    const pt = { x: e.clientX - cR.left, y: e.clientY - cR.top };
    if (dragging.current === "top")   setTopPt(pt);
    if (dragging.current === "right") setRightPt(pt);
  }, []);

  const stopDrag = useCallback(() => { dragging.current = null; }, []);

  const transform = computeTransform(topPt, rightPt);

  // Draw grid lines (every 4 tiles + outline)
  const lines: React.ReactNode[] = [];
  if (transform) {
    for (let t = 0; t <= GRID; t += 4) {
      const outline = t === 0 || t === GRID;
      const stroke  = outline ? "rgba(34,211,238,0.9)" : "rgba(34,211,238,0.35)";
      const sw      = outline ? 1.5 : 0.75;
      const [x1, y1] = tile2px(t,    0,    transform);
      const [x2, y2] = tile2px(t,    GRID, transform);
      const [x3, y3] = tile2px(0,    t,    transform);
      const [x4, y4] = tile2px(GRID, t,    transform);
      lines.push(
        <line key={`tx${t}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={sw} />,
        <line key={`ty${t}`} x1={x3} y1={y3} x2={x4} y2={y4} stroke={stroke} strokeWidth={sw} />,
      );
    }
  }

  // Pixel-percent → display px
  function pctToDisp(pxPct: number, pyPct: number): [number, number] {
    return [
      imgRect.left + (pxPct / 100) * imgRect.width,
      imgRect.top  + (pyPct / 100) * imgRect.height,
    ];
  }

  // Building dots
  const allItems = [...rawDefenses, ...rawBuildings];
  const dots = allItems.map((item, i) => {
    const [dx, dy] = pctToDisp(item.pixelX, item.pixelY);
    return <circle key={i} cx={dx} cy={dy} r={4} fill="rgba(251,146,60,0.85)" stroke="white" strokeWidth={1} />;
  });

  const wallDots = rawWalls.slice(0, 400).map((w, i) => {
    const [dx, dy] = pctToDisp(w.pixelX, w.pixelY);
    return <circle key={i} cx={dx} cy={dy} r={2} fill="rgba(148,163,184,0.5)" />;
  });

  // Vertex labels (0,0), (43,0), (0,43), (43,43)
  const vertexLabels = transform ? [
    { tile: [0, 0]   as [number, number], label: "◆ (0,0) Haut",    color: "rgba(34,211,238,1)" },
    { tile: [43, 0]  as [number, number], label: "◆ (43,0) Droite",  color: "rgba(250,204,21,1)"  },
    { tile: [0, 43]  as [number, number], label: "◆ (0,43) Gauche",  color: "rgba(167,139,250,1)" },
    { tile: [43, 43] as [number, number], label: "◆ (43,43) Bas",    color: "rgba(74,222,128,1)"  },
  ].map(({ tile, label, color }) => {
    const [vx, vy] = tile2px(tile[0], tile[1], transform);
    return <text key={label} x={vx + 6} y={vy} fill={color} fontSize={9} fontFamily="monospace">{label}</text>;
  }) : null;

  function handleConfirm() {
    if (!transform) return;
    function conv(pxPct: number, pyPct: number) {
      const [dx, dy] = pctToDisp(pxPct, pyPct);
      return px2tile(dx, dy, transform!);
    }
    onConfirm({
      defenses:  rawDefenses.map( d => ({ id: d.id, level: d.level, ...conv(d.pixelX, d.pixelY) })),
      buildings: rawBuildings.map(b => ({ id: b.id, level: b.level, ...conv(b.pixelX, b.pixelY) })),
      walls:     rawWalls.map(w => conv(w.pixelX, w.pixelY)),
    });
  }

  // The two draggable handles
  const handles = [
    { pt: topPt,   target: "top"   as const, color: "#22d3ee", label: "Sommet haut (0,0)"  },
    { pt: rightPt, target: "right" as const, color: "#facc15", label: "Sommet droit (43,0)" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3">
      <div className="flex flex-col w-full max-w-3xl rounded-xl border border-[#1e2a45] bg-[#06080f] overflow-hidden"
        style={{ maxHeight: "92vh" }}>

        {/* Header */}
        <div className="px-4 py-2.5 border-b border-[#1e2a45] flex-shrink-0">
          <h2 className="text-sm font-bold text-cyan-400">Calibrer la grille isométrique</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Déplace les <b className="text-cyan-300">◆ deux poignées</b> pour aligner la grille sur ta base :
            <span className="text-cyan-300"> Haut</span> = sommet supérieur du losange,
            <span className="text-yellow-400"> Droite</span> = sommet droit.
            Les <span className="text-orange-400">● orange</span> = bâtiments détectés par Claude.
          </p>
        </div>

        {/* Image + overlay */}
        <div
          ref={containerRef}
          className="relative flex-1 overflow-hidden select-none"
          style={{ minHeight: 280, cursor: dragging.current ? "grabbing" : "default" }}
          onMouseMove={onMouseMove}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={imageSrc}
            alt="Base CoC"
            className="w-full h-full object-contain pointer-events-none"
            onLoad={measure}
          />

          <svg
            className="absolute inset-0 overflow-visible"
            style={{ left: 0, top: 0, width: "100%", height: "100%" }}
          >
            {/* Grid lines */}
            {lines}

            {/* Vertex corner labels */}
            {vertexLabels}

            {/* Building dots */}
            {wallDots}
            {dots}

            {/* Draggable handles */}
            {handles.map(({ pt, target, color, label }) => (
              <g key={target}
                style={{ cursor: "grab" }}
                onMouseDown={onMouseDown(target)}>
                {/* Outer ring */}
                <circle cx={pt.x} cy={pt.y} r={14} fill="transparent" />
                {/* Visible handle */}
                <circle cx={pt.x} cy={pt.y} r={9}
                  fill={color} fillOpacity={0.9}
                  stroke="white" strokeWidth={2} />
                <text x={pt.x} y={pt.y + 1} textAnchor="middle" dominantBaseline="middle"
                  fontSize={8} fontWeight="bold" fill="black" style={{ pointerEvents: "none" }}>
                  ◆
                </text>
                <text x={pt.x} y={pt.y + 20} textAnchor="middle"
                  fontSize={9} fontFamily="monospace" fill={color}
                  stroke="black" strokeWidth={2} paintOrder="stroke"
                  style={{ pointerEvents: "none" }}>
                  {label}
                </text>
              </g>
            ))}

            {/* Line between the two handles */}
            <line x1={topPt.x} y1={topPt.y} x2={rightPt.x} y2={rightPt.y}
              stroke="rgba(255,255,255,0.25)" strokeWidth={1} strokeDasharray="4 3" />
          </svg>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#1e2a45] flex-shrink-0">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-600">
              {allItems.length} bâtiments · {rawWalls.length} murs · ratio iso : {transform ? transform.r.toFixed(2) : "—"}
            </p>
            <div className="flex gap-2">
              <button onClick={onCancel}
                className="rounded-lg border border-[#1e2a45] px-4 py-1.5 text-xs text-slate-400 hover:border-slate-500 transition-colors">
                Annuler
              </button>
              <button onClick={handleConfirm} disabled={!transform}
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
