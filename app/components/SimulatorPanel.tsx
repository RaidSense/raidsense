"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { TROOPS } from "../../lib/data/troops";
import { DEFENSES } from "../../lib/data/defenses";
import { simulateAttack, PROJECTILE_SPEED } from "../../lib/engine/calculator";
import type {
  SimulationResult,
  TroopDeployment,
  DefensePlacement,
  Vec2,
} from "../../lib/engine/calculator";

// ── Constants ──────────────────────────────────────────────────────────────

const GRID_SIZE  = 44;
const CELL       = 10; // fallback px/tile before ResizeObserver fires in BattleGrid
const DROP_Y     = GRID_SIZE - 1;       // south border tile (43)
const DROP_X_MIN = 4;
const DROP_X_MAX = GRID_SIZE - 5;       // 39
const MAX_TROOP_SLOTS = 5;
const MAX_DEFENSES    = 8;

const TROOP_ABBREV: Record<string, string> = {
  "barbarian":      "Ba", "archer":         "Ar", "giant":    "Gi",
  "goblin":         "Go", "wall-breaker":   "WB", "balloon":  "Bl",
  "wizard":         "Wz", "healer":         "He", "dragon":   "Dr",
  "pekka":          "PK", "baby-dragon":    "BD", "miner":    "Mi",
  "electro-dragon": "ED",
};

const TROOP_COLORS = [
  "text-amber-400", "text-sky-400", "text-emerald-400",
  "text-violet-400", "text-rose-400",
] as const;

const TROOP_COLORS_HEX = [
  "#fbbf24", "#38bdf8", "#34d399", "#a78bfa", "#fb7185",
] as const;

const DEFENSE_FILL: Record<string, string> = {
  "cannon":          "#ef4444",
  "archer-tower":    "#f97316",
  "mortar":          "#eab308",
  "air-defense":     "#3b82f6",
  "wizard-tower":    "#8b5cf6",
  "x-bow":           "#06b6d4",
  "inferno-tower":   "#f43f5e",
  "eagle-artillery": "#f59e0b",
  "scattershot":     "#ec4899",
};

const PALETTE_DEFAULTS: Record<string, number> = {
  "cannon": 10, "archer-tower": 10, "mortar": 8, "air-defense": 8,
  "wizard-tower": 8, "x-bow": 5, "inferno-tower": 4,
  "eagle-artillery": 3, "scattershot": 2,
};

// ── Types ──────────────────────────────────────────────────────────────────

interface TroopSlot {
  slotId: string;
  troopId: string;
  level: number;
  count: number;
}

interface PlacedDefense {
  instanceId: string;
  defenseId: string;
  level: number;
  x: number;
  y: number;
  /** "ground"|"both" for X-Bow, "single"|"multi" for Inferno Tower */
  mode?: string;
}

