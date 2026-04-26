#!/usr/bin/env node
'use strict';
/**
 * scripts/scrape-wiki.js
 *
 * Scrape le Clash of Clans Fandom Wiki pour extraire les stats de troupes.
 * Utilise uniquement les modules built-in Node.js (https, buffer).
 *
 * Usage :
 *   node scripts/scrape-wiki.js
 */

const https = require('https');

// ── Config ─────────────────────────────────────────────────────────────────

const TROOPS_TO_SCRAPE = ['Barbarian', 'Giant'];

const API_BASE =
  'https://clashofclans.fandom.com/api.php' +
  '?action=parse&prop=text&format=json&page=';

const HEADERS = {
  'User-Agent': 'RaidSense-Scraper/1.0 (https://github.com/RaidSense/raidsense)',
  'Accept':     'application/json',
};

// ── HTTP ───────────────────────────────────────────────────────────────────

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: HEADERS }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    }).on('error', reject);
  });
}

// ── HTML utilities ─────────────────────────────────────────────────────────

const ENTITIES = {
  '&amp;':   '&',
  '&lt;':    '<',
  '&gt;':    '>',
  '&nbsp;':  ' ',
  '&#160;':  ' ',
  '&ndash;': '–',
  '&mdash;': '—',
};

function stripTags(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrait tous les blocs <table>…</table> du HTML, y compris les imbriqués,
 * en suivant la profondeur pour ne pas confondre les balises ouvrantes/fermantes.
 */
function extractAllTables(html) {
  const tables = [];
  const lower  = html.toLowerCase();
  let i = 0;

  while (i < lower.length) {
    const start = lower.indexOf('<table', i);
    if (start === -1) break;

    let depth = 1;
    let j = start + 6;

    while (j < lower.length && depth > 0) {
      if (lower.startsWith('<table', j))        { depth++; j += 6; }
      else if (lower.startsWith('</table>', j)) { depth--; j += 8; }
      else                                       { j++; }
    }

    tables.push(html.slice(start, j));
    i = start + 1; // +1 pour trouver aussi les tables imbriquées
  }

  return tables;
}

/**
 * Parse les lignes d'une table HTML en tableau de chaînes.
 * Supprime les tables imbriquées avant de chercher les <tr>.
 * Gère l'attribut colspan.
 */
function parseTableRows(tableHtml) {
  // Supprimer les tables imbriquées (une passe suffit pour CoC wiki)
  const flat = tableHtml.replace(/<table[\s\S]*?<\/table>/gi, '');
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;

  while ((trMatch = trRe.exec(flat)) !== null) {
    const cells = [];
    const tdRe  = /<t([dh])([^>]*)>([\s\S]*?)<\/t\1>/gi;
    let tdMatch;

    while ((tdMatch = tdRe.exec(trMatch[1])) !== null) {
      const attrs   = tdMatch[2];
      const text    = stripTags(tdMatch[3]);
      const colspan = parseInt((attrs.match(/colspan=["']?(\d+)/i) ?? [])[1] ?? '1');
      for (let s = 0; s < colspan; s++) cells.push(text);
    }

    if (cells.length) rows.push(cells);
  }

  return rows;
}

// ── Scraper ────────────────────────────────────────────────────────────────

/**
 * Scrape une page de troupe et retourne ses stats niveau par niveau.
 * @param {string} pageName  Nom exact de la page wiki (ex. "Barbarian")
 * @returns {{ name, headers, levels }}
 */
async function scrapeTroop(pageName) {
  const url  = API_BASE + encodeURIComponent(pageName);
  const raw  = await get(url);
  const json = JSON.parse(raw);
  const html = json?.parse?.text?.['*'] ?? '';

  if (!html) throw new Error(`Réponse vide pour "${pageName}"`);

  // Trouver la table de stats : doit contenir "Hitpoints" ET "Damage per Second"
  const tables     = extractAllTables(html);
  const candidates = tables.filter((t) => {
    const u = t.toLowerCase();
    return (
      (u.includes('hitpoints') || u.includes('hit points')) &&
       u.includes('damage per second')
    );
  });

  if (!candidates.length) {
    throw new Error(`Aucune table de stats trouvée pour "${pageName}"`);
  }

  // Prendre la table la plus petite (la plus spécifique / la plus imbriquée)
  candidates.sort((a, b) => a.length - b.length);
  const rows = parseTableRows(candidates[0]);

  // Identifier la ligne d'en-têtes et les lignes de données
  let headers = [];
  const data  = [];

  for (const row of rows) {
    if (!headers.length && row.some((c) => /^level$/i.test(c))) {
      headers = row;
    } else if (headers.length && /^\d+$/.test((row[0] ?? '').trim())) {
      data.push(row);
    }
  }

  if (!headers.length) throw new Error(`En-têtes introuvables pour "${pageName}"`);
  if (!data.length)    throw new Error(`Aucune ligne de données pour "${pageName}"`);

  // Mapper les colonnes d'intérêt
  function col(pattern) {
    return headers.findIndex((h) => pattern.test(h));
  }

  const iLevel = col(/^level$/i);
  const iHp    = col(/hitpoints|hit\s+points/i);
  const iDps   = col(/damage per second/i);
  const iSpd   = col(/movement speed/i);
  const iTh    = col(/town\s+hall/i);

  const levels = data
    .map((r) => ({
      level: parseInt(r[iLevel] ?? '0'),
      hp:    iHp  >= 0 ? parseInt((r[iHp]  ?? '0').replace(/[^0-9]/g, '')) : null,
      dps:   iDps >= 0 ? parseInt((r[iDps] ?? '0').replace(/[^0-9]/g, '')) : null,
      speed: iSpd >= 0 ? (r[iSpd] ?? null) : null,
      th:    iTh  >= 0 ? parseInt((r[iTh]  ?? '0').replace(/[^0-9]/g, '')) : null,
    }))
    .filter((l) => l.level > 0);

  return { name: pageName, headers, levels };
}

// ── Affichage ──────────────────────────────────────────────────────────────

function display(result) {
  const SEP = '═'.repeat(66);
  console.log(`\n${SEP}`);
  console.log(`  ${result.name.toUpperCase()}`);
  console.log(SEP);
  console.log(`  Colonnes détectées :\n  ${result.headers.join(' | ')}\n`);
  console.log('  Niv    HP       DPS    Vitesse    TH min');
  console.log('  ───    ──────   ────   ───────    ──────');

  for (const l of result.levels) {
    const niv   = String(l.level).padStart(3);
    const hp    = (l.hp    != null ? String(l.hp)    : '—').padStart(6);
    const dps   = (l.dps   != null ? String(l.dps)   : '—').padStart(4);
    const speed = (l.speed != null ? l.speed          : '—').padStart(7);
    const th    = (l.th    != null ? String(l.th)     : '—').padStart(6);
    console.log(`  ${niv}   ${hp}   ${dps}   ${speed}    ${th}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

(async () => {
  console.log('RaidSense Wiki Scraper');
  console.log(`Troupes : ${TROOPS_TO_SCRAPE.join(', ')}`);

  for (const name of TROOPS_TO_SCRAPE) {
    try {
      const result = await scrapeTroop(name);
      display(result);
    } catch (err) {
      console.error(`\n[ERREUR] ${name} : ${err.message}`);
    }
  }

  console.log('\nTerminé.\n');
})();
