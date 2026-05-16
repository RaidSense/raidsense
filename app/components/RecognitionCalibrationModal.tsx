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

// Predefined reference points on the 44×44 isometric diamond.
// The user places handles on whichever points they can see in the screenshot.
const PRESETS = [
  { key: "top",    label: "◆ Sommet Haut",    tile: [22,  0] as [number, number], color: "#22d3ee" },
  { key: "right",  label: "◆ Sommet Droit",   tile: [43, 22] as [number, number], color: "#facc15" },
  { key: "bottom", label: "◆ Sommet Bas",     tile: [22, 43] as [number, number], color: "#4ade80" },
  { key: "left",   label: "◆ Sommet Gauche",  tile: [ 0, 22] as [number, number], color: "#c084fc" },
  { key: "center", label: "◆ Centre (HDV)",   tile: [22, 22] as [number, number], color: "#f97316" },
] as const;
type PresetKey = typeof PRESETS[number]["key"];

interface Transform { ox: number; oy: number; s: number; r: number }

interface Props {
  imageSrc:     string;
  rawDefenses:  RawRecognizedItem[];
  rawBuildings: RawRecognizedItem[];
  rawWalls:     { pixelX: number; pixelY: number }[];
  onConfirm:    (r: CalibrationResult) => void;
  onCancel:     () => void;
}

// Forward: tile → display pixel
function tile2px(tx: number, ty: number, t: Transform): [number, number] {
  return [t.ox + (tx - ty) * t.s, t.oy + (tx + ty) * t.s * t.r];
}

// Inverse: display pixel → tile (0–43)
function px2tile(px: number, py: number, t: Transform): { x: number; y: number } {
  const dx = px - t.ox, dy = py - t.oy;
  const s = t.s, sr = t.s * t.r;
  return {
    x: Math.max(0, Math.min(43, Math.round((dx / s + dy / sr) / 2))),
    y: Math.max(0, Math.min(43, Math.round((dy / sr - dx / s) / 2))),
  };
}

// General 2-point calibration: any two (pixel → tile) correspondences
function computeTransform(
  ptA: { x: number; y: number }, tileA: [number, number],
  ptB: { x: number; y: number }, tileB: [number, number],
): Transform | null {
  const [ax, ay] = tileA;
  const [bx, by] = tileB;
  const ka = ax - ay, kb = bx - by; // x−y diagonal indices
  const la = ax + ay, lb = bx + by; // x+y anti-diagonal indices

  const dka = ka - kb, dla = la - lb;
  if (Math.abs(dka) < 0.01 || Math.abs(dla) < 0.01) return null; // same diagonal → unsolvable

  const s = (ptA.x - ptB.x) / dka;
  if (s <= 0) return null;
  const r = (ptA.y - ptB.y) / (dla * s);
  if (r <= 0) return null;

  return { ox: ptA.x - ka * s, oy: ptA.y - la * s * r, s, r };
}

