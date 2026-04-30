#!/usr/bin/env node
'use strict';
/**
 * scripts/scrape-wiki.js
 *
 * Récupère les stats de troupes ET de défenses CoC via l'API MediaWiki (wikitext brut).
 *
 * API utilisée :
 *   https://clashofclans.fandom.com/api.php
 *     ?action=parse&prop=wikitext&format=json&page=<Page>
 *
 * Usage :
 *   node scripts/scrape-wiki.js           → troupes + défenses
 *   node scripts/scrape-wiki.js troops    → troupes seulement
 *   node scripts/scrape-wiki.js defenses  → défenses seulement
 */

const https = require('https');
const http  = require('http');

// ── Config ─────────────────────────────────────────────────────────────────

const TROOPS_TO_SCRAPE = [
  'Barbarian',
  'Archer',
  'Giant',
  'Goblin',
  'Wall Breaker',
  'Balloon',
  'Wizard',
  'Healer',
  'Dragon',
  'P.E.K.K.A',
  'Baby Dragon',
  'Miner',
  'Electro Dragon',
];

const DEFENSES_TO_SCRAPE = [
  'Cannon',
  'Archer Tower',
  'Mortar',
  'Air Defense',
  'Wizard Tower',
  'X-Bow',
  'Inferno Tower',
  'Eagle Artillery',
  'Scattershot',
];

const API = 'https://clashofclans.fandom.com/api.php';

const REQ_HEADERS = {
  'User-Agent': 'RaidSense-Scraper/1.0 (https://github.com/RaidSense/raidsense)',
  'Accept':     'application/json',
};

// ── HTTP ───────────────────────────────────────────────────────────────────

function get(url, hops = 5) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: REQ_HEADERS }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (!hops) { reject(new Error('Trop de redirections')); return; }
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        get(next, hops - 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} — ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

// ── Nettoyage du wikitext ──────────────────────────────────────────────────

/**
 * Nettoie le contenu d'une cellule wikitext :
 *   {{Formatnum:1234}} → "1234"
 *   [[link|texte]]     → "texte"
 *   '''gras'''         → "gras"
 *   <br />, <ref>…    → supprimés
 */
