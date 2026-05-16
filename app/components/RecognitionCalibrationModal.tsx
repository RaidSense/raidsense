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

interface Props {
  imageSrc:    string;
  rawDefenses: RawRecognizedItem[];
  rawBuildings: RawRecognizedItem[];
  rawWalls:    { pixelX: number; pixelY: number }[];
  onConfirm:   (r: CalibrationResult) => void;
  onCancel:    () => void;
}

// Isometric forward: tile → display pixel
function tileToDisp(tx: number, ty: number, ox: number, oy: number, s: number): [number, number] {
  return [ox + (tx - ty) * s, oy + (tx + ty) * s * 0.5];
}

// Isometric inverse: display pixel → tile (clamped 0–43)
function dispToTile(px: number, py: number, ox: number, oy: number, s: number): { x: number; y: number } {
  const dx = px - ox;
  const dy = py - oy;
  return {
    x: Math.max(0, Math.min(43, Math.round((dx + 2 * dy) / (2 * s)))),
    y: Math.max(0, Math.min(43, Math.round((2 * dy - dx) / (2 * s)))),
  };
}

export default function RecognitionCalibrationModal({
  imageSrc, rawDefenses, rawBuildings, rawWalls, onConfirm, onCancel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef       = useRef<HTMLImageElement>(null);

  // Actual rendered image area (container-relative pixels)
  const [imgRect, setImgRect] = useState({ left: 0, top: 0, width: 0, height: 0 });

  // Grid calibration (display pixels)
  const [ox,    setOx]    = useState(0);
  const [oy,    setOy]    = useState(0);
  const [scale, setScale] = useState(10);

  const dragging  = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });

  // Measure actual image rect in container
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
    // Init grid: top vertex at top-center, scale ≈ tile diagonal
    setOx(rect.left + rect.width  * 0.5);
    setOy(rect.top  + rect.height * 0.04);
    setScale(Math.max(5, rect.width / (GRID * 2 + 4)));
  }, []);

  useEffect(() => {
    const con = containerRef.current;
    if (!con) return;
    const obs = new ResizeObserver(measure);
    obs.observe(con);
    return () => obs.disconnect();
  }, [measure]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, ox, oy };
    e.preventDefault();
  }, [ox, oy]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    setOx(dragStart.current.ox + e.clientX - dragStart.current.mx);
    setOy(dragStart.current.oy + e.clientY - dragStart.current.my);
  }, []);

  const stopDrag = useCallback(() => { dragging.current = false; }, []);

  // SVG grid lines (every 4 tiles + outline)
  const lines: React.ReactNode[] = [];
  for (let t = 0; t <= GRID; t += 4) {
    const outline = t === 0 || t === GRID;
    const stroke  = outline ? "rgba(34,211,238,0.85)" : "rgba(34,211,238,0.3)";
    const sw      = outline ? 1.5 : 0.7;
    const [x1, y1] = tileToDisp(t,    0,    ox, oy, scale);
    const [x2, y2] = tileToDisp(t,    GRID, ox, oy, scale);
    const [x3, y3] = tileToDisp(0,    t,    ox, oy, scale);
    const [x4, y4] = tileToDisp(GRID, t,    ox, oy, scale);
    lines.push(
      <line key={`tx${t}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={sw} />,
      <line key={`ty${t}`} x1={x3} y1={y3} x2={x4} y2={y4} stroke={stroke} strokeWidth={sw} />,
    );
  }

  // Building dots (orange = defenses+buildings, grey = walls)
  function itemToDisp(pxPct: number, pyPct: number): [number, number] {
    return [
      imgRect.left + (pxPct / 100) * imgRect.width,
      imgRect.top  + (pyPct / 100) * imgRect.height,
    ];
  }

  const allItems = [...rawDefenses, ...rawBuildings];
  const dots = allItems.map((item, i) => {
    const [dx, dy] = itemToDisp(item.pixelX, item.pixelY);
    return <circle key={i} cx={dx} cy={dy} r={4} fill="rgba(251,146,60,0.85)" stroke="white" strokeWidth={1} />;
  });

  const wallDots = rawWalls.slice(0, 300).map((w, i) => {
    const [dx, dy] = itemToDisp(w.pixelX, w.pixelY);
    return <circle key={i} cx={dx} cy={dy} r={2} fill="rgba(148,163,184,0.55)" />;
  });

  const [topX, topY] = tileToDisp(0, 0, ox, oy, scale);

  function handleConfirm() {
    if (imgRect.width === 0) return;
    function conv(pxPct: number, pyPct: number) {
      const [dx, dy] = itemToDisp(pxPct, pyPct);
      return dispToTile(dx, dy, ox, oy, scale);
    }
    onConfirm({
      defenses:  rawDefenses.map( d => ({ id: d.id, level: d.level, ...conv(d.pixelX, d.pixelY) })),
      buildings: rawBuildings.map(b => ({ id: b.id, level: b.level, ...conv(b.pixelX, b.pixelY) })),
      walls:     rawWalls.map(w => conv(w.pixelX, w.pixelY)),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3">
      <div className="flex flex-col w-full max-w-3xl rounded-xl border border-[#1e2a45] bg-[#06080f] overflow-hidden"
        style={{ maxHeight: "90vh" }}>

        {/* Header */}
        <div className="px-4 py-2.5 border-b border-[#1e2a45] flex-shrink-0">
          <h2 className="text-sm font-bold text-cyan-400">Calibrer la grille isométrique</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            <b className="text-cyan-300">Glisse</b> la grille pour aligner le point
            <span className="text-cyan-400"> ● (0,0)</span> sur le <b>sommet haut</b> de ta base.
            Utilise le <b>curseur</b> pour ajuster la taille des tiles.
            Les <span className="text-orange-400">● points orange</span> = bâtiments reconnus par Claude.
          </p>
        </div>

        {/* Image + SVG overlay */}
        <div
          ref={containerRef}
          className="relative flex-1 overflow-hidden select-none cursor-grab active:cursor-grabbing"
          style={{ minHeight: 280 }}
          onMouseDown={onMouseDown}
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
          <svg className="absolute inset-0 pointer-events-none overflow-visible"
            style={{ left: 0, top: 0, width: "100%", height: "100%" }}>
            {lines}
            {wallDots}
            {dots}
            {/* Top vertex anchor */}
            <circle cx={topX} cy={topY} r={7} fill="rgba(34,211,238,0.9)" stroke="white" strokeWidth={2} />
            <text x={topX + 10} y={topY + 4} fill="rgba(34,211,238,1)" fontSize={10} fontFamily="monospace">
              ● (0,0)
            </text>
          </svg>
        </div>

        {/* Controls */}
        <div className="px-4 py-3 border-t border-[#1e2a45] flex-shrink-0 space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 w-24 flex-shrink-0">Taille des tiles</span>
            <input type="range" min={3} max={45} step={0.5} value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="flex-1 accent-cyan-500" />
            <span className="text-xs text-slate-400 w-10 text-right font-mono">{scale.toFixed(1)}px</span>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-600">
              {allItems.length} bâtiments · {rawWalls.length} murs reconnus
            </p>
            <div className="flex gap-2">
              <button onClick={onCancel}
                className="rounded-lg border border-[#1e2a45] px-4 py-1.5 text-xs text-slate-400 hover:border-slate-500 transition-colors">
                Annuler
              </button>
              <button onClick={handleConfirm}
                className="rounded-lg bg-cyan-700 hover:bg-cyan-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors">
                Confirmer le placement
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
