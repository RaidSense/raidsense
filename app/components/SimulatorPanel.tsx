"use client";

import { useState } from "react";
import { TROOPS } from "../../lib/data/troops";
import { DEFENSES } from "../../lib/data/defenses";
import { simulateAttack } from "../../lib/engine/calculator";
import type {
  SimulationResult,
  TroopDeployment,
  DefensePlacement,
  Vec2,
} from "../../lib/engine/calculator";

// ── Constants ──────────────────────────────────────────────────────────────

const GRID_SIZE    = 44;
const DROP_CENTER: Vec2 = { x: 22, y: 22 };
const DROP_RADIUS  = 5;
const MAX_TROOP_SLOTS   = 5;
const MAX_DEFENSE_SLOTS = 8;

const TROOP_ABBREV: Record<string, string> = {
  "barbarian":      "Ba",
  "archer":         "Ar",
  "giant":          "Gi",
  "goblin":         "Go",
  "wall-breaker":   "WB",
  "balloon":        "Bl",
  "wizard":         "Wz",
  "healer":         "He",
  "dragon":         "Dr",
  "pekka":          "PK",
  "baby-dragon":    "BD",
  "miner":          "Mi",
  "electro-dragon": "ED",
};

// Accent colours per troop-slot position.
const TROOP_COLORS = [
  "text-amber-400",
  "text-sky-400",
  "text-emerald-400",
  "text-violet-400",
  "text-rose-400",
] as const;

