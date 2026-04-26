#!/usr/bin/env node
'use strict';
/**
 * scripts/scrape-wiki.js
 *
 * Scrape https://clashofclans.fandom.com/wiki/<Troop> directement.
 * Cherche les tables avec class="wikitable" (pas l'API JSON).
 * Aucune dépendance externe — uniquement https built-in de Node.js.
 *
 * Usage :
 *   node scripts/scrape-wiki.js
 */

const https = require('https');
const http  = require('http');

// ── Config ─────────────────────────────────────────────────────────────────

const TROOPS_TO_SCRAPE = ['Barbarian', 'Giant'];

const WIKI_BASE = 'https://clashofclans.fandom.com/wiki/';

const REQ_HEADERS = {
  'User-Agent': 'RaidSense-Scraper/1.0 (https://github.com/RaidSense/raidsense)',
  'Accept':     'text/html,application/xhtml+xml',
};

// ── HTTP (avec suivi de redirections) ─────────────────────────────────────

function get(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: REQ_HEADERS }, (res) => {
      // Suivi de redirections 3xx
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects === 0) { reject(new Error('Trop de redirections')); return; }
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        get(next, redirects - 1).then(resolve).catch(reject);
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

// ── HTML utilities ─────────────────────────────────────────────────────────

const HTML_ENTITIES = {
  '&amp;':   '&',  '&lt;':    '<',  '&gt;':   '>',
  '&nbsp;':  ' ',  '&#160;':  ' ',  '&quot;': '"',
  '&ndash;': '–',  '&mdash;': '—',
};

