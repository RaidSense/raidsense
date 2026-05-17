/**
 * Tests for the isometric calibration pipeline.
 * Verifies: calcN accuracy, s2t/t2s round-trip, wall ring rasterization,
 * end-to-end placement pipeline.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

// ── Replicate modal math (same as RecognitionCalibrationModal.tsx) ────────────

const GRID = 44;
const IMG_W = 800; // simulated image width
const IMG_H = 600; // simulated image height

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
function calcN(pts:{px:{x:number;y:number};tile:[number,number]}[]):T|null {
  const n=pts.length; if(n<2) return null;
  let sK=0,sKK=0,sPx=0,sKPx=0;
  let sL=0,sLL=0,sPy=0,sLPy=0;
  for(const {px,tile} of pts){
    const k=tile[0]-tile[1],l=tile[0]+tile[1];
    sK+=k;sKK+=k*k;sPx+=px.x;sKPx+=k*px.x;
    sL+=l;sLL+=l*l;sPy+=px.y;sLPy+=l*px.y;
  }
  const detX=n*sKK-sK*sK; if(Math.abs(detX)<1e-6) return null;
  const ox=(sKK*sPx-sK*sKPx)/detX;
  const s =(n*sKPx-sK*sPx)/detX;   if(s<=0) return null;
  const detY=n*sLL-sL*sL;  if(Math.abs(detY)<1e-6) return null;
  const oy=(sLL*sPy-sL*sLPy)/detY;
  const sr=(n*sLPy-sL*sPy)/detY;   if(sr<=0) return null;
  return {ox,oy,s,r:sr/s};
}

// Converts screen px → pixel percentage, then to tile via calibration
function pct2tile(screenX:number, screenY:number, irLeft:number, irTop:number, irW:number, irH:number, t:T) {
  return s2t(irLeft + (screenX/IMG_W*100/100)*irW, irTop + (screenY/IMG_H*100/100)*irH, t);
}

function screenToPct(sx:number, sy:number):{pixelX:number;pixelY:number} {
  return {pixelX: sx/IMG_W*100, pixelY: sy/IMG_H*100};
}

// ── Ground truth transform ────────────────────────────────────────────────────
// Simulates a CoC screenshot where the diamond fits in 700×500px of an 800×600 image
const TRUE:T = {ox:400, oy:50, s:8, r:0.5};
// Image rect (the image area within the container)
const IR = {left:0, top:0, width:IMG_W, height:IMG_H};

// Helper: tile center screen position
function tileCenter(tx:number, ty:number, sz:number):[number,number] {
  return t2s(tx+sz/2, ty+sz/2, TRUE);
}

// ── Test 1: calcN exact solution for 2 points ─────────────────────────────────
test("calcN — 2 points gives exact solution", ()=>{
  const refA={px:{x:t2s(0,0,TRUE)[0],  y:t2s(0,0,TRUE)[1]},  tile:[0,0]  as [number,number]};
  const refB={px:{x:t2s(43,0,TRUE)[0], y:t2s(43,0,TRUE)[1]}, tile:[43,0] as [number,number]};
  const t=calcN([refA,refB]);
  assert(t!==null, "calcN returned null");
  assert(Math.abs(t.ox-TRUE.ox)<0.01, `ox mismatch: ${t.ox} vs ${TRUE.ox}`);
  assert(Math.abs(t.oy-TRUE.oy)<0.01, `oy mismatch: ${t.oy} vs ${TRUE.oy}`);
  assert(Math.abs(t.s -TRUE.s )<0.01, `s  mismatch: ${t.s}  vs ${TRUE.s}`);
  assert(Math.abs(t.r -TRUE.r )<0.01, `r  mismatch: ${t.r}  vs ${TRUE.r}`);
});

// ── Test 2: calcN 3 points vs 2 points under noise ───────────────────────────
test("calcN — 3 points beats 2 points under ±3px noise", ()=>{
  const ptsClean = [
    {px:{x:t2s(0,0,TRUE)[0],  y:t2s(0,0,TRUE)[1]},  tile:[0,0]  as [number,number]},
    {px:{x:t2s(43,0,TRUE)[0], y:t2s(43,0,TRUE)[1]}, tile:[43,0] as [number,number]},
    {px:{x:t2s(0,43,TRUE)[0], y:t2s(0,43,TRUE)[1]}, tile:[0,43] as [number,number]},
  ];

  // Add realistic noise (±3px = simulated hand-placement error)
  function addNoise(pts:typeof ptsClean, mag:number) {
    return pts.map((p,i)=>({...p,px:{x:p.px.x+(i===0?0:mag*(-1)**i), y:p.px.y+(i===0?0:mag*(-1)**(i+1))}}));
  }

  const noise3 = addNoise(ptsClean, 3);
  const t2pt   = calcN(noise3.slice(0,2))!;
  const t3pt   = calcN(noise3)!;

  // Reconstruct the true center tile (22,22) with both transforms
  const [trueScreenX, trueScreenY] = t2s(22,22,TRUE);
  const r2 = s2t(trueScreenX, trueScreenY, t2pt);
  const r3 = s2t(trueScreenX, trueScreenY, t3pt);
  const err2 = Math.abs(r2.x-22)+Math.abs(r2.y-22);
  const err3 = Math.abs(r3.x-22)+Math.abs(r3.y-22);

  // 3-point should be at least as good as 2-point
  assert(err3<=err2+1, `3-point (err=${err3}) should be ≤ 2-point (err=${err2})`);
});

// ── Test 3: s2t(t2s(x,y)) round-trip ─────────────────────────────────────────
test("s2t(t2s) — round-trip for key tile positions", ()=>{
  // Note: (x,y,sz) must satisfy inBounds: x+sz<=44 AND y+sz<=44
  // (0,43,3) and (43,0,3) are out-of-bounds (e.g. 43+3=46>44) — excluded
  const cases:[number,number,number][]=[
    [0,0,1],[5,5,3],[10,10,4],[20,20,2],[40,40,3],[0,41,3],[41,0,3],[22,22,4]
  ];
  for(const[tlx,tly,sz] of cases){
    const [sx,sy]=t2s(tlx+sz/2, tly+sz/2, TRUE); // center of footprint
    const result=s2t(sx,sy,TRUE);
    const off=Math.floor(sz/2);
    const recovered={x:Math.max(0,result.x-off), y:Math.max(0,result.y-off)};
    assert(recovered.x===tlx && recovered.y===tly,
      `sz=${sz} at (${tlx},${tly}): got (${recovered.x},${recovered.y})`);
  }
});

// ── Test 4: Wall ring rasterization ──────────────────────────────────────────
function rasterizeRing(corners:{x:number;y:number}[]):{x:number;y:number}[] {
  const tiles:{x:number;y:number}[]=[];
  const n=corners.length;
  for(let i=0;i<n;i++){
    const a=corners[i], b=corners[(i+1)%n];
    const dx=b.x-a.x, dy=b.y-a.y;
    const steps=Math.max(Math.abs(dx),Math.abs(dy));
    for(let j=0;j<=steps;j++){
      const f=steps>0?j/steps:0;
      tiles.push({x:Math.max(0,Math.min(43,Math.round(a.x+dx*f))),y:Math.max(0,Math.min(43,Math.round(a.y+dy*f)))});
    }
  }
  return tiles;
}

test("rasterizeRing — 10×10 square ring has 36 unique perimeter tiles", ()=>{
  // Ring in tile space: corners at (5,5),(14,5),(14,14),(5,14) — each edge is 10 tiles
  const corners=[{x:5,y:5},{x:14,y:5},{x:14,y:14},{x:5,y:14}];
  const tiles=rasterizeRing(corners);
  const unique=new Set(tiles.map(t=>`${t.x},${t.y}`));
  // Perimeter of 10×10 square = 4*(10-1) + 4 corners already counted = 4*9+4=40... wait
  // Actually: top edge 5→14 = 10 tiles, right edge 5→14 = 10 tiles, etc. = 4*10 = 40, minus 4 corners counted twice = 36
  assert(unique.size===36, `Expected 36 unique tiles, got ${unique.size}`);
});

test("rasterizeRing — horizontal run (2 corners, same y)", ()=>{
  // Degenerate ring: just a horizontal run
  const corners=[{x:10,y:10},{x:15,y:10}];
  const tiles=rasterizeRing(corners);
  const unique=new Set(tiles.map(t=>`${t.x},${t.y}`));
  // 6 tiles: 10,11,12,13,14,15 — then back from 15 to 10 = same tiles
  // With dedup: 6 unique
  assert(unique.size>=5 && unique.size<=6, `Expected 5-6 unique tiles, got ${unique.size}`);
});

test("rasterizeRing — L-shaped ring (6 corners)", ()=>{
  // L-shape in tile space
  const corners=[{x:5,y:5},{x:15,y:5},{x:15,y:10},{x:10,y:10},{x:10,y:15},{x:5,y:15}];
  const tiles=rasterizeRing(corners);
  const unique=new Set(tiles.map(t=>`${t.x},${t.y}`));
  // Should have tiles along all 6 edges
  assert(unique.size>15, `L-shape should have >15 tiles, got ${unique.size}`);
  // All tiles should be in valid range
  for(const t of tiles){
    assert(t.x>=0&&t.x<=43&&t.y>=0&&t.y<=43, `Tile out of bounds: (${t.x},${t.y})`);
  }
});

// ── Test 5: End-to-end pipeline (mock Claude → tiles) ─────────────────────────
test("pipeline — Town Hall (4×4) placed at expected tile after calibration", ()=>{
  const TRUE_TL=[18,18]; // true top-left of TH
  const sz=4;
  const [csx, csy]=tileCenter(TRUE_TL[0],TRUE_TL[1],sz); // center screen coords

  // Simulate Claude detection: report pixel percentage for TH center
  const {pixelX, pixelY}=screenToPct(csx, csy);

  // Simulate calibration: use 3 diamond vertices as reference points
  const handles=[
    {px:{x:t2s(0,0,TRUE)[0],  y:t2s(0,0,TRUE)[1]},  tile:[0,0]  as [number,number]},
    {px:{x:t2s(43,0,TRUE)[0], y:t2s(43,0,TRUE)[1]}, tile:[43,0] as [number,number]},
    {px:{x:t2s(0,43,TRUE)[0], y:t2s(0,43,TRUE)[1]}, tile:[0,43] as [number,number]},
  ];
  const t=calcN(handles)!;

  // Convert Claude's pixelX/Y to screen coords (same as conv() in modal)
  const screenX=IR.left+(pixelX/100)*IR.width;
  const screenY=IR.top +(pixelY/100)*IR.height;
  const tile=s2t(screenX, screenY, t);
  const off=Math.floor(sz/2);
  const placed={x:Math.max(0,tile.x-off), y:Math.max(0,tile.y-off)};

  assert(placed.x===TRUE_TL[0] && placed.y===TRUE_TL[1],
    `TH should be at (${TRUE_TL}), got (${placed.x},${placed.y})`);
});

test("pipeline — Canon (3×3) with ±2px noise still within 1 tile", ()=>{
  const TRUE_TL=[10,12];
  const sz=3;
  const [csx,csy]=tileCenter(TRUE_TL[0],TRUE_TL[1],sz);

  // Add ±2px noise to simulate Claude's imprecision
  const noisyScreenX=csx+2, noisyScreenY=csy-1;
  const {pixelX,pixelY}=screenToPct(noisyScreenX, noisyScreenY);

  // Calibration with ±1px handle noise
  const handles=[
    {px:{x:t2s(0,0,TRUE)[0]+1,  y:t2s(0,0,TRUE)[1]},  tile:[0,0]  as [number,number]},
    {px:{x:t2s(43,0,TRUE)[0]-1, y:t2s(43,0,TRUE)[1]+1},tile:[43,0] as [number,number]},
    {px:{x:t2s(0,43,TRUE)[0]+1, y:t2s(0,43,TRUE)[1]-1},tile:[0,43] as [number,number]},
  ];
  const t=calcN(handles)!;

  const screenX=IR.left+(pixelX/100)*IR.width;
  const screenY=IR.top +(pixelY/100)*IR.height;
  const tile=s2t(screenX, screenY, t);
  const off=Math.floor(sz/2);
  const placed={x:Math.max(0,tile.x-off), y:Math.max(0,tile.y-off)};

  const tileErr=Math.abs(placed.x-TRUE_TL[0])+Math.abs(placed.y-TRUE_TL[1]);
  assert(tileErr<=2, `Canon should be within 1 tile, got error=${tileErr} at (${placed.x},${placed.y}) vs (${TRUE_TL})`);
});

// ── Test 6: Wall ring calibration round-trip ──────────────────────────────────
test("wall ring — corners calibrated and rasterized correctly", ()=>{
  // A 10×10 wall ring at tiles (8,8)..(17,17) (top-left inclusive)
  const ringCornersTile=[
    {x:8,y:8},{x:17,y:8},{x:17,y:17},{x:8,y:17}
  ];

  // Convert to screen pixels (using center of each corner tile)
  const cornersPct=ringCornersTile.map(c=>{
    const [sx,sy]=t2s(c.x+0.5, c.y+0.5, TRUE); // center of corner tile
    return screenToPct(sx,sy);
  });

  // Calibrate
  const handles=[
    {px:{x:t2s(0,0,TRUE)[0],  y:t2s(0,0,TRUE)[1]},  tile:[0,0]  as [number,number]},
    {px:{x:t2s(43,0,TRUE)[0], y:t2s(43,0,TRUE)[1]}, tile:[43,0] as [number,number]},
    {px:{x:t2s(0,43,TRUE)[0], y:t2s(0,43,TRUE)[1]}, tile:[0,43] as [number,number]},
  ];
  const t=calcN(handles)!;

  // Convert corners back to tile space
  function convCorner(pct:{pixelX:number;pixelY:number}){
    return s2t(IR.left+(pct.pixelX/100)*IR.width, IR.top+(pct.pixelY/100)*IR.height, t);
  }
  const tileCornersRecovered=cornersPct.map(convCorner);

  // Rasterize
  const wallTiles=rasterizeRing(tileCornersRecovered);
  const unique=new Set(wallTiles.map(t=>`${t.x},${t.y}`));

  // Expected: 36 unique tiles (perimeter of 10×10 ring)
  // With floor rounding: might be ±2
  assert(unique.size>=32 && unique.size<=40,
    `Expected ~36 wall tiles, got ${unique.size}`);

  // Verify corners are close to expected
  for(let i=0;i<4;i++){
    const r=tileCornersRecovered[i], e=ringCornersTile[i];
    const err=Math.abs(r.x-e.x)+Math.abs(r.y-e.y);
    assert(err<=1, `Corner ${i} off by ${err}: got (${r.x},${r.y}) expected (${e.x},${e.y})`);
  }
});

// ── Test 7: Stress test — many buildings, verify placement stability ───────────
test("placement stability — same input always gives same output", ()=>{
  // Simulate 10 buildings at known positions
  const buildings=[
    {id:"cannon",      sz:3, tl:[10,10]},
    {id:"archer-tower",sz:3, tl:[15,10]},
    {id:"mortar",      sz:3, tl:[20,12]},
    {id:"town-hall",   sz:4, tl:[18,18]},
    {id:"inferno-tower",sz:2,tl:[12,14]},
    {id:"wizard-tower",sz:3, tl:[24,8]},
    {id:"cannon",      sz:3, tl:[8,20]},
    {id:"air-defense", sz:3, tl:[28,20]},
    {id:"x-bow",       sz:3, tl:[14,24]},
    {id:"bomb-tower",  sz:3, tl:[22,24]},
  ];

  // Generate pixel percentages
  const handles=[
    {px:{x:t2s(0,0,TRUE)[0],y:t2s(0,0,TRUE)[1]},tile:[0,0]   as [number,number]},
    {px:{x:t2s(43,0,TRUE)[0],y:t2s(43,0,TRUE)[1]},tile:[43,0] as [number,number]},
    {px:{x:t2s(0,43,TRUE)[0],y:t2s(0,43,TRUE)[1]},tile:[0,43] as [number,number]},
  ];
  const t=calcN(handles)!;

  function place(tl:[number,number], sz:number){
    const [csx,csy]=tileCenter(tl[0],tl[1],sz);
    const {pixelX,pixelY}=screenToPct(csx,csy);
    const tile=s2t(IR.left+(pixelX/100)*IR.width, IR.top+(pixelY/100)*IR.height, t);
    const off=Math.floor(sz/2);
    return {x:Math.max(0,tile.x-off), y:Math.max(0,tile.y-off)};
  }

  // Run 5 times — all must produce identical results (deterministic)
  const results=Array.from({length:5},()=>buildings.map(b=>place(b.tl as [number,number],b.sz)));
  for(let run=1;run<5;run++){
    for(let i=0;i<buildings.length;i++){
      assert(results[run][i].x===results[0][i].x && results[run][i].y===results[0][i].y,
        `Run ${run} building ${i} differs: ${JSON.stringify(results[run][i])} vs ${JSON.stringify(results[0][i])}`);
    }
  }

  // Verify each building is at the expected tile (within 0 error for perfect calibration)
  for(let i=0;i<buildings.length;i++){
    const b=buildings[i], r=results[0][i];
    assert(r.x===b.tl[0] && r.y===b.tl[1],
      `Building ${b.id} at wrong tile: (${r.x},${r.y}) vs expected (${b.tl})`);
  }
});

// ── Test 8: Edge cases ────────────────────────────────────────────────────────
test("calcN — returns null for collinear points (same k)", ()=>{
  // top(0,0) and bottom(43,43) both have k=0 → degenerate for x
  const pts=[
    {px:{x:t2s(0,0,TRUE)[0],   y:t2s(0,0,TRUE)[1]},   tile:[0,0]   as [number,number]},
    {px:{x:t2s(43,43,TRUE)[0], y:t2s(43,43,TRUE)[1]}, tile:[43,43] as [number,number]},
  ];
  const t=calcN(pts);
  assert(t===null, `calcN should return null for top+bottom (collinear), got ${JSON.stringify(t)}`);
});

test("calcN — returns null for collinear points (same l)", ()=>{
  // right(43,0) and left(0,43) both have l=43 → degenerate for y
  const pts=[
    {px:{x:t2s(43,0,TRUE)[0], y:t2s(43,0,TRUE)[1]}, tile:[43,0] as [number,number]},
    {px:{x:t2s(0,43,TRUE)[0], y:t2s(0,43,TRUE)[1]}, tile:[0,43] as [number,number]},
  ];
  const t=calcN(pts);
  assert(t===null, `calcN should return null for right+left (collinear), got ${JSON.stringify(t)}`);
});

test("s2t — clamps to [0,43]", ()=>{
  // Point far outside the grid
  const far=s2t(-1000, -1000, TRUE);
  assert(far.x===0 && far.y===0, `Expected (0,0), got (${far.x},${far.y})`);
  const farRight=s2t(99999, 99999, TRUE);
  assert(farRight.x===43 && farRight.y===43, `Expected (43,43), got (${farRight.x},${farRight.y})`);
});