// Fill colours used on the mini-map for each defense type.
const DEFENSE_MAP_FILL: Record<string, string> = {
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

// ── Domain types ───────────────────────────────────────────────────────────

interface TroopSlot {
  slotId: string;
  troopId: string;
  level: number;
  count: number;
}

interface DefenseSlot {
  slotId: string;
  defenseId: string;
  level: number;
  x: number;
  y: number;
}

interface TroopMeta {
  instanceId: string;
  slotId: string;
  troopName: string;
  maxHp: number;
  label: string;
  color: string;
}

// ── Pure helpers ───────────────────────────────────────────────────────────

function ringPositions(total: number): Vec2[] {
  if (total === 0) return [];
  return Array.from({ length: total }, (_, i) => {
    const angle = (2 * Math.PI * i) / total - Math.PI / 2;
    return {
      x: Math.round((DROP_CENTER.x + DROP_RADIUS * Math.cos(angle)) * 10) / 10,
      y: Math.round((DROP_CENTER.y + DROP_RADIUS * Math.sin(angle)) * 10) / 10,
    };
  });
}

function buildDeployments(slots: TroopSlot[]): {
  deployments: TroopDeployment[];
  meta: TroopMeta[];
} {
  const total     = slots.reduce((s, sl) => s + sl.count, 0);
  const positions = ringPositions(total);
  const deployments: TroopDeployment[] = [];
  const meta: TroopMeta[]              = [];
  let posIdx = 0;

  slots.forEach((slot, slotIndex) => {
    const troop     = TROOPS.find((t) => t.id === slot.troopId)!;
    const levelData = troop.levels.find((l) => l.level === slot.level)!;
    const abbrev    = TROOP_ABBREV[slot.troopId] ?? troop.name.slice(0, 2);
    const color     = TROOP_COLORS[slotIndex % TROOP_COLORS.length];

    for (let i = 0; i < slot.count; i++) {
      const instanceId = `${slot.slotId}_${i}`;
      deployments.push({ instanceId, troopId: slot.troopId, level: slot.level, dropPosition: positions[posIdx++] });
      meta.push({ instanceId, slotId: slot.slotId, troopName: troop.name, maxHp: levelData.hp, label: `${abbrev}${i + 1}`, color });
    }
  });

  return { deployments, meta };
}

function buildDefensePlacements(slots: DefenseSlot[]): DefensePlacement[] {
  return slots.map((s) => ({
    instanceId: s.slotId,
    defenseId:  s.defenseId,
    level:      s.level,
    position:   { x: s.x, y: s.y },
  }));
}

function clampCoord(v: number): number {
  return Math.max(0, Math.min(GRID_SIZE - 1, Math.round(v)));
}

// ── Component ──────────────────────────────────────────────────────────────

export default function SimulatorPanel() {
  const [troopSlots, setTroopSlots] = useState<TroopSlot[]>([
    { slotId: "ts-0", troopId: "giant", level: 5, count: 5 },
  ]);
  const [defenseSlots, setDefenseSlots] = useState<DefenseSlot[]>([
    { slotId: "ds-0", defenseId: "cannon",       level: 10, x: 22, y: 15 },
    { slotId: "ds-1", defenseId: "archer-tower",  level: 8,  x: 30, y: 22 },
    { slotId: "ds-2", defenseId: "mortar",        level: 6,  x: 14, y: 28 },
  ]);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [meta,   setMeta]   = useState<TroopMeta[]>([]);

  const totalTroops = troopSlots.reduce((s, sl) => s + sl.count, 0);

  // ── Troop slot handlers ──────────────────────────────────────────────────

  function clearResult() { setResult(null); setMeta([]); }

  function updateTroopSlot(slotId: string, patch: Partial<Omit<TroopSlot, "slotId">>) {
    setTroopSlots((prev) => prev.map((s) => {
      if (s.slotId !== slotId) return s;
      const next = { ...s, ...patch };
      if (patch.troopId !== undefined && patch.troopId !== s.troopId) {
        const t = TROOPS.find((t) => t.id === patch.troopId)!;
        next.level = Math.min(s.level, t.levels.length);
      }
      return next;
    }));
    clearResult();
  }

  function addTroopSlot() {
    if (troopSlots.length >= MAX_TROOP_SLOTS) return;
    setTroopSlots((prev) => [...prev, { slotId: `ts-${Date.now()}`, troopId: "barbarian", level: 1, count: 3 }]);
    clearResult();
  }

  function removeTroopSlot(slotId: string) {
    if (troopSlots.length <= 1) return;
    setTroopSlots((prev) => prev.filter((s) => s.slotId !== slotId));
    clearResult();
  }

  // ── Defense slot handlers ────────────────────────────────────────────────

  function updateDefenseSlot(slotId: string, patch: Partial<Omit<DefenseSlot, "slotId">>) {
    setDefenseSlots((prev) => prev.map((s) => {
      if (s.slotId !== slotId) return s;
      const next = { ...s, ...patch };
      if (patch.defenseId !== undefined && patch.defenseId !== s.defenseId) {
        const d = DEFENSES.find((d) => d.id === patch.defenseId)!;
        next.level = Math.min(s.level, d.levels.length);
      }
      if (patch.x !== undefined) next.x = clampCoord(patch.x);
      if (patch.y !== undefined) next.y = clampCoord(patch.y);
      return next;
    }));
    clearResult();
  }

  function addDefenseSlot() {
    if (defenseSlots.length >= MAX_DEFENSE_SLOTS) return;
    setDefenseSlots((prev) => [...prev, { slotId: `ds-${Date.now()}`, defenseId: "cannon", level: 1, x: 22, y: 22 }]);
    clearResult();
  }

  function removeDefenseSlot(slotId: string) {
    if (defenseSlots.length <= 1) return;
    setDefenseSlots((prev) => prev.filter((s) => s.slotId !== slotId));
    clearResult();
  }

  // ── Simulate ─────────────────────────────────────────────────────────────

  function handleSimulate() {
    const { deployments, meta: newMeta } = buildDeployments(troopSlots);
    const defenses = buildDefensePlacements(defenseSlots);
    setMeta(newMeta);
    setResult(simulateAttack(deployments, defenses));
  }

  const survivors = result
    ? Object.values(result.troops).filter((t) => t.destroyedAt === null).length
    : 0;

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 space-y-8">

      {/* ── Header ── */}
      <header className="space-y-1">
        <h1 className="text-4xl font-bold tracking-tight text-amber-400">RaidSense</h1>
        <p className="text-sm text-slate-400">Simulateur d&apos;attaque Clash of Clans</p>
      </header>

      {/* ── Troupes ── */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-100">Troupes</h2>

        <div className="space-y-2">
          {troopSlots.map((slot, idx) => (
            <TroopSlotRow
              key={slot.slotId}
              slot={slot}
              color={TROOP_COLORS[idx % TROOP_COLORS.length]}
              canRemove={troopSlots.length > 1}
              onUpdate={(p) => updateTroopSlot(slot.slotId, p)}
              onRemove={() => removeTroopSlot(slot.slotId)}
            />
          ))}
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            onClick={addTroopSlot}
            disabled={troopSlots.length >= MAX_TROOP_SLOTS}
            className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Ajouter un type de troupe
          </button>
          <p className="text-xs text-slate-400">
            <span className="font-semibold text-slate-200">{totalTroops}</span> troupe{totalTroops > 1 ? "s" : ""} au total
          </p>
        </div>
      </section>

      {/* ── Défenses ── */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-100">Défenses</h2>

        <div className="flex flex-col gap-6 lg:flex-row">

          {/* Defense list */}
          <div className="flex-1 space-y-2">
            {defenseSlots.map((slot) => (
              <DefenseSlotRow
                key={slot.slotId}
                slot={slot}
                canRemove={defenseSlots.length > 1}
                onUpdate={(p) => updateDefenseSlot(slot.slotId, p)}
                onRemove={() => removeDefenseSlot(slot.slotId)}
              />
            ))}

            <div className="flex items-center justify-between pt-1">
              <button
                onClick={addDefenseSlot}
                disabled={defenseSlots.length >= MAX_DEFENSE_SLOTS}
                className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                + Ajouter une défense
              </button>
              <p className="text-xs text-slate-500">{defenseSlots.length} / {MAX_DEFENSE_SLOTS}</p>
            </div>
          </div>

          {/* Mini-map */}
          <div className="flex flex-col items-center gap-2">
            <MiniMap defenseSlots={defenseSlots} />
            <p className="text-xs text-slate-600">Grille {GRID_SIZE}×{GRID_SIZE} — point de drop (cercle)</p>
          </div>

        </div>
      </section>

      {/* ── Simuler ── */}
      <button
        onClick={handleSimulate}
        disabled={totalTroops === 0 || defenseSlots.length === 0}
        className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 active:bg-amber-600 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-slate-950"
      >
        Simuler l&apos;attaque
      </button>

      {/* ── Résultats ── */}
      {result && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6">
          <h2 className="text-base font-semibold text-slate-100">Résultats</h2>

          {/* Top summary */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Durée" value={`${result.durationSeconds} secondes`} />
            <StatCard
              label="Troupes survivantes"
              value={`${survivors} / ${meta.length}`}
            />
            <StatCard
              label="Défenses détruites"
              value={`${defenseSlots.filter((s) => result.defenses[s.slotId]?.destroyedAt !== null).length} / ${defenseSlots.length}`}
              accent
            />
          </div>

          {/* Per-defense results */}
          <div>
            <p className="mb-3 text-xs text-slate-500">État des défenses</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {defenseSlots.map((slot) => {
                const dr      = result.defenses[slot.slotId];
                const defData = DEFENSES.find((d) => d.id === slot.defenseId)!;
                return (
                  <DefenseResultCard
                    key={slot.slotId}
                    name={`${defData.name} Lv${slot.level}`}
                    position={{ x: slot.x, y: slot.y }}
                    destroyedAt={dr?.destroyedAt ?? null}
                    damageDealt={dr?.totalDamageDealt ?? 0}
                    color={DEFENSE_MAP_FILL[slot.defenseId] ?? "#ef4444"}
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
        </section>
      )}
    </div>
  );
}

// ── TroopSlotRow ───────────────────────────────────────────────────────────

function TroopSlotRow({
  slot, color, canRemove, onUpdate, onRemove,
}: {
  slot: TroopSlot;
  color: string;
  canRemove: boolean;
  onUpdate: (p: Partial<Omit<TroopSlot, "slotId">>) => void;
  onRemove: () => void;
}) {
  const troop     = TROOPS.find((t) => t.id === slot.troopId)!;
  const levelData = troop.levels.find((l) => l.level === slot.level)!;

  return (
    <div className="flex items-end gap-2">
      <div className={`mb-2.5 h-2 w-2 flex-shrink-0 rounded-full bg-current ${color}`} />
      <div className="grid flex-1 grid-cols-3 gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
        <Field label="Troupe">
          <Select value={slot.troopId} onChange={(e) => onUpdate({ troopId: e.target.value })}>
            {TROOPS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label={`Niv. (max ${troop.levels.length})`}>
          <Select value={slot.level} onChange={(e) => onUpdate({ level: Number(e.target.value) })}>
            {troop.levels.map((l) => <option key={l.level} value={l.level}>Lv {l.level}</option>)}
          </Select>
        </Field>
        <Field label="Qté">
          <Select value={slot.count} onChange={(e) => onUpdate({ count: Number(e.target.value) })}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
        </Field>
        <div className="hidden items-end pb-2.5 sm:flex">
          <p className="text-xs leading-tight text-slate-500">{levelData.hp} HP<br />{levelData.dps} DPS</p>
        </div>
      </div>
      <RemoveButton disabled={!canRemove} onClick={onRemove} />
    </div>
  );
}

// ── DefenseSlotRow ─────────────────────────────────────────────────────────

function DefenseSlotRow({
  slot, canRemove, onUpdate, onRemove,
}: {
  slot: DefenseSlot;
  canRemove: boolean;
  onUpdate: (p: Partial<Omit<DefenseSlot, "slotId">>) => void;
  onRemove: () => void;
}) {
  const defense   = DEFENSES.find((d) => d.id === slot.defenseId)!;
  const levelData = defense.levels.find((l) => l.level === slot.level)!;
  const dotColor  = DEFENSE_MAP_FILL[slot.defenseId] ?? "#ef4444";

  return (
    <div className="flex items-end gap-2">
      {/* Color dot matching mini-map */}
      <div
        className="mb-2.5 h-2 w-2 flex-shrink-0 rounded-sm"
        style={{ backgroundColor: dotColor }}
      />
      <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_48px_48px_auto]">
        {/* Type */}
        <Field label="Défense">
          <Select value={slot.defenseId} onChange={(e) => onUpdate({ defenseId: e.target.value })}>
            {DEFENSES.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        {/* Level */}
        <Field label={`Niv. (max ${defense.levels.length})`}>
          <Select value={slot.level} onChange={(e) => onUpdate({ level: Number(e.target.value) })}>
            {defense.levels.map((l) => <option key={l.level} value={l.level}>Lv {l.level}</option>)}
          </Select>
        </Field>
        {/* X */}
        <Field label="X">
          <CoordInput value={slot.x} onChange={(v) => onUpdate({ x: v })} />
        </Field>
        {/* Y */}
        <Field label="Y">
          <CoordInput value={slot.y} onChange={(v) => onUpdate({ y: v })} />
        </Field>
        {/* HP hint */}
        <div className="hidden items-end pb-2.5 sm:flex">
          <p className="text-xs leading-tight text-slate-500">{levelData.hp} HP<br />{levelData.dps} DPS</p>
        </div>
      </div>
      <RemoveButton disabled={!canRemove} onClick={onRemove} />
    </div>
  );
}

// ── MiniMap ────────────────────────────────────────────────────────────────

const CELL = 6; // px per tile
const MAP_PX = GRID_SIZE * CELL; // 264px

function MiniMap({ defenseSlots }: { defenseSlots: DefenseSlot[] }) {
  const gridLines = Array.from(
    { length: Math.floor(GRID_SIZE / 5) + 1 },
    (_, i) => i * 5
  );

  return (
    <svg
      width={MAP_PX}
      height={MAP_PX}
      viewBox={`0 0 ${MAP_PX} ${MAP_PX}`}
      className="flex-shrink-0 rounded-xl border border-slate-700"
    >
      <rect width={MAP_PX} height={MAP_PX} fill="#0f172a" />

      {/* Grid lines every 5 tiles */}
      {gridLines.map((t) => (
        <g key={t}>
          <line x1={0} y1={t * CELL} x2={MAP_PX} y2={t * CELL} stroke="#1e293b" strokeWidth={0.5} />
          <line x1={t * CELL} y1={0} x2={t * CELL} y2={MAP_PX} stroke="#1e293b" strokeWidth={0.5} />
        </g>
      ))}

      {/* Drop ring */}
      <circle
        cx={DROP_CENTER.x * CELL}
        cy={DROP_CENTER.y * CELL}
        r={DROP_RADIUS * CELL}
        fill="rgba(251,191,36,0.04)"
        stroke="#f59e0b"
        strokeWidth={1}
        strokeDasharray="4 3"
      />
      {/* Drop centre dot */}
      <circle cx={DROP_CENTER.x * CELL} cy={DROP_CENTER.y * CELL} r={2.5} fill="#f59e0b" opacity={0.5} />

      {/* Defenses */}
      {defenseSlots.map((slot) => {
        const fill  = DEFENSE_MAP_FILL[slot.defenseId] ?? "#ef4444";
        const label = DEFENSES.find((d) => d.id === slot.defenseId)?.name.slice(0, 4) ?? "?";
        const cx    = slot.x * CELL;
        const cy    = slot.y * CELL;
        return (
          <g key={slot.slotId}>
            <rect x={cx - 4} y={cy - 4} width={8} height={8} rx={1} fill={fill} opacity={0.9}>
              <title>{`${label} Lv${slot.level} (${slot.x}, ${slot.y})`}</title>
            </rect>
          </g>
        );
      })}

      {/* Corner label */}
      <text x={3} y={MAP_PX - 3} fill="#334155" fontSize={7} fontFamily="monospace">
        {GRID_SIZE}×{GRID_SIZE}
      </text>
    </svg>
  );
}

// ── DefenseResultCard ──────────────────────────────────────────────────────

function DefenseResultCard({
  name, position, destroyedAt, damageDealt, color,
}: {
  name: string;
  position: Vec2;
  destroyedAt: number | null;
  damageDealt: number;
  color: string;
}) {
  const destroyed = destroyedAt !== null;
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
        <span className={`flex-shrink-0 text-xs font-semibold ${destroyed ? "text-amber-400" : "text-slate-500"}`}>
          {destroyed ? "Détruit" : "Survit"}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        {destroyed ? `t=${destroyedAt!.toFixed(1)} sec · ` : ""}
        {damageDealt.toLocaleString()} HP infligés
      </p>
    </div>
  );
}

// ── HpTable ────────────────────────────────────────────────────────────────

function HpTable({ result, meta }: { result: SimulationResult; meta: TroopMeta[] }) {
  const maxT = Math.floor(result.durationSeconds);

  const slotGroups: { slotId: string; troopName: string; color: string; members: TroopMeta[] }[] = [];
  for (const m of meta) {
    const g = slotGroups.find((g) => g.slotId === m.slotId);
    if (g) g.members.push(m);
    else slotGroups.push({ slotId: m.slotId, troopName: m.troopName, color: m.color, members: [m] });
  }

  return (
    <table className="w-full text-right font-mono text-xs">
      <thead>
        <tr className="border-b border-slate-700">
          <th className="pb-1 pr-4 text-left" />
          {slotGroups.map((g) => (
            <th key={g.slotId} colSpan={g.members.length} className={`pb-1 px-2 text-center font-semibold ${g.color}`}>
              {g.troopName}
            </th>
          ))}
        </tr>
        <tr className="border-b border-slate-800 text-slate-500">
          <th className="pb-2 pr-4 text-left">t</th>
          {meta.map((m) => (
            <th key={m.instanceId} className={`px-2 pb-2 ${m.color}`}>{m.label}</th>
          ))}
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
              const color = dead ? "text-slate-600" : pct > 0.6 ? "text-slate-200" : pct > 0.3 ? "text-amber-400" : "text-red-400";
              return (
                <td key={m.instanceId} className={`px-2 py-1 ${color}`}>
                  {dead ? "—" : hp}
                </td>
              );
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

function Select({
  value, onChange, children,
}: {
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

function CoordInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      min={0}
      max={GRID_SIZE - 1}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-center text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
    />
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

function RemoveButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title="Supprimer"
      className="mb-1 rounded-lg p-1.5 text-lg leading-none text-slate-600 transition-colors hover:bg-slate-800 hover:text-rose-400 disabled:pointer-events-none disabled:opacity-0"
    >
      ×
    </button>
  );
}