export default function RecognitionCalibrationModal({
  imageSrc, rawDefenses, rawBuildings, rawWalls, onConfirm, onCancel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef       = useRef<HTMLImageElement>(null);
  const [imgRect, setImgRect] = useState({ left: 0, top: 0, width: 0, height: 0 });

  // Which preset each handle corresponds to
  const [presetA, setPresetA] = useState<PresetKey>("top");
  const [presetB, setPresetB] = useState<PresetKey>("bottom");

  // Handle positions in container-relative display pixels
  const [ptA, setPtA] = useState({ x: 0, y: 0 });
  const [ptB, setPtB] = useState({ x: 0, y: 0 });

  const dragging = useRef<"a" | "b" | null>(null);

  const measure = useCallback(() => {
    const img = imgRef.current;
    const con = containerRef.current;
    if (!img || !con || !img.naturalWidth) return;
    const iR = img.getBoundingClientRect();
    const cR = con.getBoundingClientRect();
    const rect = { left: iR.left - cR.left, top: iR.top - cR.top, width: iR.width, height: iR.height };
    setImgRect(rect);
    // Default handle positions: A = top tip (~10% from top, centered), B = bottom tip (~90%)
    setPtA({ x: rect.left + rect.width * 0.50, y: rect.top + rect.height * 0.08 });
    setPtB({ x: rect.left + rect.width * 0.50, y: rect.top + rect.height * 0.90 });
  }, []);

  useEffect(() => {
    const con = containerRef.current;
    if (!con) return;
    const obs = new ResizeObserver(measure);
    obs.observe(con);
    return () => obs.disconnect();
  }, [measure]);

  const onMouseDown = (handle: "a" | "b") => (e: React.MouseEvent) => {
    dragging.current = handle;
    e.stopPropagation(); e.preventDefault();
  };

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const cR = containerRef.current.getBoundingClientRect();
    const pt = { x: e.clientX - cR.left, y: e.clientY - cR.top };
    if (dragging.current === "a") setPtA(pt);
    else                          setPtB(pt);
  }, []);

  const stopDrag = useCallback(() => { dragging.current = null; }, []);

  const tileA = PRESETS.find(p => p.key === presetA)!.tile;
  const tileB = PRESETS.find(p => p.key === presetB)!.tile;
  const colorA = PRESETS.find(p => p.key === presetA)!.color;
  const colorB = PRESETS.find(p => p.key === presetB)!.color;
  const labelA = PRESETS.find(p => p.key === presetA)!.label;
  const labelB = PRESETS.find(p => p.key === presetB)!.label;

  const transform = computeTransform(ptA, tileA, ptB, tileB);

  // Invalid pair warning
  const sameKa = Math.abs((tileA[0]-tileA[1]) - (tileB[0]-tileB[1])) < 0.01;
  const sameLa = Math.abs((tileA[0]+tileA[1]) - (tileB[0]+tileB[1])) < 0.01;
  const invalidPair = presetA === presetB || sameKa || sameLa;

  // Grid lines (every 4 tiles + outline)
  const lines: React.ReactNode[] = [];
  if (transform) {
    for (let t = 0; t <= GRID; t += 4) {
      const outline = t === 0 || t === GRID;
      const stroke  = outline ? "rgba(34,211,238,0.85)" : "rgba(34,211,238,0.3)";
      const sw      = outline ? 1.5 : 0.7;
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

  // Convert pixel% to display px
  function pct2disp(pxPct: number, pyPct: number): [number, number] {
    return [imgRect.left + (pxPct / 100) * imgRect.width, imgRect.top + (pyPct / 100) * imgRect.height];
  }

  const allItems = [...rawDefenses, ...rawBuildings];

  function handleConfirm() {
    if (!transform) return;
    function conv(pxPct: number, pyPct: number) {
      const [dx, dy] = pct2disp(pxPct, pyPct);
      return px2tile(dx, dy, transform!);
    }
    onConfirm({
      defenses:  rawDefenses.map( d => ({ id: d.id, level: d.level, ...conv(d.pixelX, d.pixelY) })),
      buildings: rawBuildings.map(b => ({ id: b.id, level: b.level, ...conv(b.pixelX, b.pixelY) })),
      walls:     rawWalls.map(w => conv(w.pixelX, w.pixelY)),
    });
  }

  const handles = [
    { id: "a" as const, pt: ptA, preset: presetA, setPreset: setPresetA, color: colorA, label: labelA, tile: tileA },
    { id: "b" as const, pt: ptB, preset: presetB, setPreset: setPresetB, color: colorB, label: labelB, tile: tileB },
  ];

  // Vertex reference dots (show expected positions if transform valid)
  const refDots = transform ? PRESETS.map(p => {
    const [rx, ry] = tile2px(p.tile[0], p.tile[1], transform);
    return <circle key={p.key} cx={rx} cy={ry} r={3} fill={p.color} fillOpacity={0.6} stroke="white" strokeWidth={0.5} />;
  }) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3">
      <div className="flex flex-col w-full max-w-3xl rounded-xl border border-[#1e2a45] bg-[#06080f] overflow-hidden"
        style={{ maxHeight: "93vh" }}>

        {/* Header */}
        <div className="px-4 py-2.5 border-b border-[#1e2a45] flex-shrink-0">
          <h2 className="text-sm font-bold text-cyan-400">Calibrer la grille isométrique</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Pour chaque poignée, choisis le point de référence visible sur TON screenshot,
            puis glisse la poignée dessus. Choisir des points opposés = meilleure précision.
          </p>
        </div>

        {/* Handle selectors */}
        <div className="flex gap-4 px-4 py-2 border-b border-[#1e2a45] flex-shrink-0">
          {handles.map(h => (
            <div key={h.id} className="flex items-center gap-2 flex-1">
              <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: h.color }} />
              <span className="text-xs text-slate-400 flex-shrink-0">Poignée {h.id.toUpperCase()} =</span>
              <select
                value={h.preset}
                onChange={e => h.setPreset(e.target.value as PresetKey)}
                className="flex-1 rounded border border-[#1e2a45] bg-[#0d1020] px-2 py-0.5 text-xs text-slate-200 focus:outline-none"
              >
                {PRESETS.map(p => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {/* Warning */}
        {invalidPair && (
          <div className="px-4 py-1.5 bg-rose-950/50 border-b border-rose-800 flex-shrink-0">
            <p className="text-xs text-rose-400">
              ⚠ Paire invalide — les deux poignées sont sur la même diagonale.
              Choisis des points différents (ex : Haut + Bas, ou Haut + Droit).
            </p>
          </div>
        )}

        {/* Image + overlay */}
        <div
          ref={containerRef}
          className="relative flex-1 overflow-hidden select-none"
          style={{ minHeight: 260, cursor: dragging.current ? "grabbing" : "default" }}
          onMouseMove={onMouseMove}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imgRef} src={imageSrc} alt="Base CoC"
            className="w-full h-full object-contain pointer-events-none" onLoad={measure} />

          <svg className="absolute inset-0 overflow-visible pointer-events-none"
            style={{ left: 0, top: 0, width: "100%", height: "100%" }}>
            {/* Grid */}
            {lines}
            {/* Predicted vertex positions */}
            {refDots}
            {/* Wall dots */}
            {rawWalls.slice(0, 400).map((w, i) => {
              const [dx, dy] = pct2disp(w.pixelX, w.pixelY);
              return <circle key={i} cx={dx} cy={dy} r={2} fill="rgba(148,163,184,0.45)" />;
            })}
            {/* Building dots */}
            {allItems.map((item, i) => {
              const [dx, dy] = pct2disp(item.pixelX, item.pixelY);
              return <circle key={i} cx={dx} cy={dy} r={4} fill="rgba(251,146,60,0.85)" stroke="white" strokeWidth={1} />;
            })}
            {/* Line between handles */}
            <line x1={ptA.x} y1={ptA.y} x2={ptB.x} y2={ptB.y}
              stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="4 3" />
          </svg>

          {/* Draggable handles (HTML, not SVG, so pointer-events work) */}
          {handles.map(h => (
            <div
              key={h.id}
              onMouseDown={onMouseDown(h.id)}
              title={h.label}
              style={{
                position: "absolute",
                left:   h.pt.x - 11,
                top:    h.pt.y - 11,
                width:  22,
                height: 22,
                borderRadius: "50%",
                backgroundColor: h.color,
                border: "2.5px solid white",
                cursor: "grab",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: "bold",
                color: "black",
                userSelect: "none",
                boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
                zIndex: 10,
              }}
            >
              {h.id.toUpperCase()}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-[#1e2a45] flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-600">
              {allItems.length} bâtiments · {rawWalls.length} murs
              {transform ? ` · échelle ${transform.s.toFixed(1)}px · ratio ${transform.r.toFixed(2)}` : ""}
            </p>
            <div className="flex gap-2">
              <button onClick={onCancel}
                className="rounded-lg border border-[#1e2a45] px-4 py-1.5 text-xs text-slate-400 hover:border-slate-500 transition-colors">
                Annuler
              </button>
              <button onClick={handleConfirm} disabled={!transform || invalidPair}
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