function cleanCell(raw) {
  let s = (raw ?? '').trim();

  // {{Formatnum:N}} → N (avant de supprimer les autres templates)
  s = s.replace(/\{\{formatnum:([^|}]*)\}\}/gi, '$1');

  // Templates imbriqués : plusieurs passes jusqu'à stabilisation
  for (let pass = 0; pass < 3; pass++) {
    s = s.replace(/\{\{[^{}]*\}\}/g, '');
  }

  // [[File:…]] / [[Image:…]]
  s = s.replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, '');

  // [[lien|texte]] → texte  /  [[lien]] → lien
  s = s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1');

  // Balises HTML
  s = s.replace(/<[^>]*>/g, '');

  // Markup gras / italique
  s = s.replace(/'{2,5}/g, '');

  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Extrait le contenu d'une cellule qui peut commencer par des attributs :
 *   "style=... | contenu"  →  "contenu"
 *   "45"                   →  "45"
 */
function cellContent(raw) {
  const s = raw.trim();
  const pipe = s.indexOf('|');
  if (pipe > 0 && s.slice(0, pipe).includes('=')) {
    return cleanCell(s.slice(pipe + 1));
  }
  return cleanCell(s);
}

// ── Parser de tables wikitext ──────────────────────────────────────────────

function extractWikitextTables(wikitext) {
  const tables = [];
  const lines  = wikitext.split('\n');
  let depth    = 0;
  let buf      = [];

  for (const line of lines) {
    const t = line.trimStart();

    if (t.startsWith('{|')) {
      depth++;
      buf.push(line);
    } else if (t.startsWith('|}')) {
      if (depth > 0) {
        buf.push(line);
        depth--;
        if (depth === 0) {
          tables.push(buf.join('\n'));
          buf = [];
        }
      }
    } else if (depth > 0) {
      buf.push(line);
    }
  }

  return tables;
}

function parseWikitextTable(tableText) {
  const rows  = [];
  let curRow  = null;
  const lines = tableText.split('\n').slice(1, -1);

  for (const line of lines) {
    const t = line.trimStart();

    if (t.startsWith('|-')) {
      if (curRow !== null && curRow.length > 0) rows.push(curRow);
      curRow = [];
      continue;
    }

    if (t.startsWith('|+')) continue;

    if (t.startsWith('!')) {
      if (curRow === null) curRow = [];
      const parts = t.slice(1).split('!!');
      curRow.push(...parts.map(cellContent));
      continue;
    }

    if (t.startsWith('||')) {
      if (curRow === null) curRow = [];
      const parts = t.slice(2).split('||');
      curRow.push(...parts.map(cellContent));
      continue;
    }

    if (t.startsWith('|')) {
      if (curRow === null) curRow = [];
      const parts = t.slice(1).split('||');
      curRow.push(...parts.map(cellContent));
      continue;
    }
  }

  if (curRow !== null && curRow.length > 0) rows.push(curRow);

  return rows;
}

// ── Infobox parser ─────────────────────────────────────────────────────────

/**
 * Extrait les champs clé=valeur depuis les templates d'infobox du wikitext.
 * Format attendu sur CoC Fandom : "| NomChamp = Valeur" (une ligne par champ).
 * Retourne un objet { clé_normalisée: valeur_nettoyée }.
 */
function extractInfoboxFields(wikitext) {
  const fields = {};
  for (const line of wikitext.split('\n')) {
    // Ligne de type : | Clé = Valeur
    const m = line.match(/^\s*\|\s*([^|={}\n<>]+?)\s*=\s*(.*)/);
    if (!m) continue;
    const key = m[1].trim().toLowerCase().replace(/\s+/g, ' ');
    const val = cleanCell(m[2]);
    if (key && val && !fields[key]) fields[key] = val;
  }
  return fields;
}

/**
 * Parse le champ "range" du wiki.
 * Formats possibles : "9", "4-11", "7–50", "7 - 50 Tiles"
 * Retourne { min: number, max: number|null }.
 */
function parseRange(raw) {
  if (!raw) return { min: 0, max: null };
  // Nettoyer les unités ("tiles", "Tiles", etc.)
  const clean = raw.replace(/tiles?/gi, '').replace(/\s/g, '');
  // Format "N1-N2" ou "N1–N2"
  const m = clean.match(/^(\d+)[–\-](\d+)$/);
  if (m) return { min: parseInt(m[1]), max: parseInt(m[2]) };
  // Valeur unique
  const n = parseInt(clean);
  return { min: 0, max: isNaN(n) ? null : n };
}

/**
 * Détecte les mécaniques spéciales à partir des mots-clés dans le wikitext.
 */
function detectMechanics(wikitext) {
  const wl   = wikitext.toLowerCase();
  const hits = [];
  const checks = [
    [/\bsplash\b/,                       'splash damage'],
    [/\bminimum range\b/,                 'minimum range'],
    [/ramp[\s-]?up/,                      'ramp-up DPS'],
    [/\bsingle[\s-]target\b/,             'single-target mode'],
    [/\bmulti[\s-]target\b/,              'multi-target mode'],
    [/\bburst\b/,                         'burst fire'],
    [/\bbounce[sd]?\b/,                   'bouncing projectile'],
    [/\breloading?\b/,                    'needs reload'],
    [/ground[\s&]+air|air[\s&]+ground/,   'targets ground & air'],
    [/activat/,                           'conditional activation'],
  ];
  for (const [re, label] of checks) {
    if (re.test(wl)) hits.push(label);
  }
  return hits;
}

// ── Scraper : troupes ──────────────────────────────────────────────────────

async function scrapeTroop(pageName) {
  const url = `${API}?action=parse&page=${encodeURIComponent(pageName)}&prop=wikitext&format=json`;
  const raw  = await get(url);
  const json = JSON.parse(raw);

  if (json.error) throw new Error(`API error: ${json.error.info}`);

  const wikitext = json?.parse?.wikitext?.['*'] ?? '';
  if (!wikitext) throw new Error(`Wikitext vide pour "${pageName}"`);

  const tables = extractWikitextTables(wikitext);
  if (!tables.length) throw new Error(`Aucune table wikitext trouvée pour "${pageName}"`);

  let headers   = [];
  let statTable = null;

  for (const tbl of tables) {
    const rows = parseWikitextTable(tbl);
    for (const row of rows.slice(0, 4)) {
      const hasLevel  = row.some((c) => /\blevel\b/i.test(c));
      const hasHp     = row.some((c) => /hitpoints|hit\s*point/i.test(c));
      const hasDamage = row.some((c) => /damage/i.test(c));
      if (hasLevel && (hasHp || hasDamage)) {
        statTable = tbl;
        headers   = row;
        break;
      }
    }
    if (statTable) break;
  }

  if (!statTable) {
    const preview = tables.map((t, i) => {
      const rows = parseWikitextTable(t);
      const head = (rows[0] ?? []).slice(0, 6).join(' | ');
      return `  [${i + 1}] ${head || '(vide)'}`;
    }).join('\n');
    throw new Error(
      `Aucune table de stats trouvée pour "${pageName}".\n` +
      `Tables disponibles :\n${preview}`
    );
  }

  const allRows = parseWikitextTable(statTable);
  const data    = allRows.filter((r) => /^\d+$/.test((r[0] ?? '').trim()));
  if (!data.length) throw new Error(`Aucune ligne de données pour "${pageName}"`);

  function col(pattern) {
    return headers.findIndex((h) => pattern.test(h));
  }

  const iLevel = col(/\blevel\b/i);
  const iHp    = col(/hitpoints|hit\s*point/i);
  const iDps   = col(/damage per second/i);
  const iDpa   = col(/damage per attack/i);
  const iSpd   = col(/movement speed/i);
  const iTh    = col(/town\s*hall/i);

  const num = (s) => parseInt((s ?? '').replace(/[^0-9]/g, '') || '0');

  const levels = data
    .map((r) => ({
      level: num(r[iLevel]),
      hp:    iHp  >= 0 ? num(r[iHp])  : null,
      dps:   iDps >= 0 ? num(r[iDps]) : null,
      dpa:   iDpa >= 0 ? num(r[iDpa]) : null,
      speed: iSpd >= 0 ? (r[iSpd] ?? null) : null,
      th:    iTh  >= 0 ? num(r[iTh])  : null,
    }))
    .filter((l) => l.level > 0);

  return { name: pageName, headers, levels };
}

// ── Scraper : défenses ─────────────────────────────────────────────────────

async function scrapeDefense(pageName) {
  const url = `${API}?action=parse&page=${encodeURIComponent(pageName)}&prop=wikitext&format=json`;
  const raw  = await get(url);
  const json = JSON.parse(raw);

  if (json.error) throw new Error(`API error: ${json.error.info}`);

  const wikitext = json?.parse?.wikitext?.['*'] ?? '';
  if (!wikitext) throw new Error(`Wikitext vide pour "${pageName}"`);

  // ── Infobox ───────────────────────────────────────────────────────────────

  const infobox = extractInfoboxFields(wikitext);

  // Portée : essayer plusieurs noms de champs courants du wiki CoC
  const rangeRaw  = infobox['range'] ?? infobox['attack range'] ?? infobox['range1'] ?? null;
  const range     = parseRange(rangeRaw);

  // Portée minimale (parfois séparée)
  const minRaw = infobox['minimum range'] ?? infobox['min range'] ?? infobox['min attack range'] ?? null;
  if (minRaw) {
    const parsed = parseInt(minRaw);
    if (!isNaN(parsed)) range.min = parsed;
  }

  // Type de cible
  const targetRaw = infobox['targets']
    ?? infobox['target type']
    ?? infobox['attack type']
    ?? infobox['target']
    ?? '';

  // Taille du bâtiment (tuiles)
  const sizeRaw = infobox['size']
    ?? infobox['building size']
    ?? infobox['footprint']
    ?? '';

  // ── Table de stats ────────────────────────────────────────────────────────

  const tables  = extractWikitextTables(wikitext);
  let headers   = [];
  let statTable = null;

  for (const tbl of tables) {
    const rows = parseWikitextTable(tbl);
    for (const row of rows.slice(0, 4)) {
      const hasLevel  = row.some((c) => /\blevel\b/i.test(c));
      const hasHp     = row.some((c) => /hitpoints|hit\s*point/i.test(c));
      const hasDamage = row.some((c) => /damage/i.test(c));
      if (hasLevel && (hasHp || hasDamage)) {
        statTable = tbl;
        headers   = row;
        break;
      }
    }
    if (statTable) break;
  }

  let levels = [];

  if (statTable) {
    const allRows = parseWikitextTable(statTable);
    const data    = allRows.filter((r) => /^\d+$/.test((r[0] ?? '').trim()));

    function col(pattern) {
      return headers.findIndex((h) => pattern.test(h));
    }

    const iLevel = col(/\blevel\b/i);
    const iHp    = col(/hitpoints|hit\s*point/i);
    const iDps   = col(/damage per second/i);
    const iDpa   = col(/damage per attack/i);
    const iTh    = col(/town\s*hall/i);
    const iRange = col(/\brange\b/i);

    const num = (s) => parseInt((s ?? '').replace(/[^0-9]/g, '') || '0');

    levels = data
      .map((r) => ({
        level:    num(r[iLevel]),
        hp:       iHp    >= 0 ? num(r[iHp])    : null,
        dps:      iDps   >= 0 ? num(r[iDps])   : null,
        dpa:      iDpa   >= 0 ? num(r[iDpa])   : null,
        rangeCol: iRange >= 0 ? (r[iRange] ?? null) : null,
        th:       iTh    >= 0 ? num(r[iTh])    : null,
      }))
      .filter((l) => l.level > 0);
  }

  // Diagnostic si aucune table trouvée
  const tablePreview = !statTable
    ? tables.map((t, i) => {
        const rows = parseWikitextTable(t);
        return `  [${i + 1}] ${(rows[0] ?? []).slice(0, 5).join(' | ') || '(vide)'}`;
      }).join('\n')
    : null;

  // ── Mécaniques spéciales ──────────────────────────────────────────────────

  const mechanics = detectMechanics(wikitext);

  return {
    name:         pageName,
    range,
    target:       cleanCell(targetRaw),
    size:         cleanCell(sizeRaw),
    mechanics,
    headers,
    levels,
    infoboxKeys:  Object.keys(infobox),
    tablePreview,
  };
}

// ── Affichage : troupes ────────────────────────────────────────────────────

function displayTroop(result) {
  const SEP = '═'.repeat(70);
  console.log(`\n${SEP}`);
  console.log(`  ${result.name.toUpperCase()}  (${result.levels.length} niveaux)`);
  console.log(SEP);
  console.log(`  En-têtes :\n  ${result.headers.join(' | ')}\n`);

  const cols = [
    { label: 'Niv',     w: 3,  get: (l) => l.level },
    { label: 'HP',      w: 7,  get: (l) => l.hp    },
    { label: 'DPS',     w: 5,  get: (l) => l.dps   },
    { label: 'DPA',     w: 6,  get: (l) => l.dpa   },
    { label: 'Vitesse', w: 7,  get: (l) => l.speed },
    { label: 'TH min',  w: 6,  get: (l) => l.th    },
  ];

  console.log('  ' + cols.map((c) => c.label.padStart(c.w)).join('  '));
  console.log('  ' + cols.map((c) => '─'.repeat(c.w)).join('  '));

  for (const l of result.levels) {
    const row = cols.map((c) => {
      const v = c.get(l);
      return (v != null ? String(v) : '—').padStart(c.w);
    });
    console.log('  ' + row.join('  '));
  }
}

// ── Affichage : défenses ───────────────────────────────────────────────────

function displayDefense(result) {
  const SEP = '═'.repeat(70);
  console.log(`\n${SEP}`);
  console.log(`  ${result.name.toUpperCase()}  (${result.levels.length} niveaux)`);
  console.log(SEP);

  // Infos globales
  console.log(`  Cible       : ${result.target || '(non trouvé)'}`);
  console.log(`  Portée      : min=${result.range.min}  max=${result.range.max ?? '?'}`);
  console.log(`  Taille      : ${result.size || '(non trouvé)'}`);
  console.log(`  Mécaniques  : ${result.mechanics.length ? result.mechanics.join(', ') : 'aucune détectée'}`);

  // Diagnostic infobox
  if (result.infoboxKeys.length) {
    const preview = result.infoboxKeys.slice(0, 15).join(', ');
    const more    = result.infoboxKeys.length > 15 ? ` (+${result.infoboxKeys.length - 15})` : '';
    console.log(`  Champs infobox : ${preview}${more}`);
  }

  // Diagnostic table manquante
  if (result.tablePreview) {
    console.log(`\n  ⚠  Aucune table de stats trouvée. Tables disponibles :`);
    console.log(result.tablePreview);
  }

  if (!result.levels.length) {
    console.log('');
    return;
  }

  console.log(`  En-têtes table : ${result.headers.join(' | ')}\n`);

  const cols = [
    { label: 'Niv',    w: 3, get: (l) => l.level    },
    { label: 'HP',     w: 7, get: (l) => l.hp       },
    { label: 'DPS',    w: 6, get: (l) => l.dps      },
    { label: 'DPA',    w: 6, get: (l) => l.dpa      },
    { label: 'Portée', w: 7, get: (l) => l.rangeCol },
    { label: 'TH',     w: 4, get: (l) => l.th       },
  ];

  console.log('  ' + cols.map((c) => c.label.padStart(c.w)).join('  '));
  console.log('  ' + cols.map((c) => '─'.repeat(c.w)).join('  '));

  for (const l of result.levels) {
    const row = cols.map((c) => {
      const v = c.get(l);
      return (v != null ? String(v) : '—').padStart(c.w);
    });
    console.log('  ' + row.join('  '));
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

(async () => {
  const mode = process.argv[2] ?? 'all'; // 'troops' | 'defenses' | 'all'

  console.log('RaidSense Wiki Scraper  (wikitext mode)');
  console.log(`API  : ${API}`);
  console.log(`Mode : ${mode}\n`);

  if (mode === 'all' || mode === 'troops') {
    console.log(`\n${'▓'.repeat(70)}`);
    console.log(`  TROUPES (${TROOPS_TO_SCRAPE.length})`);
    console.log('▓'.repeat(70));

    for (const name of TROOPS_TO_SCRAPE) {
      try {
        displayTroop(await scrapeTroop(name));
      } catch (err) {
        console.error(`\n[ERREUR] ${name} :\n  ${err.message}`);
      }
    }
  }

  if (mode === 'all' || mode === 'defenses') {
    console.log(`\n${'▓'.repeat(70)}`);
    console.log(`  DÉFENSES (${DEFENSES_TO_SCRAPE.length})`);
    console.log('▓'.repeat(70));

    for (const name of DEFENSES_TO_SCRAPE) {
      try {
        displayDefense(await scrapeDefense(name));
      } catch (err) {
        console.error(`\n[ERREUR] ${name} :\n  ${err.message}`);
      }
    }
  }

  console.log('\nTerminé.\n');
})();
