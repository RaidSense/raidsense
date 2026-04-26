"use client";

import { useState } from "react";
import { TROOPS } from "../../lib/data/troops";
import { simulateAttack } from "../../lib/engine/calculator";
import type { SimulationResult, TroopDeployment, DefensePlacement, Vec2 } from "../../lib/engine/calculator";

// ---------------------------------------------------------------------------
// Fixed scenario: Cannon Lv10 at the centre of a 50×50 grid.
// Troops are dropped in a ring 5 tiles away — already within the Cannon's
// 9-tile range, so the exchange starts immediately.
// ---------------------------------------------------------------------------

const CANNON_LEVEL = 10;
const CANNON_HP    = 930;
const CANNON_DPS   = 128;
const CANNON_RANGE = 9;
const CANNON_POS: Vec2 = { x: 25, y: 25 };
const DROP_RADIUS  = 5;

function ringPositions(count: number): Vec2[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    return {
      x: Math.round((CANNON_POS.x + DROP_RADIUS * Math.cos(angle)) * 10) / 10,
      y: Math.round((CANNON_POS.y + DROP_RADIUS * Math.sin(angle)) * 10) / 10,
    };
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SimulatorPanel() {
  const [troopId, setTroopId]   = useState("giant");
  const [level, setLevel]       = useState(5);
  const [count, setCount]       = useState(5);
  const [result, setResult]     = useState<SimulationResult | null>(null);

  const troop    = TROOPS.find((t) => t.id === troopId)!;
  const levelData = troop.levels.find((l) => l.level === level)!;

  function handleTroopChange(id: string) {
    const t = TROOPS.find((t) => t.id === id)!;
    setTroopId(id);
    // Clamp level to valid range for the new troop.
    setLevel((prev) => Math.min(prev, t.levels.length));
  }

  function handleLevelChange(raw: string) {
    setLevel(Number(raw));
  }

  function handleCountChange(raw: string) {
    setCount(Number(raw));
  }

  function handleSimulate() {
    const positions = ringPositions(count);

    const deployments: TroopDeployment[] = positions.map((pos, i) => ({
      instanceId: `t${i + 1}`,
      troopId,
      level,
      dropPosition: pos,
    }));

    const defenses: DefensePlacement[] = [
      { instanceId: "cannon_1", defenseId: "cannon", level: CANNON_LEVEL, position: CANNON_POS },
    ];

    setResult(simulateAttack(deployments, defenses));
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 space-y-8">

      {/* ── Header ── */}
      <header className="space-y-1">
        <h1 className="text-4xl font-bold tracking-tight text-amber-400">RaidSense</h1>
        <p className="text-slate-400 text-sm">Simulateur d&apos;attaque Clash of Clans</p>
      </header>

      {/* ── Config form ── */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6">
        <h2 className="text-base font-semibold text-slate-100">Configurer l&apos;attaque</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Troop */}
          <Field label="Troupe">
            <Select value={troopId} onChange={(e) => handleTroopChange(e.target.value)}>
              {TROOPS.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </Field>

          {/* Level */}
          <Field label={`Niveau (max ${troop.levels.length})`}>
            <Select value={level} onChange={(e) => handleLevelChange(e.target.value)}>
              {troop.levels.map((l) => (
                <option key={l.level} value={l.level}>Niveau {l.level}</option>
              ))}
            </Select>
          </Field>

          {/* Count */}
          <Field label="Quantité">
            <Select value={count} onChange={(e) => handleCountChange(e.target.value)}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n} troupe{n > 1 ? "s" : ""}</option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Stat summary */}
        <div className="rounded-xl bg-slate-800/50 px-4 py-3 text-xs text-slate-400 space-y-1">
          <p>
            <span className="text-slate-300">Attaquants&nbsp;</span>
            {count}× {troop.name} Lv{level}
            &nbsp;·&nbsp;{levelData.hp} HP&nbsp;·&nbsp;{levelData.dps} DPS
            &nbsp;·&nbsp;vitesse {troop.movementSpeed}
          </p>
          <p>
            <span className="text-slate-300">Défense cible&nbsp;</span>
            Cannon Lv{CANNON_LEVEL}
            &nbsp;·&nbsp;{CANNON_HP} HP&nbsp;·&nbsp;{CANNON_DPS} DPS&nbsp;·&nbsp;portée {CANNON_RANGE}
            &nbsp;·&nbsp;centre ({CANNON_POS.x}, {CANNON_POS.y})
          </p>
          <p>
            <span className="text-slate-300">Drop&nbsp;</span>
            anneau à {DROP_RADIUS} tuiles du Cannon
            &nbsp;— toutes les troupes sont dans la portée dès t=0
          </p>
        </div>

        <button
          onClick={handleSimulate}
          className="rounded-xl bg-amber-500 px-6 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 active:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-slate-900"
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
            <StatCard label="Durée" value={`${result.durationSeconds}s`} />
            <StatCard
              label="Cannon"
              value={
                result.defenses["cannon_1"].destroyedAt !== null
                  ? `Détruit · t=${result.defenses["cannon_1"].destroyedAt.toFixed(1)}s`
                  : "Survit"
              }
              accent={result.defenses["cannon_1"].destroyedAt !== null}
            />
            <StatCard
              label="Survivants"
              value={`${Object.values(result.troops).filter((t) => t.destroyedAt === null).length} / ${count}`}
            />
            <StatCard
              label="Dégâts infligés"
              value={`${result.defenses["cannon_1"].totalDamageDealt.toLocaleString()} HP`}
            />
          </div>

          {/* Eliminated troops */}
          {Object.values(result.troops).some((t) => t.destroyedAt !== null) && (
            <div className="text-xs text-slate-400 space-y-0.5">
              <p className="text-slate-500 mb-1">Troupes éliminées</p>
              {Object.values(result.troops)
                .filter((t) => t.destroyedAt !== null)
                .map((t) => (
                  <p key={t.instanceId}>
                    <span className="text-slate-300 font-mono">{t.instanceId.toUpperCase()}</span>
                    {" "}— morte à t={t.destroyedAt!.toFixed(1)}s
                  </p>
                ))}
            </div>
          )}

          {/* HP table */}
          <div>
            <p className="text-xs text-slate-500 mb-3">HP des troupes par seconde</p>
            <div className="overflow-x-auto">
              <HpTable result={result} count={count} maxHp={levelData.hp} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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

function StatCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-800 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${accent ? "text-amber-400" : "text-slate-200"}`}>{value}</p>
    </div>
  );
}

function HpTable({
  result,
  count,
  maxHp,
}: {
  result: SimulationResult;
  count: number;
  maxHp: number;
}) {
  const ids  = Array.from({ length: count }, (_, i) => `t${i + 1}`);
  const maxT = Math.floor(result.durationSeconds);

  return (
    <table className="w-full text-right font-mono text-xs">
      <thead>
        <tr className="border-b border-slate-800 text-slate-500">
          <th className="pb-2 pr-4 text-left">t</th>
          {ids.map((id) => (
            <th key={id} className="px-3 pb-2">
              {id.toUpperCase()}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: maxT + 1 }, (_, t) => (
          <tr key={t} className="border-b border-slate-800/40 hover:bg-slate-800/30">
            <td className="py-1 pr-4 text-left text-slate-500">{t}s</td>
            {ids.map((id) => {
              const tr   = result.troops[id];
              const hp   = tr?.hpPerSecond[t] ?? 0;
              const dead = hp === 0 && tr?.destroyedAt !== null;
              const pct  = hp / maxHp;
              const color = dead
                ? "text-slate-600"
                : pct > 0.6
                ? "text-slate-200"
                : pct > 0.3
                ? "text-amber-400"
                : "text-red-400";
              return (
                <td key={id} className={`px-3 py-1 ${color}`}>
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