function stripTags(html) {
  return html
    .replace(/<[^>]*>/g, ' ')             // remplace les balises par un espace
    .replace(/&[a-z#0-9]+;/gi, (e) => HTML_ENTITIES[e] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrait tous les blocs <table class="...wikitable...">…</table>
 * avec suivi de profondeur pour gérer l'imbrication correctement.
 */
function extractWikiTables(html) {
  const tables = [];
  const lower  = html.toLowerCase();
  let i = 0;

  while (i < lower.length) {
    // Trouver le prochain <table
    const s = lower.indexOf('<table', i);
    if (s === -1) break;

    // Lire jusqu'à la fermeture du tag ouvrant pour inspecter les attributs
    const tagClose = lower.indexOf('>', s);
    if (tagClose === -1) { i = s + 1; continue; }
    const openTag  = lower.slice(s, tagClose + 1);

    // Extraire le bloc complet avec suivi de profondeur
    let depth = 1;
    let j     = tagClose + 1;
    while (j < lower.length && depth > 0) {
      if (lower.startsWith('<table', j))        { depth++; j += 6; }
      else if (lower.startsWith('</table>', j)) { depth--; j += 8; }
      else                                       { j++;             }
    }

    // Ne garder que les tables avec la classe wikitable
    if (/class="[^"]*wikitable/.test(openTag)) {
      tables.push(html.slice(s, j));
    }

    i = s + 1;
  }

  return tables;
}

/**
 * Parse une table HTML en tableau de lignes × colonnes (chaînes brutes).
 * Supprime les tables imbriquées avant de chercher les <tr>.
 * Gère colspan.
 */
function parseRows(tableHtml) {
  // Supprimer les éventuelles tables imbriquées (en plusieurs passes)
  let flat = tableHtml;
  let prev;
  do {
    prev = flat;
    flat = flat.replace(/<table[^>]*>[\s\S]*?<\/table>/gi, '');
  } while (flat !== prev);

  const rows  = [];
  const trRe  = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let trM;

  while ((trM = trRe.exec(flat)) !== null) {
    const cells = [];
    const tdRe  = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    let tdM;

    while ((tdM = tdRe.exec(trM[1])) !== null) {
      const attrs   = tdM[2];
      const text    = stripTags(tdM[3]);
      const colspan = parseInt((attrs.match(/colspan=["']?(\d+)/i) ?? [])[1] ?? '1');
      for (let c = 0; c < colspan; c++) cells.push(text);
    }

    if (cells.length) rows.push(cells);
  }

  return rows;
}

// ── Scraper ────────────────────────────────────────────────────────────────

async function scrapeTroop(pageName) {
  const url  = WIKI_BASE + encodeURIComponent(pageName);
  const html = await get(url);

  const tables = extractWikiTables(html);
  if (!tables.length) throw new Error(`Aucune wikitable trouvée sur la page "${pageName}"`);

  // Trouver la table de stats : chercher celle dont les en-têtes
  // contiennent à la fois "Level"/"Niv", "Hitpoints" et "Damage".
  let statTable = null;
  let headers   = [];

  for (const tbl of tables) {
    const rows = parseRows(tbl);

    // La première ligne (ou les deux premières) peut être la ligne d'en-têtes
    for (const row of rows.slice(0, 3)) {
      const hasLevel  = row.some((c) => /\blevel\b/i.test(c));
      const hasHp     = row.some((c) => /hitpoints|hit\s*point/i.test(c));
      const hasDamage = row.some((c) => /damage/i.test(c));

      if (hasLevel && hasHp && hasDamage) {
        statTable = tbl;
        headers   = row;
        break;
      }
    }
    if (statTable) break;
  }

  if (!statTable) {
    // Debug : lister les tables trouvées
    const preview = tables.map((t, i) => {
      const r = parseRows(t);
      return `  Table ${i + 1} : ${(r[0] ?? []).slice(0, 5).join(' | ')}`;
    }).join('\n');
    throw new Error(
      `Aucune table de stats (Level + Hitpoints + Damage) trouvée pour "${pageName}".\n` +
      `Tables wikitable disponibles :\n${preview}`
    );
  }

  // Lignes de données : la première cellule est un nombre (= numéro de niveau)
  const allRows = parseRows(statTable);
  const data    = allRows.filter((r) => /^\d+$/.test((r[0] ?? '').trim()));

  if (!data.length) throw new Error(`Aucune ligne de données trouvée pour "${pageName}"`);

  // Associer les colonnes par nom
  function col(pattern) {
    return headers.findIndex((h) => pattern.test(h));
  }

  const iLevel = col(/\blevel\b/i);
  const iHp    = col(/hitpoints|hit\s*point/i);
  const iDps   = col(/damage per second/i);
  const iDpa   = col(/damage per attack/i);
  const iSpd   = col(/movement speed/i);
  const iTh    = col(/town\s*hall/i);

  const levels = data.map((r) => ({
    level: parseInt(r[iLevel]                 ?? '0'),
    hp:    iHp  >= 0 ? parseInt((r[iHp]  ?? '').replace(/[^0-9]/g, '') || '0') : null,
    dps:   iDps >= 0 ? parseInt((r[iDps] ?? '').replace(/[^0-9]/g, '') || '0') : null,
    dpa:   iDpa >= 0 ? parseInt((r[iDpa] ?? '').replace(/[^0-9]/g, '') || '0') : null,
    speed: iSpd >= 0 ? (r[iSpd] ?? null) : null,
    th:    iTh  >= 0 ? parseInt((r[iTh]  ?? '').replace(/[^0-9]/g, '') || '0') : null,
  })).filter((l) => l.level > 0);

  return { name: pageName, headers, levels };
}

// ── Affichage ──────────────────────────────────────────────────────────────

function display(result) {
  const SEP = '═'.repeat(70);
  console.log(`\n${SEP}`);
  console.log(`  ${result.name.toUpperCase()}  (${result.levels.length} niveaux)`);
  console.log(SEP);
  console.log(`  En-têtes : ${result.headers.join(' | ')}\n`);

  const W = { niv: 3, hp: 7, dps: 5, dpa: 6, spd: 7, th: 6 };
  const h = [
    'Niv'.padStart(W.niv),
    'HP'.padStart(W.hp),
    'DPS'.padStart(W.dps),
    'DPA'.padStart(W.dpa),
    'Vitesse'.padStart(W.spd),
    'TH min'.padStart(W.th),
  ];
  console.log('  ' + h.join('  '));
  console.log('  ' + h.map((c) => '─'.repeat(c.length)).join('  '));

  for (const l of result.levels) {
    const row = [
      String(l.level).padStart(W.niv),
      (l.hp    != null ? String(l.hp)    : '—').padStart(W.hp),
      (l.dps   != null ? String(l.dps)   : '—').padStart(W.dps),
      (l.dpa   != null ? String(l.dpa)   : '—').padStart(W.dpa),
      (l.speed != null ? l.speed          : '—').padStart(W.spd),
      (l.th    != null ? String(l.th)     : '—').padStart(W.th),
    ];
    console.log('  ' + row.join('  '));
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

(async () => {
  console.log('RaidSense Wiki Scraper');
  console.log(`URL  : ${WIKI_BASE}<Troupe>`);
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
