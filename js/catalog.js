/* ═══════════════════════════════════════════════
   MUNINN — Catalogue dynamique (OpenRouter live)

   Approche calquée sur Gungnir/plugin model_guide :
   GET https://openrouter.ai/api/v1/models est public
   (pas de clé requise) et renvoie ~300 modèles avec
   pricing, context_length, modalities, supported_parameters.
   On le merge dans MUNINN_CONFIG.models pour étendre le
   catalogue hardcodé sans casser getModelById().
═══════════════════════════════════════════════ */

const Catalog = (() => {

  const CACHE_KEY      = 'munnin_catalog_or_cache';
  const CACHE_TTL_MS   = 5 * 60 * 1000;          // 5 minutes
  const REFRESH_PERIOD = 15 * 60 * 1000;         // refresh périodique en arrière-plan
  const ENDPOINT       = 'https://openrouter.ai/api/v1/models';
  const EVENT_NAME     = 'catalog:updated';

  let inflight = null;        // promesse de fetch en cours, pour dédup
  let liveModels = [];        // dernier snapshot live mappé (sert au merge)
  let lastOk = null;          // null = pas encore tenté, true/false = état du dernier fetch

  // ── Mapping OpenRouter → format Muninn ──────────────────────

  // Construit un nom lisible "Vendor: Model Name" → "Model Name (Vendor)"
  function prettyName(rawName, id) {
    if (rawName && rawName.includes(':')) {
      const [vendor, ...rest] = rawName.split(':');
      return rest.join(':').trim() + ' (' + vendor.trim() + ')';
    }
    return rawName || id;
  }

  function mapORModel(raw) {
    const pricing  = raw.pricing  || {};
    const archi    = raw.architecture || {};
    // Prix OpenRouter = $/token en string. Les routeurs auto (auto, *-router)
    // renvoient un prix négatif (-1) = tarif variable déterminé à l'exécution.
    const promptRaw = parseFloat(pricing.prompt);
    const compRaw   = parseFloat(pricing.completion);
    const variable  = (promptRaw < 0) || (compRaw < 0) || Number.isNaN(promptRaw) && Number.isNaN(compRaw) && pricing.prompt === undefined;
    const inputPer1M  = variable ? null : (promptRaw || 0) * 1e6;
    const outputPer1M = variable ? null : (compRaw   || 0) * 1e6;
    const inputModalities = Array.isArray(archi.input_modalities) ? archi.input_modalities : [];
    const supportedParams = Array.isArray(raw.supported_parameters) ? raw.supported_parameters : [];
    const contextTokens = raw.context_length || raw.top_provider?.context_length || null;

    const pricingObj = variable ? { variable: true } : { inputPer1M, outputPer1M };
    const model = {
      id:             raw.id,
      name:           prettyName(raw.name, raw.id),
      description:    (raw.description || '').slice(0, 280),
      provider:       'openrouter',
      supportsImages: inputModalities.includes('image'),
      supportsFiles:  inputModalities.includes('file'),
      supportsTools:  supportedParams.includes('tools') || supportedParams.includes('tool_choice'),
      contextTokens,
      contextWindow:  formatContextWindow(contextTokens),
      pricing:        pricingObj,
      tier:           variable
                        ? 'unknown'
                        : (typeof computeTier === 'function' ? computeTier(pricingObj) : 'unknown'),
      live:           true,  // marqueur pour distinguer hardcoded vs live
    };
    return model;
  }

  function formatContextWindow(tokens) {
    if (!tokens) return null;
    if (tokens >= 1e6) return (tokens / 1e6).toFixed(tokens % 1e6 === 0 ? 0 : 1) + 'M tokens';
    if (tokens >= 1e3) return Math.round(tokens / 1e3) + 'K tokens';
    return tokens + ' tokens';
  }

  // ── Cache localStorage ───────────────────────────────────────

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed.timestamp || !Array.isArray(parsed.models)) return null;
      if (Date.now() - parsed.timestamp > CACHE_TTL_MS) return null;
      return parsed.models;
    } catch { return null; }
  }

  function writeCache(models) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        models,
      }));
    } catch (e) {
      // localStorage plein ou désactivé — pas grave, on garde le snapshot en mémoire
      console.warn('[Catalog] cache write failed:', e.message);
    }
  }

  // ── Fetch live ───────────────────────────────────────────────

  async function fetchLive(force = false) {
    if (!force) {
      const cached = readCache();
      if (cached) return cached;
    }
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const resp = await fetch(ENDPOINT, { method: 'GET' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const json = await resp.json();
        const raw  = Array.isArray(json?.data) ? json.data : [];
        const mapped = raw.map(mapORModel).filter(m => m.id);
        writeCache(mapped);
        return mapped;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  // ── Merge dans MUNINN_CONFIG.models ──────────────────────────

  // Dédoublonne par id : un modèle hardcodé bat le même id live.
  // Stratégie : on ne touche jamais aux modèles hardcodés (premier
  // chargement, non-OR). On ajoute uniquement les modèles live dont
  // l'id n'existe pas déjà.
  function mergeIntoConfig(mapped) {
    const existingIds = new Set(MUNINN_CONFIG.models.map(m => m.id));
    const toAdd = mapped.filter(m => !existingIds.has(m.id));
    if (toAdd.length === 0) return 0;
    MUNINN_CONFIG.models.push(...toAdd);
    return toAdd.length;
  }

  // Retire les modèles précédemment ajoutés par le live (utile au refresh
  // forcé pour ne pas accumuler les obsolètes).
  function removeLiveModels() {
    const before = MUNINN_CONFIG.models.length;
    MUNINN_CONFIG.models = MUNINN_CONFIG.models.filter(m => !m.live);
    return before - MUNINN_CONFIG.models.length;
  }

  // ── API publique ─────────────────────────────────────────────

  async function refresh(force = false) {
    try {
      const mapped = await fetchLive(force);
      liveModels = mapped;
      lastOk = true;
      if (force) removeLiveModels();
      const added = mergeIntoConfig(mapped);
      window.dispatchEvent(new CustomEvent(EVENT_NAME, {
        detail: { ok: true, added, total: MUNINN_CONFIG.models.length, source: 'openrouter' },
      }));
      return { ok: true, added, total: MUNINN_CONFIG.models.length };
    } catch (e) {
      lastOk = false;
      console.warn('[Catalog] live fetch failed, using hardcoded only:', e.message);
      // Émet quand même l'event pour que l'UI puisse refléter l'échec
      window.dispatchEvent(new CustomEvent(EVENT_NAME, {
        detail: { ok: false, added: 0, total: MUNINN_CONFIG.models.length, error: e.message },
      }));
      return { ok: false, error: e.message };
    }
  }

  // true si le dernier fetch a réussi, false si échec, null si pas encore tenté
  function isLive() { return lastOk; }

  // À appeler une fois au boot. Lance le refresh sans bloquer.
  function init() {
    refresh(false);
    // Refresh périodique en arrière-plan, sans bruit si ça échoue
    setInterval(() => refresh(false), REFRESH_PERIOD);
  }

  // État pour debug / UI
  function status() {
    const cached = readCache();
    return {
      liveCount:        liveModels.length,
      cachedCount:      cached ? cached.length : 0,
      cacheAgeMs:       cached ? (Date.now() - (JSON.parse(localStorage.getItem(CACHE_KEY))?.timestamp || 0)) : null,
      totalInRegistry:  MUNINN_CONFIG.models.length,
      hardcoded:        MUNINN_CONFIG.models.filter(m => !m.live).length,
      fromLive:         MUNINN_CONFIG.models.filter(m =>  m.live).length,
    };
  }

  return { init, refresh, status, isLive, EVENT_NAME };
})();
