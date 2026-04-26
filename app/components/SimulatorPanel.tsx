"use client";

import { useState } from "react";
import { TROOPS } from "../../lib/data/troops";
import { simulateAttack } from "../../lib/engine/calculator";
import type { SimulationResult, TroopDeployment, DefensePlacement, Vec2 } from "../../lib/engine/calculator";

// ── Constants ──────────────────────────────────────────────────────────────

const CANNON_LEVEL = 10;
const CANNON_HP    = 930;
const CANNON_DPS   = 128;
const CANNON_RANGE = 9;
const CANNON_POS: Vec2 = { x: 25, y: 25 };
const DROP_RADIUS  = 5;
const MAX_SLOTS    = 5;

// Two-letter abbreviations used as column prefixes in the HP table.
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

// One accent colour per slot position (max 5).
const SLOT_COLORS = [
  "text-amber-400",
  "text-sky-400",
  "text-emerald-400",
  "text-violet-400",
  "text-rose-400",
] as const;

// ── Domain types ───────────────────────────────────────────────────────────

interface TroopSlot {
  slotId: string;
  troopId: string;
  level: number;
  count: number;
}

interface TroopMeta {
  instanceId: string;
  slotId: string;
  troopName: string;
  maxHp: number;
  label: string;   // e.g. "Gi1", "Ar3"
  color: string;   // tailwind text-colour class
}

// ── Pure helpers ───────────────────────────────────────────────────────────

