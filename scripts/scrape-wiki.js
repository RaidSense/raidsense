#!/usr/bin/env node
'use strict';
/**
 * scripts/scrape-wiki.js
 *
 * Récupère les stats de troupes CoC via l'API MediaWiki (wikitext brut).
 * Le wikitext contient les tableaux avant tout rendu JavaScript.
 *
 * API utilisée :
 *   https://clashofclans.fandom.com/api.php
 *     ?action=parse&prop=wikitext&format=json&page=<Troupe>
 *
 * Usage :
 *   node scripts/scrape-wiki.js
 */

const https = require('https');
const http  = require('http');

// ── Config ─────────────────────────────────────────────────────────────────

const TROOPS_TO_SCRAPE = ['Barbarian', 'Giant'];

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
  let s = raw.trim();

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
  // Si la partie avant un éventuel | contient un =, ce sont des attributs
  const pipe = s.indexOf('|');
  if (pipe > 0 && s.slice(0, pipe).includes('=')) {
    return cleanCell(s.slice(pipe + 1));
  }
  return cleanCell(s);
}

// ── Parser de tables wikitext ──────────────────────────────────────────────

/**
 * Extrait tous les blocs {| … |} du wikitext, en suivant la profondeur
 * pour gérer les tables imbriquées correctement.
 */
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

/**
 * Parse un bloc de table wikitext en tableau de lignes × colonnes.
 *
 * Formats gérés :
 *   ! En-tête 1 !! En-tête 2 !! …   (headers sur une ligne)
 *   | cellule 1 || cellule 2 || …   (données sur une ligne)
 *   |                                (cellule isolée)
 *   |-                               (séparateur de ligne)
 */
function parseWikitextTable(tableText) {
  const rows    = [];
  let curRow    = null;
  // Ignorer la première ligne ({| class=…) et la dernière (|})
  const lines   = tableText.split('\n').slice(1, -1);

  for (const line of lines) {
    const t = line.trimStart();

    if (t.startsWith('|-')) {
      // Séparateur : sauvegarder la ligne courante et en commencer une nouvelle
      if (curRow !== null && curRow.length > 0) rows.push(curRow);
      curRow = [];
      continue;
    }

    if (t.startsWith('|+')) continue; // Légende de table

    if (t.startsWith('!')) {
      // Ligne d'en-têtes : peut contenir plusieurs cellules séparées par !!
      if (curRow === null) curRow = [];
      const parts = t.slice(1).split('!!');
      curRow.push(...parts.map(cellContent));
      continue;
    }

    if (t.startsWith('||')) {
      // Continuation de cellules sur la même ligne (rare mais possible)
      if (curRow === null) curRow = [];
      const parts = t.slice(2).split('||');
      curRow.push(...parts.map(cellContent));
      continue;
    }

    if (t.startsWith('|')) {
      // Ligne de données : une ou plusieurs cellules séparées par ||
      if (curRow === null) curRow = [];
      const parts = t.slice(1).split('||');
      curRow.push(...parts.map(cellContent));
      continue;
    }

    // Ligne de continuation d'une cellule multi-ligne (ignorée ici)
  }

  // Ne pas oublier la dernière ligne
  if (curRow !== null && curRow.length > 0) rows.push(curRow);

  return rows;
}

// ── Scraper ────────────────────────────────────────────────────────────────

async function scrapeTroop(pageName) {
  const url = `${API}?action=parse&page=${encodeURIComponent(pageName)}&prop=wikitext&format=json`;
  const raw  = await get(url);
  const json = JSON.parse(raw);

  if (json.error) throw new Error(`API error: ${json.error.info}`);

  const wikitext = json?.parse?.wikitext?.['*'] ?? '';
  if (!wikitext) throw new Error(`Wikitext vide pour "${pageName}"`);

  // Extraire toutes les tables du wikitext
  const tables = extractWikitextTables(wikitext);
  if (!tables.length) throw new Error(`Aucune table wikitext trouvée pour "${pageName}"`);

  // Trouver la table de stats (Level + Hitpoints + Damage dans les en-têtes)
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
    // Aide au diagnostic : afficher les premières lignes de chaque table
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

  // Lignes de données = première cellule est un entier (numéro de niveau)
  const allRows = parseWikitextTable(statTable);
  const data    = allRows.filter((r) => /^\d+$/.test((r[0] ?? '').trim()));

  if (!data.length) throw new Error(`Aucune ligne de données pour "${pageName}"`);

  // Mapper les colonnes par regex
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

// ── Affichage ──────────────────────────────────────────────────────────────

function display(result) {
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

// ── Main ───────────────────────────────────────────────────────────────────

(async () => {
  console.log('RaidSense Wiki Scraper  (wikitext mode)');
  console.log(`API  : ${API}`);
  console.log(`Test : ${TROOPS_TO_SCRAPE.join(', ')}\n`);

  for (const name of TROOPS_TO_SCRAPE) {
    try {
      const result = await scrapeTroop(name);
      display(result);
    } catch (err) {
      console.error(`\n[ERREUR] ${name} :\n  ${err.message}`);
    }
  }

  console.log('\nTerminé.\n');
})();
