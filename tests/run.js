/* ═══════════════════════════════════════════════
   MUNINN — Tests (Node pur, aucune dépendance)
   Lancement : npm test  (ou : node tests/run.js)

   Couvre la logique métier du catalogue, là où des
   bugs sont déjà apparus (tiers, conversion de prix,
   prix variables OpenRouter, déduplication).

   Astuce de chargement : les fichiers front sont des
   scripts navigateur. On les eval en remplaçant la
   déclaration top-level `const X` par `globalThis.X`
   pour récupérer MUNINN_CONFIG / Catalog ; les
   `function` top-level (computeTier, etc.) fuitent
   dans le scope de l'IIFE async ci-dessous.
═══════════════════════════════════════════════ */

const fs   = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ── Mini-framework d'assertions ──────────────────────────────
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error('  ✗ FAIL: ' + name); }
}
function eq(name, actual, expected) {
  check(`${name} (attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)})`, actual === expected);
}

// ── Globals navigateur minimaux ──────────────────────────────
globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] ?? null; },
  setItem(k, v) { this.store[k] = v; },
  removeItem(k) { delete this.store[k]; },
};
globalThis.window = { dispatchEvent() {} };
globalThis.CustomEvent = class { constructor(n, d) { this.type = n; Object.assign(this, d); } };

function loadFront(rel, exposeConst) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(new RegExp('^const ' + exposeConst, 'm'), 'globalThis.' + exposeConst);
  return code;
}

(async () => {
  // config.js → expose MUNINN_CONFIG ; computeTier/parseContextString/getModelById fuitent ici
  eval(loadFront('js/config.js', 'MUNINN_CONFIG'));

  console.log('\n— config.js —');

  // parseContextString
  eq('parseContextString 1M',  parseContextString('1M tokens'),   1000000);
  eq('parseContextString 200K', parseContextString('200K tokens'), 200000);
  eq('parseContextString 32K',  parseContextString('32K tokens'),  32000);
  eq('parseContextString null', parseContextString(null),          null);

  // computeTier
  eq('tier free',     computeTier({ inputPer1M: 0,  outputPer1M: 0 }),  'free');
  eq('tier cheap',    computeTier({ inputPer1M: 0.5, outputPer1M: 0.5 }), 'cheap');
  eq('tier budget',   computeTier({ inputPer1M: 2,  outputPer1M: 4 }),  'budget');   // avg 3
  eq('tier mid',      computeTier({ inputPer1M: 3,  outputPer1M: 15 }), 'mid');      // avg 9
  eq('tier premium',  computeTier({ inputPer1M: 10, outputPer1M: 40 }), 'premium');  // avg 25
  eq('tier flagship', computeTier({ inputPer1M: 15, outputPer1M: 75 }), 'flagship'); // avg 45
  eq('tier image',    computeTier({ perImage: 0.04 }),                  'image');
  eq('tier variable', computeTier({ variable: true }),                  'unknown');
  eq('tier négatif',  computeTier({ inputPer1M: -1, outputPer1M: -1 }), 'unknown');

  // augmentation des entrées hardcodées
  const sample = MUNINN_CONFIG.models[0];
  check('augmentation: tier défini',          !!sample.tier);
  check('augmentation: supportsTools booléen', typeof sample.supportsTools === 'boolean');

  // getModelById
  check('getModelById trouve',   getModelById(sample.id) === sample);
  check('getModelById absent',    getModelById('___inexistant___') === null);

  // catalog.js → expose Catalog ; mapORModel testé via fetch mocké
  eval(loadFront('js/catalog.js', 'Catalog'));

  console.log('— catalog.js (mapping OpenRouter) —');

  const dupId = MUNINN_CONFIG.models[0].id;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ data: [
      { id: 'test/normal', name: 'Lab: Normal', description: 'x', context_length: 128000,
        pricing: { prompt: '0.000003', completion: '0.000015' },
        architecture: { input_modalities: ['text', 'image'] },
        supported_parameters: ['tools', 'temperature'] },
      { id: 'test/auto-router', name: 'Auto Router', context_length: 0,
        pricing: { prompt: '-1', completion: '-1' },
        architecture: { input_modalities: ['text'] }, supported_parameters: [] },
      { id: dupId, name: 'Doublon', pricing: { prompt: '0', completion: '0' } },
    ] }),
  });

  const before = MUNINN_CONFIG.models.length;
  const res = await Catalog.refresh(true);
  check('refresh ok', res.ok === true);
  check('isLive() vrai après succès', Catalog.isLive() === true);

  const normal = getModelById('test/normal');
  check('mapping: modèle ajouté', !!normal);
  eq('mapping: inputPer1M',  normal.pricing.inputPer1M,  3);   // 0.000003 * 1e6
  eq('mapping: outputPer1M', normal.pricing.outputPer1M, 15);  // 0.000015 * 1e6
  eq('mapping: supportsImages', normal.supportsImages, true);
  eq('mapping: supportsTools',  normal.supportsTools,  true);
  eq('mapping: tier calculé',   normal.tier, 'mid');           // avg 9

  const auto = getModelById('test/auto-router');
  check('mapping: prix variable détecté', auto && auto.pricing.variable === true);
  eq('mapping: tier variable → unknown', auto.tier, 'unknown');

  const dups = MUNINN_CONFIG.models.filter(m => m.id === dupId);
  eq('dédup: id hardcodé non dupliqué', dups.length, 1);

  // ── Bilan ──
  console.log(`\n${pass} passés, ${fail} échoués\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH harness:', e); process.exit(1); });