interface TroopMeta {
  instanceId: string;
  slotId: string;
  troopName: string;
  maxHp: number;
  label: string;
  color: string;
  colorHex: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function borderPositions(total: number): Vec2[] {
  if (total === 0) return [];
  if (total === 1) return [{ x: Math.floor(GRID_SIZE / 2), y: DROP_Y }];
  const span = DROP_X_MAX - DROP_X_MIN;
  return Array.from({ length: total }, (_, i) => ({
    x: Math.round((DROP_X_MIN + (i / (total - 1)) * span) * 10) / 10,
    y: DROP_Y,
  }));
}

function interpolatePosition(
  positions: Vec2[],
  t: number,
  destroyedAt: number | null,
): Vec2 | null {
  if (destroyedAt !== null && t >= destroyedAt) return null;
  if (positions.length === 0) return null;
  const s    = Math.floor(t);
  const frac = t - s;
  const p0   = positions[Math.min(s, positions.length - 1)];
  const p1   = positions[Math.min(s + 1, positions.length - 1)];
  return { x: p0.x + (p1.x - p0.x) * frac, y: p0.y + (p1.y - p0.y) * frac };
}

function buildDeployments(slots: TroopSlot[]): {
  deployments: TroopDeployment[];
  meta: TroopMeta[];
} {
  const positions = borderPositions(slots.reduce((s, sl) => s + sl.count, 0));
  const deployments: TroopDeployment[] = [];
  const meta: TroopMeta[]              = [];
  let pi = 0;

  slots.forEach((slot, si) => {
    const troop = TROOPS.find((t) => t.id === slot.troopId)!;
    const lData = troop.levels.find((l) => l.level === slot.level)!;
    const abbr  = TROOP_ABBREV[slot.troopId] ?? troop.name.slice(0, 2);
    const color    = TROOP_COLORS[si % TROOP_COLORS.length];
    const colorHex = TROOP_COLORS_HEX[si % TROOP_COLORS_HEX.length];

    for (let i = 0; i < slot.count; i++) {
      const id = `${slot.slotId}_${i}`;
      deployments.push({ instanceId: id, troopId: slot.troopId, level: slot.level, dropPosition: positions[pi++] });
      meta.push({ instanceId: id, slotId: slot.slotId, troopName: troop.name, maxHp: lData.hp, label: `${abbr}${i + 1}`, color, colorHex });
    }
  });

  return { deployments, meta };
}

function buildDefensePlacements(placed: PlacedDefense[]): DefensePlacement[] {
  return placed.map((d) => {
    const size = DEFENSES.find((def) => def.id === d.defenseId)?.size ?? 1;
    return {
      instanceId: d.instanceId,
      defenseId:  d.defenseId,
      level:      d.level,
      position:   { x: d.x + size / 2, y: d.y + size / 2 },
      mode:       d.mode,
    };
  });
}

// ── SimulatorPanel ─────────────────────────────────────────────────────────

export default function SimulatorPanel() {
  const [troopSlots, setTroopSlots] = useState<TroopSlot[]>([
    { slotId: "ts-0", troopId: "giant", level: 5, count: 5 },
  ]);
  const [placed, setPlaced] = useState<PlacedDefense[]>([
    { instanceId: "di-0", defenseId: "cannon",       level: 10, x: 22, y: 15 },
    { instanceId: "di-1", defenseId: "archer-tower", level:  8, x: 30, y: 22 },
    { instanceId: "di-2", defenseId: "mortar",       level:  6, x: 14, y: 28 },
  ]);
  const [palLevels, setPalLevels] = useState<Record<string, number>>(PALETTE_DEFAULTS);
  const [result, setResult]       = useState<SimulationResult | null>(null);
  const [meta, setMeta]           = useState<TroopMeta[]>([]);
  const [cellSize, setCellSize]   = useState<number>(CELL); // updated by BattleGrid ResizeObserver

  // ── Replay state ────────────────────────────────────────────────────────────
  const [showReplay,    setShowReplay]    = useState<boolean>(false);
  const [replayPlaying, setReplayPlaying] = useState<boolean>(false);
  const [replayTime,    setReplayTime]    = useState<number>(0);
  const [replaySpeed,   setReplaySpeed]   = useState<1 | 2>(1);
  const rafRef       = useRef<number>(0);
  const lastTsRef    = useRef<number>(0);
  const speedRef     = useRef(replaySpeed);
  const durationRef  = useRef(0);

  useEffect(() => { speedRef.current = replaySpeed; }, [replaySpeed]);

  useEffect(() => {
    if (!replayPlaying) { cancelAnimationFrame(rafRef.current); return; }
    lastTsRef.current = 0;
    const tick = (ts: number) => {
      if (lastTsRef.current > 0) {
        const delta = (ts - lastTsRef.current) / 1000;
        setReplayTime((prev) => {
          const next = prev + delta * speedRef.current;
          if (next >= durationRef.current) { setReplayPlaying(false); return durationRef.current; }
          return next;
        });
      }
      lastTsRef.current = ts;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [replayPlaying]);

  // Troop dots interpolated at current replay time
  // HP is computed from actual projectile impact times (shot.time + travel) — not linearly.
  const replayDots = useMemo(() => {
    if (!showReplay || !result || !meta.length) return undefined;
    return meta.flatMap((m) => {
      const tr = result.troops[m.instanceId];
      if (!tr) return [];
      const pos = interpolatePosition(tr.positionPerSecond, replayTime, tr.destroyedAt);
      if (!pos) return [];
      // Compute HP by subtracting impacts that have landed by replayTime
      let hp = m.maxHp;
      for (const shot of result.shots) {
        if (shot.time > replayTime) break;
        if (shot.targetInstId !== m.instanceId) continue;
        const dx = shot.troopPos.x - shot.defPos.x;
        const dy = shot.troopPos.y - shot.defPos.y;
        const impactTime = shot.time + Math.sqrt(dx * dx + dy * dy) / PROJECTILE_SPEED;
        if (impactTime <= replayTime) hp -= shot.damage;
      }
      const hpPct = m.maxHp > 0 ? Math.max(0, Math.min(1, hp / m.maxHp)) : 0;
      return [{ id: m.instanceId, cx: (pos.x + 0.5) * cellSize, cy: (pos.y + 0.5) * cellSize, fill: m.colorHex, label: m.label, hpPct }];
    });
  }, [showReplay, result, meta, replayTime, cellSize]);

  // Set of defense instanceIds destroyed before current replay time
  const replayDestroyedIds = useMemo(() => {
    if (!showReplay || !result) return undefined;
    const ids = new Set<string>();
    for (const [id, dr] of Object.entries(result.defenses)) {
      if (dr.destroyedAt !== null && replayTime >= dr.destroyedAt) ids.add(id);
    }
    return ids;
  }, [showReplay, result, replayTime]);

  // Projectiles currently in flight at replayTime
  const activeProjectiles = useMemo(() => {
    if (!showReplay || !result?.shots?.length) return undefined;
    const out: { x: number; y: number; color: string }[] = [];
    for (const shot of result.shots) {
      if (shot.time > replayTime) break; // shots are chronological
      const elapsed = replayTime - shot.time;
      const dx  = shot.troopPos.x - shot.defPos.x;
      const dy  = shot.troopPos.y - shot.defPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) continue;
      const travelTime = dist / PROJECTILE_SPEED;
      if (elapsed >= travelTime) continue;
      const t = elapsed / travelTime;
      out.push({
        x:     (shot.defPos.x  + dx * t) * cellSize,
        y:     (shot.defPos.y  + dy * t) * cellSize,
        color: DEFENSE_FILL[shot.defenseId] ?? "#ffffff",
      });
    }
    return out;
  }, [showReplay, result, replayTime, cellSize]);

  // Inferno Tower beams: one entry per target per active Inferno Tower
  const infernoBeams = useMemo(() => {
    if (!showReplay || !result?.shots?.length) return undefined;
    const INFERNO_BEAM_TTL = 0.3; // s — beam disappears after this long without a shot
    const beams: { x1: number; y1: number; x2: number; y2: number; stage: 0|1|2 }[] = [];

    // Group shots by defense instance, look for recent Inferno activity
    const lastShotByDef = new Map<string, { shot: (typeof result.shots)[0]; lockDuration: number }>();
    for (const shot of result.shots) {
      if (shot.time > replayTime) break;
      if (shot.defenseId !== "inferno-tower") continue;
      const prev = lastShotByDef.get(shot.defInstId);
      if (!prev || prev.shot.targetInstId !== shot.targetInstId) {
        // Target changed: reset lock
        lastShotByDef.set(shot.defInstId, { shot, lockDuration: 0.128 });
      } else {
        lastShotByDef.set(shot.defInstId, { shot, lockDuration: prev.lockDuration + 0.128 });
      }
    }

    for (const [, { shot, lockDuration }] of lastShotByDef) {
      if (replayTime - shot.time > INFERNO_BEAM_TTL) continue; // beam expired
      // Troop current position
      const tr = result.troops[shot.targetInstId];
      if (!tr) continue;
      const troopPos = interpolatePosition(tr.positionPerSecond, replayTime, tr.destroyedAt);
      if (!troopPos) continue;
      const stage: 0|1|2 = lockDuration >= 5.25 ? 2 : lockDuration >= 1.5 ? 1 : 0;
      beams.push({
        x1: shot.defPos.x  * cellSize,
        y1: shot.defPos.y  * cellSize,
        x2: (troopPos.x + 0.5) * cellSize,
        y2: (troopPos.y + 0.5) * cellSize,
        stage,
      });
    }
    return beams.length ? beams : undefined;
  }, [showReplay, result, replayTime, cellSize]);

  // Lines from each alive troop to its current target defense during replay
  const targetLines = useMemo(() => {
    if (!showReplay || !result || !meta.length) return undefined;
    const s = Math.floor(replayTime);
    return meta.flatMap((m) => {
      const tr = result.troops[m.instanceId];
      if (!tr) return [];
      const pos = interpolatePosition(tr.positionPerSecond, replayTime, tr.destroyedAt);
      if (!pos) return [];
      const targetDefId = tr.targetPerSecond[Math.min(s, tr.targetPerSecond.length - 1)];
      if (!targetDefId) return [];
      const defense = placed.find((d) => d.instanceId === targetDefId);
      if (!defense) return [];
      const size = DEFENSES.find((def) => def.id === defense.defenseId)?.size ?? 1;
      return [{
        x1: (pos.x + 0.5) * cellSize,
        y1: (pos.y + 0.5) * cellSize,
        x2: (defense.x + size / 2) * cellSize,
        y2: (defense.y + size / 2) * cellSize,
        color: m.colorHex,
      }];
    });
  }, [showReplay, result, meta, placed, replayTime, cellSize]);

  const totalTroops = troopSlots.reduce((s, sl) => s + sl.count, 0);

  function clearResult() {
    setResult(null); setMeta([]);
    setShowReplay(false); setReplayPlaying(false); setReplayTime(0);
  }

  // Troop handlers
  function updateTroopSlot(slotId: string, patch: Partial<Omit<TroopSlot, "slotId">>) {
    setTroopSlots((prev) => prev.map((s) => {
      if (s.slotId !== slotId) return s;
      const next = { ...s, ...patch };
      if (patch.troopId && patch.troopId !== s.troopId) {
        const t = TROOPS.find((t) => t.id === patch.troopId)!;
        next.level = Math.min(s.level, t.levels.length);
      }
      return next;
    }));
    clearResult();
  }

  function addTroopSlot() {
    if (troopSlots.length >= MAX_TROOP_SLOTS) return;
    setTroopSlots((p) => [...p, { slotId: `ts-${Date.now()}`, troopId: "barbarian", level: 1, count: 3 }]);
    clearResult();
  }

  function removeTroopSlot(slotId: string) {
    if (troopSlots.length <= 1) return;
    setTroopSlots((p) => p.filter((s) => s.slotId !== slotId));
    clearResult();
  }

  // Defense handlers
  function handlePlace(x: number, y: number, defenseId: string, level: number) {
    setPlaced((prev) => {
      const newSize = DEFENSES.find((d) => d.id === defenseId)?.size ?? 1;
      // Hors grille
      if (x + newSize > GRID_SIZE || y + newSize > GRID_SIZE) return prev;
      // Chevauchement avec un bâtiment existant
      const overlaps = prev.some((d) => {
        const s = DEFENSES.find((def) => def.id === d.defenseId)?.size ?? 1;
        return !(d.x + s <= x || x + newSize <= d.x || d.y + s <= y || y + newSize <= d.y);
      });
      if (overlaps) return prev;
      if (prev.length >= MAX_DEFENSES) return prev;
      const defaultMode =
        defenseId === "inferno-tower" ? "multi" :
        defenseId === "x-bow"         ? "ground" : undefined;
      return [...prev, { instanceId: `d-${Date.now()}`, defenseId, level, x, y, mode: defaultMode }];
    });
    clearResult();
  }

  function handleModeToggle(instanceId: string) {
    setPlaced((prev) => prev.map((d) => {
      if (d.instanceId !== instanceId) return d;
      if (d.defenseId === "inferno-tower") {
        return { ...d, mode: d.mode === "single" ? "multi" : "single" };
      }
      if (d.defenseId === "x-bow") {
        return { ...d, mode: d.mode === "both" ? "ground" : "both" };
      }
      return d;
    }));
    clearResult();
  }

  function handleRemove(instanceId: string) {
    setPlaced((p) => p.filter((d) => d.instanceId !== instanceId));
    clearResult();
  }

  function handleMove(instanceId: string, toX: number, toY: number) {
    setPlaced((prev) => {
      const defense = prev.find((d) => d.instanceId === instanceId);
      if (!defense) return prev;
      const newSize = DEFENSES.find((d) => d.id === defense.defenseId)?.size ?? 1;
      if (toX + newSize > GRID_SIZE || toY + newSize > GRID_SIZE) return prev;
      const others = prev.filter((d) => d.instanceId !== instanceId);
      const overlaps = others.some((d) => {
        const s = DEFENSES.find((def) => def.id === d.defenseId)?.size ?? 1;
        return !(d.x + s <= toX || toX + newSize <= d.x || d.y + s <= toY || toY + newSize <= d.y);
      });
      if (overlaps) return prev;
      return prev.map((d) => d.instanceId === instanceId ? { ...d, x: toX, y: toY } : d);
    });
    // Stop replay/simulation when a building is moved
    setReplayPlaying(false);
    setShowReplay(false);
    setResult(null);
    setMeta([]);
  }

  function handleSimulate() {
    if (!placed.length || !totalTroops) return;
    const { deployments, meta: m } = buildDeployments(troopSlots);
    setMeta(m);
    setShowReplay(false);
    setReplayPlaying(false);
    setReplayTime(0);
    const r = simulateAttack(deployments, buildDefensePlacements(placed));
    durationRef.current = r.durationSeconds;
    setResult(r);
  }

  function startReplay() {
    setReplayTime(0);
    setReplayPlaying(true);
    setShowReplay(true);
  }

  const survivors = result
    ? Object.values(result.troops).filter((t) => t.destroyedAt === null).length
    : 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 space-y-8">

      {/* Header */}
      <header className="space-y-1">
        <h1 className="text-4xl font-bold tracking-tight text-amber-400">RaidSense</h1>
        <p className="text-sm text-slate-400">Simulateur d&apos;attaque Clash of Clans</p>
      </header>

      {/* Grid + sidebar */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">

        {/* Grid */}
        <div className="min-w-0 flex-1 space-y-2" style={{ maxWidth: 560 }}>
          <p className="text-xs text-slate-500">
            Glisser une défense depuis le panneau → poser sur la grille &nbsp;·&nbsp; Cliquer sur une défense pour la supprimer
          </p>
          <BattleGrid
            placed={placed}
            onPlace={handlePlace}
            onRemove={handleRemove}
            onMove={handleMove}
            onModeToggle={handleModeToggle}
            replayDots={replayDots}
            replayDestroyedIds={replayDestroyedIds}
            activeProjectiles={activeProjectiles}
            infernoBeams={infernoBeams}
            targetLines={targetLines}
            onCellSizeChange={setCellSize}
            result={result}
            replayTime={replayTime}
          />
          <p className="text-xs text-slate-600">
            Grille {GRID_SIZE}×{GRID_SIZE} &nbsp;·&nbsp; bande = zone de drop (bord sud) &nbsp;·&nbsp; {placed.length}/{MAX_DEFENSES} défenses
          </p>
        </div>

        {/* Sidebar */}
        <div className="flex-1 space-y-4" style={{ minWidth: 300 }}>

          {/* Defense palette */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-100">Défenses</h2>
              <span className="text-xs text-slate-500">{placed.length}/{MAX_DEFENSES} sur la grille</span>
            </div>
            <DefensePalette
              palLevels={palLevels}
              onLevelChange={(id, lv) => setPalLevels((p) => ({ ...p, [id]: lv }))}
              cellSize={cellSize}
            />
          </section>

          {/* Troop composer */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-100">Troupes</h2>
            <TroopComposer
              slots={troopSlots}
              totalCount={totalTroops}
              onUpdate={updateTroopSlot}
              onAdd={addTroopSlot}
              onRemove={removeTroopSlot}
            />
          </section>

        </div>
      </div>

      {/* Simulate */}
      <button
        onClick={handleSimulate}
        disabled={!placed.length || !totalTroops}
        className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 active:bg-amber-600 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-slate-950"
      >
        Simuler l&apos;attaque
      </button>

      {/* Replay controls */}
      {result && !showReplay && (
        <button
          onClick={startReplay}
          className="w-full rounded-xl border border-amber-500/40 bg-amber-500/10 py-2.5 text-sm font-semibold text-amber-400 transition-colors hover:bg-amber-500/20"
        >
          ▶ Voir le replay
        </button>
      )}
      {result && showReplay && (
        <ReplayControls
          durationSeconds={result.durationSeconds}
          replayTime={replayTime}
          playing={replayPlaying}
          speed={replaySpeed}
          onPlayPause={() => { lastTsRef.current = 0; setReplayPlaying((p) => !p); }}
          onSpeedToggle={() => setReplaySpeed((s) => (s === 1 ? 2 : 1))}
          onSeek={(t) => { lastTsRef.current = 0; setReplayTime(t); }}
          onClose={() => { setShowReplay(false); setReplayPlaying(false); }}
        />
      )}

      {/* Results */}
      {result && (
        <ResultsSection
          result={result}
          meta={meta}
          placed={placed}
          totalTroops={totalTroops}
          survivors={survivors}
        />
      )}

    </div>
  );
}

// ── BattleGrid ─────────────────────────────────────────────────────────────
// CSS background-image pour les lignes de grille (0 div par cellule).
// Défenses = divs absolus (max 8). SVG overlay = anneau + highlight.
// Event delegation sur le container pour drag & click.
// W et CELL sont calculés dynamiquement dans BattleGrid via ResizeObserver.

interface ReplayDot {
  id: string;
  cx: number;
  cy: number;
  fill: string;
  label: string;
  hpPct: number; // 0–1, current HP / max HP
}

function BattleGrid({
  placed,
  onPlace,
  onRemove,
  replayDots,
  replayDestroyedIds,
  activeProjectiles,
  infernoBeams,
  targetLines,
  onMove,
  onModeToggle,
  onCellSizeChange,
  result: replayResult,
  replayTime,
}: {
  placed: PlacedDefense[];
  onPlace: (x: number, y: number, defenseId: string, level: number) => void;
  onRemove: (instanceId: string) => void;
  replayDots?: ReplayDot[];
  replayDestroyedIds?: Set<string>;
  activeProjectiles?: { x: number; y: number; color: string }[];
  infernoBeams?: { x1: number; y1: number; x2: number; y2: number; stage: 0|1|2 }[];
  targetLines?:  { x1: number; y1: number; x2: number; y2: number; color: string }[];
  onMove?: (instanceId: string, toX: number, toY: number) => void;
  onModeToggle?: (instanceId: string) => void;
  onCellSizeChange?: (size: number) => void;
  result?: import("../../lib/engine/calculator").SimulationResult | null;
  replayTime?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragCell,          setDragCell]          = useState<string | null>(null);
  const [hoveredDefenseId,  setHoveredDefenseId]  = useState<string | null>(null);
  const [cellPx, setCellPx] = useState<number>(CELL);

  // Measure container width → derive cell size; fire onCellSizeChange
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = (width: number) => {
      if (width <= 0) return;
      const cs = width / GRID_SIZE;
      setCellPx(cs);
      onCellSizeChange?.(cs);
    };
    update(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => update(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [onCellSizeChange]);

  const W = cellPx * GRID_SIZE;

  function cellAt(e: { clientX: number; clientY: number }) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = Math.floor((e.clientX - rect.left) / cellPx);
    const y = Math.floor((e.clientY - rect.top)  / cellPx);
    return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE ? { x, y } : null;
  }

  function defenseAt(tileX: number, tileY: number) {
    return placed.find((d) => {
      const size = DEFENSES.find((def) => def.id === d.defenseId)?.size ?? 1;
      return tileX >= d.x && tileX < d.x + size && tileY >= d.y && tileY < d.y + size;
    });
  }

  function onMouseMove(e: React.MouseEvent) {
    const c = cellAt(e);
    const id = c ? (defenseAt(c.x, c.y)?.instanceId ?? null) : null;
    setHoveredDefenseId((prev) => (prev === id ? prev : id));
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const c = cellAt(e);
    if (c) setDragCell((p) => { const k = `${c.x},${c.y}`; return p === k ? p : k; });
  }

  function onDragLeave(e: React.DragEvent) {
    if (!containerRef.current?.contains(e.relatedTarget as Node | null)) setDragCell(null);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const c = cellAt(e);
    setDragCell(null);
    if (!c) return;
    try {
      const payload = JSON.parse(e.dataTransfer.getData("text/plain"));
      if (payload.existingInstanceId) {
        // Moving an already-placed defense
        onMove?.(payload.existingInstanceId, c.x, c.y);
      } else {
        onPlace(c.x, c.y, payload.defenseId, payload.level);
      }
    } catch { /* bad payload */ }
  }

  function onClick(e: React.MouseEvent) {
    const c = cellAt(e);
    if (!c) return;
    const d = defenseAt(c.x, c.y);
    if (d) { setHoveredDefenseId(null); onRemove(d.instanceId); }
  }

  const isModeCapable = (defId: string) => defId === "x-bow" || defId === "inferno-tower";
  const modeLabel = (d: PlacedDefense) => {
    if (d.defenseId === "inferno-tower") return d.mode === "single" ? "S" : "M";
    if (d.defenseId === "x-bow")         return d.mode === "both"   ? "A" : "G";
    return "";
  };

  const defenseSquares = placed.map((d) => {
    const defData   = DEFENSES.find((def) => def.id === d.defenseId);
    const name      = defData?.name ?? d.defenseId;
    const size      = defData?.size ?? 1;
    const destroyed = replayDestroyedIds?.has(d.instanceId) ?? false;
    const hovered   = hoveredDefenseId === d.instanceId;
    const fill      = DEFENSE_FILL[d.defenseId] ?? "#ef4444";
    const pxSize    = size * cellPx - 2;
    const fontSize  = Math.max(6, Math.min(11, pxSize * 0.35));

    return (
      <div
        key={d.instanceId}
        draggable
        title={`${name} Lv${d.level} (${d.x},${d.y}) — glisser: déplacer · clic: supprimer`}
        onDragStart={(e) => defDragStart(e, d, size)}
        onClick={(e) => { e.stopPropagation(); onRemove(d.instanceId); }}
        style={{
          position:        "absolute",
          left:            d.x * cellPx + 1,
          top:             d.y * cellPx + 1,
          width:           pxSize,
          height:          pxSize,
          backgroundColor: fill,
          borderRadius:    3,
          cursor:          "grab",
          zIndex:          1,
          pointerEvents:   "auto",
          opacity:         destroyed ? 0.1 : 1,
          outline:         hovered ? `2px solid ${fill}` : "none",
          outlineOffset:   "2px",
          transition:      "opacity 0.2s, outline 0.1s",
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "center",
          overflow:        "hidden",
        }}
      >
        {/* Level number */}
        <span style={{ color: "rgba(255,255,255,0.85)", fontWeight: 700, fontSize, lineHeight: 1, pointerEvents: "none", userSelect: "none" }}>
          {d.level}
        </span>
        {/* Mode toggle button (X-Bow / Inferno) */}
        {isModeCapable(d.defenseId) && (
          <button
            title={`Mode: ${d.mode} — clic pour basculer`}
            style={{
              position: "absolute", top: 1, right: 1,
              width: Math.max(8, fontSize + 2), height: Math.max(8, fontSize + 2),
              background: "rgba(0,0,0,0.55)", color: "#fff",
              border: "none", borderRadius: 2, cursor: "pointer",
              fontSize: Math.max(5, fontSize - 2), fontWeight: 700, lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
              pointerEvents: "auto", zIndex: 10, padding: 0,
            }}
            onClick={(e) => { e.stopPropagation(); onModeToggle?.(d.instanceId); }}
          >
            {modeLabel(d)}
          </button>
        )}
      </div>
    );
  });

  // Drag-start handler for already-placed defenses (move gesture)
  function defDragStart(e: React.DragEvent, d: PlacedDefense, size: number) {
    e.dataTransfer.setData("text/plain", JSON.stringify({ existingInstanceId: d.instanceId, defenseId: d.defenseId, level: d.level, mode: d.mode }));
    e.dataTransfer.effectAllowed = "move";
    const fill   = DEFENSE_FILL[d.defenseId] ?? "#ef4444";
    const tilePx = Math.round(cellPx * size);
    const ghost  = document.createElement("div");
    ghost.style.cssText = `width:${tilePx}px;height:${tilePx}px;background:${fill};border-radius:4px;opacity:0.85;position:fixed;top:-${tilePx*2}px;left:0;pointer-events:none;`;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, tilePx / 2, tilePx / 2);
    setTimeout(() => document.body.removeChild(ghost), 0);
  }

  return (
    <div
      ref={containerRef}
      className="relative rounded-lg border border-slate-700 overflow-hidden"
      style={{
        width:           "100%",
        aspectRatio:     "1 / 1",
        backgroundImage: [
          "linear-gradient(to right,  #1e293b 1px, transparent 1px)",
          "linear-gradient(to bottom, #1e293b 1px, transparent 1px)",
        ].join(","),
        backgroundSize:  `${cellPx}px ${cellPx}px`,
        backgroundColor: "#0f172a",
        cursor:          "crosshair",
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      onMouseMove={onMouseMove}
      onMouseLeave={() => setHoveredDefenseId(null)}
    >
      {/* Defense markers */}
      {defenseSquares}

      {/* SVG: drop ring + drag highlight */}
      <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%">
        {/* Drop zone: south border band (tiles 41-43) */}
        <rect
          x={DROP_X_MIN * cellPx}
          y={(GRID_SIZE - 3) * cellPx}
          width={(DROP_X_MAX - DROP_X_MIN + 1) * cellPx}
          height={3 * cellPx}
          fill="rgba(251,191,36,0.05)"
          stroke="#f59e0b"
          strokeWidth={1.5}
          strokeDasharray="5 3"
          rx={3}
        />
        {/* Drag-over cell highlight */}
        {dragCell && (
          <rect
            x={parseInt(dragCell.split(",")[0]) * cellPx + 1}
            y={parseInt(dragCell.split(",")[1]) * cellPx + 1}
            width={cellPx - 2}
            height={cellPx - 2}
            fill="rgba(251,191,36,0.2)"
            stroke="#f59e0b"
            strokeWidth={1.5}
            rx={2}
          />
        )}
        {/* Range circle for hovered defense */}
        {(() => {
          if (!hoveredDefenseId) return null;
          const d         = placed.find((p) => p.instanceId === hoveredDefenseId);
          if (!d) return null;
          const defData   = DEFENSES.find((def) => def.id === d.defenseId);
          if (!defData) return null;
          const levelData = defData.levels.find((l) => l.level === d.level);
          if (!levelData) return null;
          const size      = defData.size ?? 1;
          const cx        = (d.x + size / 2) * cellPx;
          const cy        = (d.y + size / 2) * cellPx;
          // Effective range depends on mode
          const effectiveMax =
            d.defenseId === "x-bow"          && d.mode === "both"   ? 11.5 :
            d.defenseId === "inferno-tower"  && d.mode !== "single" ? 10   :
            levelData.maxRange;
          const maxR      = effectiveMax * cellPx;
          const minR      = levelData.minRange * cellPx;
          const color     = DEFENSE_FILL[d.defenseId] ?? "#ef4444";
          // Two-arc SVG circle path (works as compound path for evenodd donut)
          const arc = (r: number) =>
            `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`;
          return (
            <g>
              {/* Filled zone — donut if minRange > 0, full disk otherwise */}
              <path
                d={minR > 0 ? `${arc(maxR)} ${arc(minR)}` : arc(maxR)}
                fillRule="evenodd"
                fill={`${color}30`}
              />
              {/* Outer ring */}
              <circle cx={cx} cy={cy} r={maxR} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.65} />
              {/* Dead-zone ring (minRange) */}
              {minR > 0 && (
                <circle cx={cx} cy={cy} r={minR} fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.55} strokeDasharray="5 3" />
              )}
            </g>
          );
        })()}
        {/* Defense hitboxes — white outline on full size×size footprint */}
        {placed.map((d) => {
          const size = DEFENSES.find((def) => def.id === d.defenseId)?.size ?? 1;
          return (
            <rect key={`hb-${d.instanceId}`}
              x={d.x * cellPx + 0.5} y={d.y * cellPx + 0.5}
              width={size * cellPx - 1} height={size * cellPx - 1}
              fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={0.75}
            />
          );
        })}
        {/* Target lines: troop → current defense (replay) */}
        {targetLines?.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke={l.color} strokeWidth={0.75} strokeOpacity={0.5}
            strokeDasharray="3 2"
          />
        ))}
        {/* Defense HP bars (replay only, step at second boundaries) */}
        {replayResult && placed.map((d) => {
          const defData  = DEFENSES.find((def) => def.id === d.defenseId);
          if (!defData) return null;
          const size     = defData.size ?? 1;
          const maxHp    = defData.levels.find((l) => l.level === d.level)?.hp ?? 1;
          const dr       = replayResult.defenses[d.instanceId];
          if (!dr) return null;
          const s        = Math.min(Math.floor(replayTime ?? 0), dr.hpPerSecond.length - 1);
          const hp       = dr.hpPerSecond[s] ?? maxHp;
          const pct      = Math.max(0, Math.min(1, hp / maxHp));
          const BAR_W    = size * cellPx - 4;
          const BAR_H    = 2;
          const barX     = d.x * cellPx + 2;
          const barY     = (d.y + size) * cellPx - BAR_H - 1;
          const barColor = pct > 0.6 ? "#22c55e" : pct > 0.3 ? "#f59e0b" : "#ef4444";
          return (
            <g key={`hp-${d.instanceId}`}>
              <rect x={barX} y={barY} width={BAR_W} height={BAR_H} rx={1} fill="rgba(0,0,0,0.45)" />
              <rect x={barX} y={barY} width={BAR_W * pct} height={BAR_H} rx={1} fill={barColor} />
            </g>
          );
        })}
        {/* Inferno Tower beams */}
        {infernoBeams?.map((b, i) => {
          const sw    = b.stage === 2 ? 3 : b.stage === 1 ? 2 : 1;
          const color = b.stage === 2 ? "#ffffff" : b.stage === 1 ? "#fbbf24" : "#f97316";
          return (
            <line key={i} x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2}
              stroke={color} strokeWidth={sw} strokeOpacity={0.85} strokeLinecap="round" />
          );
        })}
        {/* Replay: projectiles in flight */}
        {activeProjectiles?.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2} fill={p.color} opacity={0.9} />
        ))}
        {/* Replay: animated troop dots + HP bars */}
        {replayDots?.map((dot) => {
          const BAR_W   = 14;
          const BAR_H   = 2;
          const barX    = dot.cx - BAR_W / 2;
          const barY    = dot.cy + 7;
          const hpColor = dot.hpPct > 0.6 ? "#22c55e" : dot.hpPct > 0.3 ? "#f59e0b" : "#ef4444";
          return (
            <g key={dot.id}>
              {/* Troop hitbox — white ring */}
              <circle cx={dot.cx} cy={dot.cy} r={5.5}
                fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth={0.75} />
              <circle cx={dot.cx} cy={dot.cy} r={5} fill={dot.fill} stroke="rgba(0,0,0,0.6)" strokeWidth={1} />
              <text
                x={dot.cx} y={dot.cy + 1}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={5} fontFamily="monospace" fontWeight="bold"
                fill="rgba(0,0,0,0.7)"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {dot.label}
              </text>
              {/* HP bar */}
              <rect x={barX} y={barY} width={BAR_W} height={BAR_H} rx={1} fill="rgba(0,0,0,0.45)" />
              <rect x={barX} y={barY} width={BAR_W * dot.hpPct} height={BAR_H} rx={1} fill={hpColor} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── ReplayControls ─────────────────────────────────────────────────────────

function ReplayControls({
  durationSeconds, replayTime, playing, speed,
  onPlayPause, onSpeedToggle, onSeek, onClose,
}: {
  durationSeconds: number;
  replayTime: number;
  playing: boolean;
  speed: 1 | 2;
  onPlayPause: () => void;
  onSpeedToggle: () => void;
  onSeek: (t: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-300">Replay</span>
        <button
          onClick={onClose}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          ✕ Fermer
        </button>
      </div>

      {/* Progress slider */}
      <div className="space-y-1">
        <input
          type="range"
          min={0}
          max={durationSeconds}
          step={0.05}
          value={replayTime}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="w-full accent-amber-400 cursor-pointer"
        />
        <div className="flex justify-between text-xs text-slate-500">
          <span>{replayTime.toFixed(1)} s</span>
          <span>{durationSeconds} s</span>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={onPlayPause}
          className="rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 active:bg-amber-600 transition-colors"
        >
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <button
          onClick={onSpeedToggle}
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
            speed === 2
              ? "border-amber-500 bg-amber-500/10 text-amber-400"
              : "border-slate-700 text-slate-400 hover:border-slate-500"
          }`}
        >
          ×{speed}
        </button>
        {!playing && replayTime >= durationSeconds && (
          <button
            onClick={() => onSeek(0)}
            className="ml-auto text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            ↺ Recommencer
          </button>
        )}
      </div>
    </div>
  );
}

// ── DefensePalette ─────────────────────────────────────────────────────────

function DefensePalette({
  palLevels,
  onLevelChange,
  cellSize,
}: {
  palLevels: Record<string, number>;
  onLevelChange: (id: string, level: number) => void;
  cellSize: number;
}) {
  return (
    <div className="space-y-1.5">
      {DEFENSES.map((def) => {
        const level = palLevels[def.id] ?? 1;
        const fill  = DEFENSE_FILL[def.id] ?? "#ef4444";

        return (
          <div
            key={def.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(
                "text/plain",
                JSON.stringify({ defenseId: def.id, level })
              );
              e.dataTransfer.effectAllowed = "copy";

              // Image de drag : carré coloré à la vraie taille du bâtiment
              const tilePx = Math.round(cellSize * (def.size ?? 1));
              const ghost  = document.createElement("div");
              ghost.style.cssText = [
                `width:${tilePx}px`,
                `height:${tilePx}px`,
                `background:${fill}`,
                "border-radius:4px",
                "opacity:0.85",
                `box-shadow:0 2px 10px rgba(0,0,0,0.5)`,
                "position:fixed",
                `top:-${tilePx * 2}px`,  // hors écran
                "left:0",
                "pointer-events:none",
              ].join(";");
              document.body.appendChild(ghost);
              e.dataTransfer.setDragImage(ghost, tilePx / 2, tilePx / 2);
              // Le navigateur prend un snapshot synchrone ; on peut retirer
              setTimeout(() => document.body.removeChild(ghost), 0);
            }}
            className="flex items-center gap-2.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 cursor-grab active:cursor-grabbing hover:border-slate-500 transition-colors select-none"
          >
            {/* Color swatch */}
            <div className="flex-shrink-0 rounded-sm" style={{ width: 10, height: 10, backgroundColor: fill }} />

            {/* Name */}
            <span className="flex-1 text-xs font-medium text-slate-200 truncate">
              {def.name}
            </span>

            {/* Level selector — stops propagation to prevent interfering with drag */}
            <div
              draggable={false}
              onDragStart={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <select
                value={level}
                onChange={(e) => onLevelChange(def.id, Number(e.target.value))}
                className="rounded border border-slate-600 bg-slate-900 text-xs text-slate-200 px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {def.levels.map((l) => (
                  <option key={l.level} value={l.level}>Lv {l.level}</option>
                ))}
              </select>
            </div>

            {/* Drag hint */}
            <span className="text-slate-600 text-xs" aria-hidden>⠿</span>
          </div>
        );
      })}
    </div>
  );
}

// ── TroopComposer ──────────────────────────────────────────────────────────

function TroopComposer({
  slots,
  totalCount,
  onUpdate,
  onAdd,
  onRemove,
}: {
  slots: TroopSlot[];
  totalCount: number;
  onUpdate: (slotId: string, patch: Partial<Omit<TroopSlot, "slotId">>) => void;
  onAdd: () => void;
  onRemove: (slotId: string) => void;
}) {
  return (
    <div className="space-y-3">
      {slots.map((slot, idx) => {
        const troop = TROOPS.find((t) => t.id === slot.troopId)!;
        const lData = troop.levels.find((l) => l.level === slot.level)!;
        const color = TROOP_COLORS[idx % TROOP_COLORS.length];

        return (
          <div key={slot.slotId} className="flex items-end gap-2">
            <div className={`mb-2.5 h-2 w-2 flex-shrink-0 rounded-full bg-current ${color}`} />

            <div className="grid flex-1 grid-cols-3 gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <Field label="Troupe">
                <Select value={slot.troopId} onChange={(e) => onUpdate(slot.slotId, { troopId: e.target.value })}>
                  {TROOPS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Field>
              <Field label={`Niv. (max ${troop.levels.length})`}>
                <Select value={slot.level} onChange={(e) => onUpdate(slot.slotId, { level: Number(e.target.value) })}>
                  {troop.levels.map((l) => <option key={l.level} value={l.level}>Lv {l.level}</option>)}
                </Select>
              </Field>
              <Field label="Qté">
                <Select value={slot.count} onChange={(e) => onUpdate(slot.slotId, { count: Number(e.target.value) })}>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </Select>
              </Field>
              <div className="hidden sm:flex items-end pb-2.5">
                <p className="text-xs leading-tight text-slate-500">
                  {lData.hp} HP<br />{lData.dps} DPS
                </p>
              </div>
            </div>

            <button
              onClick={() => onRemove(slot.slotId)}
              disabled={slots.length <= 1}
              className="mb-1 rounded-lg p-1.5 text-lg leading-none text-slate-600 hover:bg-slate-800 hover:text-rose-400 disabled:pointer-events-none disabled:opacity-0 transition-colors"
            >×</button>
          </div>
        );
      })}

      <div className="flex items-center justify-between pt-1">
        <button
          onClick={onAdd}
          disabled={slots.length >= MAX_TROOP_SLOTS}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-500 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
        >
          + Ajouter un type
        </button>
        <p className="text-xs text-slate-400">
          <span className="font-semibold text-slate-200">{totalCount}</span>{" "}
          troupe{totalCount > 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
}

// ── ResultsSection ─────────────────────────────────────────────────────────

function ResultsSection({
  result, meta, placed, totalTroops, survivors,
}: {
  result: SimulationResult;
  meta: TroopMeta[];
  placed: PlacedDefense[];
  totalTroops: number;
  survivors: number;
}) {
  const destroyedCount = placed.filter(
    (d) => result.defenses[d.instanceId]?.destroyedAt !== null
  ).length;

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6">
      <h2 className="text-base font-semibold text-slate-100">Résultats</h2>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Durée" value={`${result.durationSeconds} secondes`} />
        <StatCard label="Troupes survivantes" value={`${survivors} / ${totalTroops}`} />
        <StatCard label="Défenses détruites" value={`${destroyedCount} / ${placed.length}`} accent />
      </div>

      {/* Per-defense cards */}
      <div>
        <p className="mb-3 text-xs text-slate-500">État des défenses</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {placed.map((d) => {
            const dr  = result.defenses[d.instanceId];
            const def = DEFENSES.find((def) => def.id === d.defenseId)!;
            return (
              <DefenseResultCard
                key={d.instanceId}
                name={`${def.name} Lv${d.level}`}
                position={{ x: d.x, y: d.y }}
                destroyedAt={dr?.destroyedAt ?? null}
                damageDealt={dr?.totalDamageDealt ?? 0}
                color={DEFENSE_FILL[d.defenseId] ?? "#ef4444"}
              />
            );
          })}
        </div>
      </div>

      {/* Eliminated troops */}
      {meta.some((m) => result.troops[m.instanceId]?.destroyedAt !== null) && (
        <div className="space-y-0.5 text-xs text-slate-400">
          <p className="mb-1 text-slate-500">Troupes éliminées</p>
          {meta
            .filter((m) => result.troops[m.instanceId]?.destroyedAt !== null)
            .map((m) => (
              <p key={m.instanceId}>
                <span className={`font-mono font-medium ${m.color}`}>{m.label}</span>
                {" "}— morte à t={result.troops[m.instanceId]!.destroyedAt!.toFixed(1)} sec
              </p>
            ))}
        </div>
      )}

      {/* HP table */}
      <div>
        <p className="mb-3 text-xs text-slate-500">HP des troupes par seconde</p>
        <div className="overflow-x-auto">
          <HpTable result={result} meta={meta} />
        </div>
      </div>

      {/* Combat logs */}
      {result.targetChanges.length > 0 && (
        <div>
          <p className="mb-2 text-xs text-slate-500">Logs de combat — changements de cible ({result.targetChanges.length})</p>
          <div className="max-h-48 overflow-y-auto rounded-xl bg-slate-950 p-3 space-y-0.5 font-mono text-xs">
            {result.targetChanges.map((ev, i) => {
              const troopMeta = meta.find((m) => m.instanceId === ev.troopInstId);
              const label     = troopMeta?.label ?? ev.troopId;
              const color     = troopMeta?.color ?? "text-slate-400";
              const oldDef    = placed.find((d) => d.instanceId === ev.oldTargetId);
              const newDef    = placed.find((d) => d.instanceId === ev.newTargetId);
              const oldName   = oldDef ? `${DEFENSES.find((d) => d.id === oldDef.defenseId)?.name ?? oldDef.defenseId} Lv${oldDef.level}` : "—";
              const newName   = newDef ? `${DEFENSES.find((d) => d.id === newDef.defenseId)?.name ?? newDef.defenseId} Lv${newDef.level}` : "—";
              const reasonLabel = ev.reason === "initial" ? "1ère cible" : ev.reason === "destroyed" ? "détruite" : "plus de cible";
              return (
                <div key={i} className="flex items-baseline gap-1.5 text-slate-400">
                  <span className="text-slate-600 flex-shrink-0">t={ev.time.toFixed(1)}s</span>
                  <span className={`font-semibold flex-shrink-0 ${color}`}>{label}</span>
                  <span className="text-slate-600">→</span>
                  {ev.reason === "initial" ? (
                    <span className="text-emerald-400">{newName}</span>
                  ) : (
                    <>
                      <span className="line-through text-slate-600">{oldName}</span>
                      <span className="text-slate-600">→</span>
                      <span className={ev.newTargetId ? "text-amber-400" : "text-red-500"}>{newName}</span>
                    </>
                  )}
                  <span className="text-slate-700 ml-auto flex-shrink-0">({reasonLabel})</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

// ── DefenseResultCard ──────────────────────────────────────────────────────

function DefenseResultCard({
  name, position, destroyedAt, damageDealt, color,
}: {
  name: string; position: Vec2;
  destroyedAt: number | null; damageDealt: number; color: string;
}) {
  const done = destroyedAt !== null;
  return (
    <div className="rounded-xl bg-slate-800 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: color }} />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-slate-200">{name}</p>
            <p className="text-xs text-slate-500">({position.x}, {position.y})</p>
          </div>
        </div>
        <span className={`flex-shrink-0 text-xs font-semibold ${done ? "text-amber-400" : "text-slate-500"}`}>
          {done ? "Détruit" : "Survit"}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        {done ? `t=${destroyedAt!.toFixed(1)} sec · ` : ""}
        {damageDealt.toLocaleString()} HP infligés
      </p>
    </div>
  );
}

// ── HpTable ────────────────────────────────────────────────────────────────

function HpTable({ result, meta }: { result: SimulationResult; meta: TroopMeta[] }) {
  const maxT = Math.floor(result.durationSeconds);
  const groups: { slotId: string; troopName: string; color: string; members: TroopMeta[] }[] = [];
  for (const m of meta) {
    const g = groups.find((g) => g.slotId === m.slotId);
    if (g) g.members.push(m);
    else groups.push({ slotId: m.slotId, troopName: m.troopName, color: m.color, members: [m] });
  }

  return (
    <table className="w-full text-right font-mono text-xs">
      <thead>
        <tr className="border-b border-slate-700">
          <th className="pb-1 pr-4 text-left" />
          {groups.map((g) => (
            <th key={g.slotId} colSpan={g.members.length} className={`pb-1 px-2 text-center font-semibold ${g.color}`}>
              {g.troopName}
            </th>
          ))}
        </tr>
        <tr className="border-b border-slate-800 text-slate-500">
          <th className="pb-2 pr-4 text-left">t</th>
          {meta.map((m) => <th key={m.instanceId} className={`px-2 pb-2 ${m.color}`}>{m.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: maxT + 1 }, (_, t) => (
          <tr key={t} className="border-b border-slate-800/40 hover:bg-slate-800/30">
            <td className="py-1 pr-4 text-left text-slate-500">{t}s</td>
            {meta.map((m) => {
              const tr   = result.troops[m.instanceId];
              const hp   = tr?.hpPerSecond[t] ?? 0;
              const dead = hp === 0 && tr?.destroyedAt !== null;
              const pct  = hp / m.maxHp;
              const c    = dead ? "text-slate-600" : pct > 0.6 ? "text-slate-200" : pct > 0.3 ? "text-amber-400" : "text-red-400";
              return <td key={m.instanceId} className={`px-2 py-1 ${c}`}>{dead ? "—" : hp}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Primitives ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function Select({ value, onChange, children }: {
  value: string | number;
  onChange: React.ChangeEventHandler<HTMLSelectElement>;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={onChange}
      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
    >
      {children}
    </select>
  );
}

function StatCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-800 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${accent ? "text-amber-400" : "text-slate-200"}`}>{value}</p>
    </div>
  );
}
