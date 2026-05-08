"use client";
/**
 * Top-down SVG illustrations for defenses — one per level.
 * ViewBox 40×40, barrel/tip points north (toward y=0).
 * Each level is individually designed, not just a colour shift.
 */
import React from "react";

// ── Shared micro-helpers ───────────────────────────────────────────────────────

/** Horizontal band across the barrel */
const Ring = ({ barrelW, y, h = 1.5, fill }: { barrelW: number; y: number; h?: number; fill: string }) => (
  <rect x={20 - barrelW - 0.5} y={y - h / 2} width={barrelW * 2 + 1} height={h} rx={h / 2} fill={fill} />
);

/** Circular bolt at `angle` degrees (0 = east) around a radius */
const Bolt = ({ angle, radius, r, fill }: { angle: number; radius: number; r: number; fill: string }) => {
  const a = (angle * Math.PI) / 180;
  return <circle cx={20 + Math.cos(a) * radius} cy={20 + Math.sin(a) * radius} r={r} fill={fill} />;
};

/** Evenly spaced bolts around a ring */
const Bolts = ({ n, radius, r, fill }: { n: number; radius: number; r: number; fill: string }) => (
  <>
    {Array.from({ length: n }, (_, i) => (
      <Bolt key={i} angle={-90 + (360 / n) * i} radius={radius} r={r} fill={fill} />
    ))}
  </>
);

/** Triangular spike on the outer rim */
const Spike = ({ angle, innerR, outerR, fill }: { angle: number; innerR: number; outerR: number; fill: string }) => {
  const toR = (a: number, r: number) => ({ x: 20 + Math.cos(a) * r, y: 20 + Math.sin(a) * r });
  const a  = (angle * Math.PI) / 180;
  const aL = ((angle - 8) * Math.PI) / 180;
  const aR = ((angle + 8) * Math.PI) / 180;
  const p0 = toR(a,  outerR);
  const p1 = toR(aL, innerR);
  const p2 = toR(aR, innerR);
  return <polygon points={`${p0.x},${p0.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`} fill={fill} />;
};
const Spikes = ({ n, innerR, outerR, fill }: { n: number; innerR: number; outerR: number; fill: string }) => (
  <>
    {Array.from({ length: n }, (_, i) => (
      <Spike key={i} angle={-90 + (360 / n) * i} innerR={innerR} outerR={outerR} fill={fill} />
    ))}
  </>
);

// ── Cannon per-level illustrations ────────────────────────────────────────────
// bw = barrel half-width, bh = barrel height from center toward top