function ringPositions(total: number): Vec2[] {
  if (total === 0) return [];
  return Array.from({ length: total }, (_, i) => {
    const angle = (2 * Math.PI * i) / total - Math.PI / 2;
    return {
      x: Math.round((CANNON_POS.x + DROP_RADIUS * Math.cos(angle)) * 10) / 10,
      y: Math.round((CANNON_POS.y + DROP_RADIUS * Math.sin(angle)) * 10) / 10,
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
    const color     = SLOT_COLORS[slotIndex % SLOT_COLORS.length];

    for (let i = 0; i < slot.count; i++) {
      const instanceId = `${slot.slotId}_${i}`;
      deployments.push({
        instanceId,
        troopId: slot.troopId,
        level: slot.level,
        dropPosition: positions[posIdx++],
      });
      meta.push({
        instanceId,
        slotId: slot.slotId,
        troopName: troop.name,
        maxHp: levelData.hp,
        label: `${abbrev}${i + 1}`,
        color,
      });
    }
  });

  return { deployments, meta };
}

// ── Component ──────────────────────────────────────────────────────────────

export default function SimulatorPanel() {
  const [slots, setSlots] = useState<TroopSlot[]>([
    { slotId: "slot-0", troopId: "giant", level: 5, count: 5 },
  ]);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [meta, setMeta]     = useState<TroopMeta[]>([]);

  const totalCount = slots.reduce((s, sl) => s + sl.count, 0);

  function clearResult() {
    setResult(null);
    setMeta([]);
  }

  function updateSlot(slotId: string, patch: Partial<Omit<TroopSlot, "slotId">>) {
    setSlots((prev) =>
      prev.map((s) => {
        if (s.slotId !== slotId) return s;
        const next = { ...s, ...patch };
        // Clamp level when troop type changes.
        if (patch.troopId !== undefined && patch.troopId !== s.troopId) {
          const newTroop = TROOPS.find((t) => t.id === patch.troopId)!;
          next.level = Math.min(s.level, newTroop.levels.length);
        }
        return next;
      })
    );
    clearResult();
  }

  function addSlot() {
    if (slots.length >= MAX_SLOTS) return;
    setSlots((prev) => [
      ...prev,
      { slotId: `slot-${Date.now()}`, troopId: "barbarian", level: 1, count: 3 },
    ]);
    clearResult();
  }

  function removeSlot(slotId: string) {
    if (slots.length <= 1) return;
    setSlots((prev) => prev.filter((s) => s.slotId !== slotId));
    clearResult();
  }

  function handleSimulate() {
    const { deployments, meta: newMeta } = buildDeployments(slots);
    const defenses: DefensePlacement[] = [
      { instanceId: "cannon_1", defenseId: "cannon", level: CANNON_LEVEL, position: CANNON_POS },
    ];
    setMeta(newMeta);
    setResult(simulateAttack(deployments, defenses));
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 space-y-8">

      {/* ── Header ── */}
      <header className="space-y-1">
        <h1 className="text-4xl font-bold tracking-tight text-amber-400">RaidSense</h1>
        <p className="text-sm text-slate-400">Simulateur d&apos;attaque Clash of Clans</p>
      </header>

      {/* ── Config ── */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-5">
        <h2 className="text-base font-semibold text-slate-100">Configurer l&apos;attaque</h2>

        {/* Slot list */}
        <div className="space-y-2">
          {slots.map((slot, slotIndex) => (
            <SlotRow
              key={slot.slotId}
              slot={slot}
              color={SLOT_COLORS[slotIndex % SLOT_COLORS.length]}
              canRemove={slots.length > 1}
              onUpdate={(patch) => updateSlot(slot.slotId, patch)}
              onRemove={() => removeSlot(slot.slotId)}
            />
          ))}
        </div>

        {/* Add + total */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={addSlot}
            disabled={slots.length >= MAX_SLOTS}
            className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Ajouter un type de troupe
          </button>
          <p className="text-xs text-slate-400">
            <span className="font-semibold text-slate-200">{totalCount}</span>{" "}
            troupe{totalCount > 1 ? "s" : ""} au total
          </p>
        </div>

        {/* Defense info */}
        <div className="rounded-xl bg-slate-800/50 px-4 py-3 text-xs text-slate-400 space-y-1">
          <p>
            <span className="text-slate-300">Défense cible&nbsp;</span>
            Cannon Lv{CANNON_LEVEL}&nbsp;·&nbsp;{CANNON_HP} HP&nbsp;·&nbsp;
            {CANNON_DPS} DPS&nbsp;·&nbsp;portée {CANNON_RANGE}&nbsp;·&nbsp;
            centre ({CANNON_POS.x}, {CANNON_POS.y})
          </p>
          <p>
            <span className="text-slate-300">Drop&nbsp;</span>
            anneau à {DROP_RADIUS} tuiles — toutes les troupes sont dans la portée dès t=0
          </p>
        </div>

        <button
          onClick={handleSimulate}
          disabled={totalCount === 0}
          className="rounded-xl bg-amber-500 px-6 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 active:bg-amber-600 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-slate-900"
        >
          Simuler
        </button>
      </section>

      {/* ── Results ── */}
      {result && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6">
          <h2 className="text-base font-semibold text-slate-100">Résultats</h2>

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Durée" value={`${result.durationSeconds} secondes`} />
            <StatCard
              label="Cannon"
              value={
                result.defenses["cannon_1"].destroyedAt !== null
                  ? `Détruit · t=${result.defenses["cannon_1"].destroyedAt.toFixed(1)} sec`
                  : "Survit"
              }
              accent={result.defenses["cannon_1"].destroyedAt !== null}
            />
            <StatCard
              label="Survivants"
              value={`${Object.values(result.troops).filter((t) => t.destroyedAt === null).length} / ${totalCount}`}
            />
            <StatCard
              label="Dégâts infligés"
              value={`${result.defenses["cannon_1"].totalDamageDealt.toLocaleString()} HP`}
            />
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

// ── SlotRow ────────────────────────────────────────────────────────────────

function SlotRow({
  slot,
  color,
  canRemove,
  onUpdate,
  onRemove,
}: {
  slot: TroopSlot;
  color: string;
  canRemove: boolean;
  onUpdate: (patch: Partial<Omit<TroopSlot, "slotId">>) => void;
  onRemove: () => void;
}) {
  const troop     = TROOPS.find((t) => t.id === slot.troopId)!;
  const levelData = troop.levels.find((l) => l.level === slot.level)!;

  return (
    <div className="flex items-end gap-2">
      {/* Colour dot aligned with the select inputs */}
      <div className={`mb-2.5 h-2 w-2 flex-shrink-0 rounded-full bg-current ${color}`} />

      <div className="grid flex-1 grid-cols-3 gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
        {/* Troop */}
        <Field label="Troupe">
          <Select value={slot.troopId} onChange={(e) => onUpdate({ troopId: e.target.value })}>
            {TROOPS.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </Field>

        {/* Level */}
        <Field label={`Niv. (max ${troop.levels.length})`}>
          <Select value={slot.level} onChange={(e) => onUpdate({ level: Number(e.target.value) })}>
            {troop.levels.map((l) => (
              <option key={l.level} value={l.level}>Lv {l.level}</option>
            ))}
          </Select>
        </Field>

        {/* Count */}
        <Field label="Qté">
          <Select value={slot.count} onChange={(e) => onUpdate({ count: Number(e.target.value) })}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
        </Field>

        {/* Inline stats (hidden on small screens) */}
        <div className="hidden items-end pb-2.5 sm:flex">
          <p className="text-xs leading-tight text-slate-500">
            {levelData.hp} HP<br />{levelData.dps} DPS
          </p>
        </div>
      </div>

      {/* Remove button */}
      <button
        onClick={onRemove}
        disabled={!canRemove}
        title="Supprimer cette troupe"
        className="mb-1 rounded-lg p-1.5 text-lg leading-none text-slate-600 transition-colors hover:bg-slate-800 hover:text-rose-400 disabled:pointer-events-none disabled:opacity-0"
      >
        ×
      </button>
    </div>
  );
}

// ── Primitives ─────────────────────────────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
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

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-800 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${accent ? "text-amber-400" : "text-slate-200"}`}>
        {value}
      </p>
    </div>
  );
}

// ── HpTable ────────────────────────────────────────────────────────────────

function HpTable({ result, meta }: { result: SimulationResult; meta: TroopMeta[] }) {
  const maxT = Math.floor(result.durationSeconds);

  // Build ordered slot groups for the colspan header row.
  const slotGroups: { slotId: string; troopName: string; color: string; members: TroopMeta[] }[] =
    [];
  for (const m of meta) {
    const g = slotGroups.find((g) => g.slotId === m.slotId);
    if (g) {
      g.members.push(m);
    } else {
      slotGroups.push({ slotId: m.slotId, troopName: m.troopName, color: m.color, members: [m] });
    }
  }

  return (
    <table className="w-full text-right font-mono text-xs">
      <thead>
        {/* Group header: one cell per slot spanning its columns */}
        <tr className="border-b border-slate-700">
          <th className="pb-1 pr-4 text-left" />
          {slotGroups.map((g) => (
            <th
              key={g.slotId}
              colSpan={g.members.length}
              className={`pb-1 px-2 text-center text-xs font-semibold ${g.color}`}
            >
              {g.troopName}
            </th>
          ))}
        </tr>
        {/* Individual column labels */}
        <tr className="border-b border-slate-800 text-slate-500">
          <th className="pb-2 pr-4 text-left">t</th>
          {meta.map((m) => (
            <th key={m.instanceId} className={`px-2 pb-2 ${m.color}`}>
              {m.label}
            </th>
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
              const color = dead
                ? "text-slate-600"
                : pct > 0.6
                ? "text-slate-200"
                : pct > 0.3
                ? "text-amber-400"
                : "text-red-400";
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