function CannonIcon({ level, px }: { level: number; px: number }) {
  switch (level) {

    // ── Lv 1 — Wooden base, basic iron barrel ─────────────────────────────────
    case 1: return <svg viewBox="0 0 40 40" width={px} height={px} style={{ display: "block" }}>
      <circle cx="20" cy="20" r="13"   fill="#A87A20" stroke="#7A5510" strokeWidth="2" />
      <circle cx="20" cy="20" r="9"    fill="#8B6818" />
      <rect   x="17.5" y="7"  width="5" height="14" rx="1" fill="#838383" stroke="#484848" strokeWidth="0.5" />
      <ellipse cx="20" cy="7.5" rx="3"  ry="2" fill="#2A2A2A" />
      <circle cx="20" cy="20" r="3.5"  fill="#7A5510" opacity="0.5" />
    </svg>;

    // ── Lv 2 — Dark wood, iron collar ─────────────────────────────────────────
    case 2: return <svg viewBox="0 0 40 40" width={px} height={px} style={{ display: "block" }}>
      <circle cx="20" cy="20" r="13"   fill="#8C6418" stroke="#604208" strokeWidth="2.5" />
      <circle cx="20" cy="20" r="9"    fill="#704E10" />
      <rect   x="17" y="6.5" width="6" height="14.5" rx="1" fill="#757575" stroke="#3A3A3A" strokeWidth="0.5" />
      {/* Iron collar at barrel base */}
      <Ring barrelW={3} y={19.5} h={2} fill="#555" />
      <ellipse cx="20" cy="7" rx="3.2" ry="2.1" fill="#252525" />
      <circle cx="20" cy="20" r="3" fill="#604208" opacity="0.5" />
    </svg>;

    // ── Lv 3 — Stone base, 4 bolts, single iron ring ──────────────────────────
    case 3: return <svg viewBox="0 0 40 40" width={px} height={px} style={{ display: "block" }}>
      <circle cx="20" cy="20" r="13.5" fill="#8A8A8A" stroke="#505050" strokeWidth="2" />
      <circle cx="20" cy="20" r="9.5"  fill="#707070" />
      <Bolts n={4} radius={11.5} r={1.2} fill="#404040" />
      <rect   x="17" y="6" width="6" height="15" rx="1" fill="#686868" stroke="#383838" strokeWidth="0.5" />
      <Ring barrelW={3} y={15} h={1.8} fill="#484848" />
      <ellipse cx="20" cy="6.5" rx="3.2" ry="2.2" fill="#1E1E1E" />
      <circle cx="20" cy="20" r="3" fill="#505050" opacity="0.5" />
    </svg>;

    // ── Lv 4 — Dark stone, iron outer rim, 1 ring, 4 bolts ────────────────────
    case 4: return <svg viewBox="0 0 40 40" width={px} height={px} style={{ display: "block" }}>
      <circle cx="20" cy="20" r="13.5" fill="#787878" stroke="#404040" strokeWidth="2.5" />
      <circle cx="20" cy="20" r="9.5"  fill="#626262" />
      <Bolts n={4} radius={11.5} r={1.4} fill="#363636" />
      <rect   x="16.5" y="5.5" width="7" height="15.5" rx="1.2" fill="#606060" stroke="#303030" strokeWidth="0.6" />
      <Ring barrelW={3.5} y={14}  h={2} fill="#3C3C3C" />
      <Ring barrelW={3.5} y={19}  h={1.5} fill="#3C3C3C" />
      <ellipse cx="20" cy="6" rx="3.5" ry="2.3" fill="#181818" />
      <circle cx="20" cy="20" r="3.2" fill="#404040" opacity="0.5" />
    </svg>;

    // ── Lv 5 — Iron base (blue-grey), 4 bolts, 2 rings ───────────────────────
    case 5: return <svg viewBox="0 0 40 40" width={px} height={px} style={{ display: "block" }}>
      <circle cx="20" cy="20" r="14"   fill="#4E5E6C" stroke="#2E3E4C" strokeWidth="2.5" />
      <circle cx="20" cy="20" r="10"   fill="#3C4C5A" />
      <Bolts n={4} radius={12} r={1.5} fill="#1E2E3C" />
      <rect   x="16.5" y="5" width="7" height="16" rx="1.2" fill="#565656" stroke="#2C2C2C" strokeWidth="0.6" />
      <Ring barrelW={3.5} y={12} h={2} fill="#383838" />
      <Ring barrelW={3.5} y={18} h={2} fill="#383838" />
      <ellipse cx="20" cy="5.5" rx="3.7" ry="2.4" fill="#141414" />
      <circle cx="20" cy="20" r="3.5" fill="#2E3E4C" opacity="0.5" />
    </svg>;

    // ── Lv 6 — Dark iron, 6 bolts, brass accent ring ──────────────────────────
    case 6: return <svg viewBox="0 0 40 40" width={px} height={px} style={{ display: "block" }}>
      <circle cx="20" cy="20" r="14"   fill="#3A4A58" stroke="#1A2A38" strokeWidth="3" />
      <circle cx="20" cy="20" r="10"   fill="#2A3A48" />
      <Bolts n={6} radius={12} r={1.4} fill="#1A2A38" />
      <rect   x="16" y="5" width="8" height="16" rx="1.5" fill="#504E4E" stroke="#282828" strokeWidth="0.7" />
      <Ring barrelW={4} y={11} h={2}   fill="#CD7F32" /> {/* brass */}
      <Ring barrelW={4} y={17.5} h={1.8} fill="#383838" />
      <ellipse cx="20" cy="5.5" rx="4" ry="2.6" fill="#101010" />
      <circle cx="20" cy="20" r="3.5" fill="#1A2A38" opacity="0.6" />
    </svg>;

    // ── Lv 7 — Steel, 6 bolts, gold accent, inner base ring ──────────────────
    case 7: return <svg viewBox="0 0 40 40" width={px} height={px} style={{ display: "block" }}>
      {/* Decorative inner ring on base */}
      <circle cx="20" cy="20" r="14"   fill="#485E72" stroke="#283848" strokeWidth="2.5" />
      <circle cx="20" cy="20" r="11.5" fill="none" stroke="#1E3040" strokeWidth="0.8" strokeDasharray="3 2" />
      <circle cx="20" cy="20" r="10"   fill="#384858" />
      <Bolts n={6} radius={12} r={1.5} fill="#182838" />
      <rect   x="16" y="4.5" width="8" height="16.5" rx="1.5" fill="#4A5060" stroke="#242428" strokeWidth="0.7" />
      <Ring barrelW={4} y={10.5} h={2.2} fill="#DAA520" /> {/* gold */}
      <Ring barrelW={4} y={16.5} h={1.8} fill="#2A2A30" />
      <ellipse cx="20" cy="5" rx="4.2" ry="2.7" fill="#0E0E12" />
      <circle cx="20" cy="20" r="3.5" fill="#1A2838" opacity="0.6" />
    </svg>;

    // ── Lv 8 — Tempered steel, 8 bolts, gold tip, 2 rings ────────────────────
    case 8: return <svg viewBox="0 0 40 40" width={px} height={px} style={{ display: "block" }}>
      <circle cx="20" cy="20" r="14"   fill="#2E4458" stroke="#0E2438" strokeWidth="3" />
      <circle cx="20" cy="20" r="10.2" fill="#1E3448" />
      <Bolts n={8} radius={12} r={1.4} fill="#0A1A28" />
      <rect   x="15.5" y="4" width="9" height="17" rx="1.8" fill="#464858" stroke="#202030" strokeWidth="0.7" />
      <Ring barrelW={4.5} y={10} h={2.2} fill="#2A2A30" />
      <Ring barrelW={4.5} y={16} h={2.2} fill="#2A2A30" />
      {/* Gold barrel tip */}
      <rect x="15.5" y="4" width="9" height="4" rx="1.8" fill="#FFD700" />
      <ellipse cx="20" cy="4.5" rx="4.5" ry="2.8" fill="#1A1208" />
      <circle cx="20" cy="20" r="3.8" fill="#0A1A28" opacity="0.6" />
    </svg>;

    // ── Lv 9 — Black steel + bronze rim, bronze muzzle, 8 bolts ─────────────
    case 9: return <svg viewBox="0 0 40 40" width={px} height={px} style={{ display: "block" }}>
      <circle cx="20" cy="20" r="14.5" fill="#1A1A2A" stroke="#B8762A" strokeWidth="3" />
      <circle cx="20" cy="20" r="10.5" fill="#101020" />
      <Bolts n={8} radius={12.5} r={1.5} fill="#B8762A" />
      <rect   x="15.5" y="3.5" width="9" height="17.5" rx="2" fill="#404040" stroke="#181818" strokeWidth="0.8" />
      <Ring barrelW={4.5} y={9.5}  h={2.5} fill="#B8762A" />
      <Ring barrelW={4.5} y={15.5} h={2}   fill="#302828" />
      <Ring barrelW={4.5} y={19.5} h={1.5} fill="#302828" />
      {/* Bronze muzzle */}
      <rect x="15.5" y="3.5" width="9" height="4.5" rx="2" fill="#CD7F32" />
      <ellipse cx="20" cy="4" rx="4.8" ry="3" fill="#1A0E04" />
      <circle cx="20" cy="20" r="4" fill="#080814" opacity="0.6" />
    </svg>;

    // ── Lv 10 — Black + gold, ornate, 8 gold bolts ────────────────────────────
    case 10: return <svg viewBox="0 0 40 40" width={px} height={px} style={{ display: "block" }}>
      <circle cx="20" cy="20" r="14.5" fill="#141420" stroke="#DAA520" strokeWidth="3" />
      <circle cx="20" cy="20" r="11"   fill="#0A0A18" />
      <circle cx="20" cy="20" r="5"    fill="#DAA520" opacity="0.15" />
      <Bolts n={8} radius={12.8} r={1.6} fill="#DAA520" />
      <rect   x="15" y="3" width="10" height="18" rx="2" fill="#3A3838" stroke="#141414" strokeWidth="0.8" />
      <Ring barrelW={5} y={9}   h={2.5} fill="#DAA520" />
      <Ring barrelW={5} y={15}  h={2}   fill="#DAA520" />
      <Ring barrelW={5} y={19.5} h={2}  fill="#201808" />
      <rect x="15" y="3" width="10" height="5" rx="2" fill="#FFD700" />
      <ellipse cx="20" cy="3.8" rx="5" ry="3.2" fill="#100C02" />
      <circle cx="20" cy="20" r="3.8" fill="#DAA520" opacity="0.2" />
    </svg>;

    // ── Lv 11 — Deep black + bright gold, spiked outer rim ───────────────────
    case 11: return <svg viewBox="0 0 40 40" width={px} height={px} style={{ display: "block" }}>
      <circle cx="20" cy="20" r="14.5" fill="#0E0E1E" stroke="#FFD700" strokeWidth="3" />
      <Spikes n={8} innerR={14} outerR={17} fill="#FFD700" />
      <circle cx="20" cy="20" r="10.5" fill="#080818" />
      <Bolts n={8} radius={12.5} r={1.7} fill="#FFD700" />
      <rect   x="14.5" y="2.5" width="11" height="18.5" rx="2.2" fill="#303038" stroke="#101010" strokeWidth="0.8" />
      <Ring barrelW={5.5} y={8.5}  h={2.5} fill="#FFD700" />
      <Ring barrelW={5.5} y={14.5} h={2.2} fill="#FFD700" />
      <Ring barrelW={5.5} y={19.5} h={2}   fill="#181408" />
      <rect x="14.5" y="2.5" width="11" height="5" rx="2.2" fill="#FFD700" />
      <ellipse cx="20" cy="3.2" rx="5.5" ry="3.3" fill="#18120A" />
      <circle cx="20" cy="20" r="4" fill="#FFD700" opacity="0.15" />
    </svg>;

    // ── Lv 12 — Black + copper, rifled barrel ────────────────────────────────
    case 12: return <svg viewBox="0 0 40 40" width={px} height={px} style={{ display: "block" }}>
      <circle cx="20" cy="20" r="14.5" fill="#0A0A1A" stroke="#B87333" strokeWidth="3.5" />
      <circle cx="20" cy="20" r="10.5" fill="#050515" />
      <Bolts n={8} radius={12.5} r={1.7} fill="#B87333" />
      {/* Copper filigree lines on base */}
      <circle cx="20" cy="20" r="8" fill="none" stroke="#B87333" strokeWidth="0.6" strokeDasharray="4 3" />
      <rect   x="14" y="2" width="12" height="19" rx="2.5" fill="#282830" stroke="#0A0A0A" strokeWidth="0.8" />
      {/* Rifling — diagonal copper lines on barrel */}
      <line x1="14" y1="8"  x2="26" y2="12" stroke="#B87333" strokeWidth="0.7" opacity="0.8" />
      <line x1="14" y1="12" x2="26" y2="16" stroke="#B87333" strokeWidth="0.7" opacity="0.8" />
      <line x1="14" y1="16" x2="26" y2="20" stroke="#B87333" strokeWidth="0.7" opacity="0.8" />
      <Ring barrelW={6} y={9}   h={2.5} fill="#B87333" />
      <Ring barrelW={6} y={15}  h={2.2} fill="#B87333" />
      <Ring barrelW={6} y={19.5} h={2}  fill="#201210" />
      <rect x="14" y="2" width="12" height="5.5" rx="2.5" fill="#B87333" />
      <ellipse cx="20" cy="3" rx="6" ry="3.5" fill="#160C04" />
      <circle cx="20" cy="20" r="4" fill="#B87333" opacity="0.12" />
    </svg>;

    // ── Lv 13 — Obsidian + silver, 4 rings, shimmer ──────────────────────────
    case 13: return <svg viewBox="0 0 40 40" width={px} height={px} style={{ display: "block" }}>
      <circle cx="20" cy="20" r="15"   fill="#08081A" stroke="#C0C0C0" strokeWidth="3" />
      <circle cx="20" cy="20" r="11"   fill="#040414" />
      <circle cx="20" cy="20" r="8"    fill="none" stroke="#C0C0C0" strokeWidth="0.5" opacity="0.5" />
      <Bolts n={8} radius={13} r={1.7} fill="#C0C0C0" />
      <rect   x="14" y="1.5" width="12" height="19.5" rx="2.5" fill="#242436" stroke="#080808" strokeWidth="0.8" />
      <Ring barrelW={6} y={7.5}  h={2.5} fill="#C0C0C0" />
      <Ring barrelW={6} y={12}   h={2.2} fill="#A0A0A0" />
      <Ring barrelW={6} y={16}   h={2}   fill="#C0C0C0" />
      <Ring barrelW={6} y={19.5} h={2}   fill="#181820" />
      <rect x="14" y="1.5" width="12" height="5.5" rx="2.5" fill="#C8C8D0" />
      <ellipse cx="20" cy="2.5" rx="6" ry="3.5" fill="#0C0C18" />
      {/* Silver shimmer */}
      <ellipse cx="20" cy="2.5" rx="4" ry="1.8" fill="#E8E8F8" opacity="0.4" />
      <circle cx="20" cy="20" r="4.5" fill="#C0C0C0" opacity="0.1" />
    </svg>;

    // ── Lv 14 — Dark + deep blue crystal veins ───────────────────────────────
    case 14: return <svg viewBox="0 0 40 40" width={px} height={px} style={{ display: "block" }}>
      <circle cx="20" cy="20" r="15"   fill="#060616" stroke="#4169E1" strokeWidth="3.5" />
      {/* Crystal vein lines in base */}
      <line x1="10" y1="15" x2="20" y2="20" stroke="#4169E1" strokeWidth="0.8" opacity="0.6" />
      <line x1="30" y1="15" x2="20" y2="20" stroke="#4169E1" strokeWidth="0.8" opacity="0.6" />
      <line x1="10" y1="26" x2="20" y2="20" stroke="#4169E1" strokeWidth="0.8" opacity="0.5" />
      <line x1="30" y1="26" x2="20" y2="20" stroke="#4169E1" strokeWidth="0.8" opacity="0.5" />
      <circle cx="20" cy="20" r="11"   fill="#030312" />
      <Bolts n={8} radius={13} r={1.8} fill="#4169E1" />
      <rect   x="13.5" y="1" width="13" height="20" rx="2.8" fill="#1A1A2C" stroke="#060610" strokeWidth="0.8" />
      <Ring barrelW={6.5} y={7}   h={2.8} fill="#4169E1" />
      <Ring barrelW={6.5} y={12}  h={2.5} fill="#2A3ABA" />
      <Ring barrelW={6.5} y={16.5} h={2.2} fill="#4169E1" />
      <Ring barrelW={6.5} y={19.5} h={2}   fill="#0E0E20" />
      <rect x="13.5" y="1" width="13" height="6" rx="2.8" fill="#4169E1" />
      <ellipse cx="20" cy="2" rx="6.5" ry="4" fill="#0A0A1E" />
      <ellipse cx="20" cy="2" rx="4"   ry="2.2" fill="#6495ED" opacity="0.5" />
      <circle cx="20" cy="20" r="4.5" fill="#4169E1" opacity="0.15" />
    </svg>;

    // ── Lv 15 — Crystal-infused, glowing cyan edge ───────────────────────────
    case 15: return <svg viewBox="0 0 40 40" width={px} height={px} style={{ display: "block" }}>
      {/* Outer glow ring */}
      <circle cx="20" cy="20" r="17"   fill="none" stroke="#00BFFF" strokeWidth="1.5" opacity="0.3" />
      <circle cx="20" cy="20" r="15.5" fill="#040414" stroke="#00BFFF" strokeWidth="3" />
      <circle cx="20" cy="20" r="11.5" fill="#020210" />
      <Bolts n={8} radius={13.5} r={1.8} fill="#00BFFF" />
      {/* Crystal facets */}
      <polygon points="20,8 14,16 26,16" fill="#00BFFF" opacity="0.12" />
      <polygon points="20,8 20,20 14,16" fill="#00BFFF" opacity="0.08" />
      <rect   x="13" y="0.5" width="14" height="20.5" rx="3" fill="#161630" stroke="#040408" strokeWidth="0.8" />
      <Ring barrelW={7} y={6.5}  h={3}   fill="#00BFFF" />
      <Ring barrelW={7} y={11.5} h={2.5} fill="#0088BB" />
      <Ring barrelW={7} y={16}   h={2.5} fill="#00BFFF" />
      <Ring barrelW={7} y={19.5} h={2.5} fill="#080820" />
      <rect x="13" y="0.5" width="14" height="6.5" rx="3" fill="#00BFFF" />
      <ellipse cx="20" cy="1.5" rx="7" ry="4.2" fill="#040C14" />
      <ellipse cx="20" cy="1.5" rx="4.5" ry="2.5" fill="#80DFFF" opacity="0.6" />
      {/* Center glow */}
      <circle cx="20" cy="20" r="5"  fill="#00BFFF" opacity="0.15" />
      <circle cx="20" cy="20" r="2.5" fill="#00BFFF" opacity="0.25" />
    </svg>;

    // ── Lv 16 — Void black + electric cyan, neon barrel ──────────────────────
    case 16: return <svg viewBox="0 0 40 40" width={px} height={px} style={{ display: "block" }}>
      <circle cx="20" cy="20" r="17.5" fill="none" stroke="#00FFFF" strokeWidth="1" opacity="0.2" />
      <circle cx="20" cy="20" r="16"   fill="none" stroke="#00FFFF" strokeWidth="0.8" opacity="0.35" />
      <circle cx="20" cy="20" r="15.5" fill="#020210" stroke="#00FFFF" strokeWidth="3.5" />
      <circle cx="20" cy="20" r="11.5" fill="#010108" />
      <Bolts n={8} radius={13.5} r={1.9} fill="#00FFFF" />
      <rect   x="13" y="0.5" width="14" height="20.5" rx="3" fill="#0C0C20" stroke="#020206" strokeWidth="0.8" />
      {/* Neon lines on barrel */}
      <line x1="13" y1="10" x2="27" y2="10" stroke="#00FFFF" strokeWidth="0.5" opacity="0.7" />
      <line x1="13" y1="15" x2="27" y2="15" stroke="#00FFFF" strokeWidth="0.5" opacity="0.7" />
      <Ring barrelW={7} y={6}   h={3}   fill="#00FFFF" />
      <Ring barrelW={7} y={11}  h={2.5} fill="#00AACC" />
      <Ring barrelW={7} y={16}  h={2.5} fill="#00FFFF" />
      <Ring barrelW={7} y={19.5} h={2.5} fill="#040420" />
      <rect x="13" y="0.5" width="14" height="7" rx="3" fill="#00FFFF" />
      <ellipse cx="20" cy="2"   rx="7"   ry="4.5" fill="#020A0A" />
      <ellipse cx="20" cy="2"   rx="4.5" ry="2.8" fill="#80FFFF" opacity="0.7" />
      <circle cx="20" cy="20" r="5.5" fill="#00FFFF" opacity="0.12" />
    </svg>;

    // ── Lv 17 — Shadow + white lightning channels ─────────────────────────────
    case 17: return <svg viewBox="0 0 40 40" width={px} height={px} style={{ display: "block" }}>
      <circle cx="20" cy="20" r="18"   fill="none" stroke="#FFFFFF" strokeWidth="0.6" opacity="0.2" />
      <circle cx="20" cy="20" r="15.5" fill="#010110" stroke="#FFFFFF" strokeWidth="3" />
      <circle cx="20" cy="20" r="11.5" fill="#010108" />
      <Bolts n={8} radius={13.5} r={1.9} fill="#F0F0F0" />
      <rect   x="13" y="0.5" width="14" height="20.5" rx="3" fill="#0A0A1A" stroke="#010104" strokeWidth="0.8" />
      {/* Lightning channels — zigzag lines */}
      <polyline points="16,4 18,8 15,12 17,16" stroke="#FFD700" strokeWidth="1.2" fill="none" opacity="0.9" />
      <polyline points="24,4 22,8 25,12 23,16" stroke="#FFD700" strokeWidth="1.2" fill="none" opacity="0.9" />
      <Ring barrelW={7} y={5.5} h={3}   fill="#E0E0E0" />
      <Ring barrelW={7} y={11}  h={2.5} fill="#B0B0B0" />
      <Ring barrelW={7} y={16}  h={2.5} fill="#E0E0E0" />
      <Ring barrelW={7} y={19.5} h={2.5} fill="#050520" />
      <rect x="13" y="0.5" width="14" height="7" rx="3" fill="#E8E8E8" />
      <ellipse cx="20" cy="2"   rx="7"   ry="4.5" fill="#080808" />
      <ellipse cx="20" cy="2"   rx="4.5" ry="2.8" fill="#FFFDE8" opacity="0.8" />
      <circle cx="20" cy="20" r="5.5" fill="#FFFFFF" opacity="0.08" />
    </svg>;

    // ── Lv 18 — Infernal: black + deep red, fire glow ─────────────────────────
    case 18: return <svg viewBox="0 0 40 40" width={px} height={px} style={{ display: "block" }}>
      <circle cx="20" cy="20" r="18"   fill="none" stroke="#FF4500" strokeWidth="1" opacity="0.25" />
      <circle cx="20" cy="20" r="16"   fill="none" stroke="#CC2200" strokeWidth="0.8" opacity="0.4" />
      <circle cx="20" cy="20" r="15.5" fill="#050102" stroke="#CC2200" strokeWidth="3.5" />
      <circle cx="20" cy="20" r="11.5" fill="#020101" />
      <Bolts n={8} radius={13.5} r={2} fill="#FF4500" />
      <rect   x="12.5" y="0" width="15" height="21" rx="3" fill="#100808" stroke="#020101" strokeWidth="0.8" />
      {/* Fire glow inside barrel */}
      <rect x="12.5" y="0" width="15" height="12" rx="3" fill="url(#fireGrad)" />
      <defs>
        <linearGradient id="fireGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF4500" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#CC2200" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <Ring barrelW={7.5} y={6}   h={3}   fill="#FF4500" />
      <Ring barrelW={7.5} y={11.5} h={2.5} fill="#CC2200" />
      <Ring barrelW={7.5} y={16.5} h={2.5} fill="#FF4500" />
      <Ring barrelW={7.5} y={20}   h={2.5} fill="#180402" />
      <ellipse cx="20" cy="1.5" rx="7.5"  ry="4.8" fill="#0C0202" />
      <ellipse cx="20" cy="1.5" rx="5"    ry="3.2" fill="#FF6020" opacity="0.8" />
      <circle cx="20" cy="20" r="6" fill="#FF4500" opacity="0.14" />
      <circle cx="20" cy="20" r="3" fill="#FF4500" opacity="0.2" />
    </svg>;

    // ── Lv 19 — Void + cosmic purple, multiple aura rings ─────────────────────
    case 19: return <svg viewBox="0 0 40 40" width={px} height={px} style={{ display: "block" }}>
      <circle cx="20" cy="20" r="19"   fill="none" stroke="#9B59B6" strokeWidth="0.7" opacity="0.2" />
      <circle cx="20" cy="20" r="17.5" fill="none" stroke="#8E44AD" strokeWidth="0.8" opacity="0.3" />
      <circle cx="20" cy="20" r="16"   fill="none" stroke="#9B59B6" strokeWidth="1" opacity="0.45" />
      <circle cx="20" cy="20" r="15.5" fill="#030008" stroke="#9B59B6" strokeWidth="3.5" />
      <circle cx="20" cy="20" r="11.5" fill="#020005" />
      <Bolts n={8} radius={13.5} r={2.1} fill="#9B59B6" />
      {/* Small crystal protrusions */}
      <Spikes n={8} innerR={14} outerR={17.5} fill="#9B59B6" />
      <rect   x="12" y="-0.5" width="16" height="21.5" rx="3.5" fill="#120820" stroke="#010004" strokeWidth="0.8" />
      <Ring barrelW={8} y={5.5}  h={3.2} fill="#9B59B6" />
      <Ring barrelW={8} y={11}   h={2.8} fill="#7D3C98" />
      <Ring barrelW={8} y={16}   h={2.8} fill="#9B59B6" />
      <Ring barrelW={8} y={20}   h={3}   fill="#0A0415" />
      <rect x="12" y="-0.5" width="16" height="7.5" rx="3.5" fill="#9B59B6" />
      <ellipse cx="20" cy="1.5"  rx="8"   ry="5"   fill="#06020C" />
      <ellipse cx="20" cy="1.5"  rx="5.5" ry="3.5" fill="#DDA0DD" opacity="0.75" />
      <circle cx="20" cy="20" r="6" fill="#9B59B6" opacity="0.18" />
      <circle cx="20" cy="20" r="3" fill="#9B59B6" opacity="0.3" />
    </svg>;

    // ── Lv 20 — Ultimate: near-black, gold-white, full glow ──────────────────
    case 20: return <svg viewBox="0 0 40 40" width={px} height={px} style={{ display: "block" }}>
      {/* Triple outer aura */}
      <circle cx="20" cy="20" r="19.5" fill="none" stroke="#FFD700" strokeWidth="0.5" opacity="0.2" />
      <circle cx="20" cy="20" r="18.5" fill="none" stroke="#FFFDE8" strokeWidth="0.7" opacity="0.3" />
      <circle cx="20" cy="20" r="17.5" fill="none" stroke="#FFD700" strokeWidth="1" opacity="0.5" />
      <circle cx="20" cy="20" r="16"   fill="#000008" stroke="#FFD700" strokeWidth="3.5" />
      <circle cx="20" cy="20" r="12"   fill="#000004" />
      <Bolts n={8} radius={14} r={2.2} fill="#FFD700" />
      <Spikes n={8} innerR={14.5} outerR={18.5} fill="#FFD700" />
      <defs>
        <linearGradient id="barrelGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#FFFFFF"  />
          <stop offset="35%"  stopColor="#FFD700"  />
          <stop offset="100%" stopColor="#8B6914"  />
        </linearGradient>
      </defs>
      <rect   x="12" y="-1" width="16" height="22" rx="4" fill="#080820" stroke="#000002" strokeWidth="0.8" />
      <Ring barrelW={8} y={5}    h={3.5} fill="#FFD700" />
      <Ring barrelW={8} y={10.5} h={3}   fill="#FFFDE8" />
      <Ring barrelW={8} y={15.5} h={3}   fill="#FFD700" />
      <Ring barrelW={8} y={20}   h={3.5} fill="#100C02" />
      <rect x="12" y="-1" width="16" height="8" rx="4" fill="url(#barrelGold)" />
      <ellipse cx="20" cy="1.5"  rx="8"   ry="5.5" fill="#080602" />
      <ellipse cx="20" cy="1.5"  rx="6"   ry="4"   fill="#FFFFFF" opacity="0.85" />
      <ellipse cx="20" cy="1.5"  rx="3.5" ry="2.3" fill="#FFFDE8" opacity="0.95" />
      {/* Center radiant glow */}
      <circle cx="20" cy="20" r="7"  fill="#FFD700" opacity="0.18" />
      <circle cx="20" cy="20" r="4"  fill="#FFD700" opacity="0.28" />
      <circle cx="20" cy="20" r="2"  fill="#FFFFFF"  opacity="0.4" />
    </svg>;

    default: return null;
  }
}

// ── Public component ──────────────────────────────────────────────────────────

/**
 * Returns a top-down SVG icon for a defense at a given level.
 * Returns null for defenses not yet illustrated (keeps the existing coloured box).
 */
export function DefenseIcon({
  defenseId,
  level,
  size,
}: {
  defenseId: string;
  level: number;
  size: number;
}): React.ReactElement | null {
  if (defenseId === "cannon") return <CannonIcon level={level} px={size} />;
  return null;
}
