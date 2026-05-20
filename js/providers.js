/* ═══════════════════════════════════════════════
   MUNINN — Registre central des providers
   Architecture inspirée de Gungnir : un objet par
   provider exposant test/format/lien direct console.
═══════════════════════════════════════════════ */

const Providers = (() => {

  // Statuts d'une clé après test :
  //   unset         — pas de clé saisie
  //   format-error  — la regex de format ne matche pas (avant tout appel réseau)
  //   testing       — test en cours
  //   valid         — l'API a répondu OK (200) au probe /models
  //   invalid       — l'API a répondu 401/403 (clé refusée)
  //   network-error — fetch a échoué (CORS, DNS, offline)
  //   unknown       — test impossible (ex: CORS bloque /models, mais la clé peut marcher quand même)
  const STATUS = Object.freeze({
    unset:        'unset',
    formatError:  'format-error',
    testing:      'testing',
    valid:        'valid',
    invalid:      'invalid',
    networkError: 'network-error',
    unknown:      'unknown',
  });

  // ── Registre des 7 providers natifs ──────────────────────────
  // Chaque entrée :
  //   id           — clé interne (alignée sur provider dans config.js)
  //   name         — libellé UI
  //   storageKey   — clé localStorage utilisée par Storage.getSettings()
  //   keyFormat    — regex de pré-validation (avant appel réseau)
  //   placeholder  — affichage du format attendu dans l'input
  //   getKeyUrl    — page console du provider pour créer une clé
  //   test(key, signal) → Promise<{ status, message?, models? }>
  //                  responsable de l'appel réseau de validation
  const REGISTRY = {

    gemini: {
      id:          'gemini',
      name:        'Google Gemini',
      storageKey:  'geminiKey',
      keyFormat:   /^AIza[0-9A-Za-z_-]{30,}$/,
      placeholder: 'AIza…',
      getKeyUrl:   'https://aistudio.google.com/apikey',
      async test(key, signal) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=1`;
        return await probeGet(url, {}, signal, json => {
          const list = json?.models || [];
          return { models: list.map(m => m.name).slice(0, 5) };
        });
      },
    },

    anthropic: {
      id:          'anthropic',
      name:        'Anthropic Claude',
      storageKey:  'anthropicKey',
      keyFormat:   /^sk-ant-[A-Za-z0-9_-]{20,}$/,
      placeholder: 'sk-ant-…',
      getKeyUrl:   'https://console.anthropic.com/settings/keys',
      async test(key, signal) {
        // Anthropic exige le header anthropic-dangerous-direct-browser-access
        // pour les appels CORS depuis un navigateur (cf. streamAnthropic).
        return await probeGet('https://api.anthropic.com/v1/models?limit=1', {
          'x-api-key':                                 key,
          'anthropic-version':                         '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        }, signal, json => ({ models: (json?.data || []).map(m => m.id).slice(0, 5) }));
      },
    },

    perplexity: {
      id:          'perplexity',
      name:        'Perplexity',
      storageKey:  'perplexityKey',
      keyFormat:   /^pplx-[A-Za-z0-9]{20,}$/,
      placeholder: 'pplx-…',
      getKeyUrl:   'https://www.perplexity.ai/settings/api',
      async test(key, signal) {
        // Perplexity n'expose pas /models — on probe via un appel chat
        // minimaliste (1 token max sur sonar, modèle le moins cher).
        return await probePost('https://api.perplexity.ai/chat/completions', {
          'Authorization': 'Bearer ' + key,
          'Content-Type':  'application/json',
        }, JSON.stringify({
          model: 'sonar',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
          stream: false,
        }), signal);
      },
    },

    deepseek: {
      id:          'deepseek',
      name:        'DeepSeek',
      storageKey:  'deepseekKey',
      keyFormat:   /^sk-[A-Za-z0-9]{20,}$/,
      placeholder: 'sk-…',
      getKeyUrl:   'https://platform.deepseek.com/api_keys',
      async test(key, signal) {
        return await probeGet('https://api.deepseek.com/models', {
          'Authorization': 'Bearer ' + key,
        }, signal, json => ({ models: (json?.data || []).map(m => m.id).slice(0, 5) }));
      },
    },

    qwen: {
      id:          'qwen',
      name:        'Qwen (Alibaba)',
      storageKey:  'qwenKey',
      keyFormat:   /^sk-[A-Za-z0-9-]{20,}$/,
      placeholder: 'sk-…',
      getKeyUrl:   'https://bailian.console.aliyun.com/?apiKey=1',
      async test(key, signal) {
        return await probeGet('https://dashscope.aliyuncs.com/compatible-mode/v1/models', {
          'Authorization': 'Bearer ' + key,
        }, signal, json => ({ models: (json?.data || []).map(m => m.id).slice(0, 5) }));
      },
    },

    mistral: {
      id:          'mistral',
      name:        'Mistral AI',
      storageKey:  'mistralKey',
      keyFormat:   /^[A-Za-z0-9]{20,}$/,
      placeholder: 'votre-clé-Mistral',
      getKeyUrl:   'https://console.mistral.ai/api-keys/',
      async test(key, signal) {
        return await probeGet('https://api.mistral.ai/v1/models', {
          'Authorization': 'Bearer ' + key,
        }, signal, json => ({ models: (json?.data || []).map(m => m.id).slice(0, 5) }));
      },
    },

    openrouter: {
      id:          'openrouter',
      name:        'OpenRouter',
      storageKey:  'openrouterKey',
      keyFormat:   /^sk-or-[A-Za-z0-9-]{20,}$/,
      placeholder: 'sk-or-…',
      getKeyUrl:   'https://openrouter.ai/keys',
      async test(key, signal) {
        // Endpoint dédié qui renvoie l'état de la clé sans consommer de crédit
        return await probeGet('https://openrouter.ai/api/v1/auth/key', {
          'Authorization': 'Bearer ' + key,
        }, signal, json => ({ models: [], info: json?.data || null }));
      },
    },

  };

  // ── Helpers réseau ───────────────────────────────────────────

  // Mappe un statut HTTP / une erreur réseau vers un STATUS Provider.
  function statusFromResponse(resp) {
    if (resp.ok) return STATUS.valid;
    if (resp.status === 401 || resp.status === 403) return STATUS.invalid;
    // 429, 5xx, etc. = la clé est probablement bonne mais on n'a pas pu vérifier
    return STATUS.unknown;
  }

  async function probeGet(url, headers, signal, parseOk) {
    try {
      const resp = await fetch(url, { method: 'GET', headers, signal });
      const status = statusFromResponse(resp);
      if (status === STATUS.valid && parseOk) {
        try {
          const json = await resp.json();
          return { status, ...parseOk(json) };
        } catch { return { status }; }
      }
      // Tente de récupérer le message d'erreur
      let message;
      try {
        const json = await resp.json();
        message = json?.error?.message || json?.message || `HTTP ${resp.status}`;
      } catch { message = `HTTP ${resp.status}`; }
      return { status, message };
    } catch (e) {
      if (e.name === 'AbortError') return { status: STATUS.testing };
      // CORS / DNS / offline — on ne peut pas affirmer que la clé est invalide
      return { status: STATUS.networkError, message: e.message };
    }
  }

  async function probePost(url, headers, body, signal) {
    try {
      const resp = await fetch(url, { method: 'POST', headers, body, signal });
      const status = statusFromResponse(resp);
      let message;
      if (!resp.ok) {
        try {
          const json = await resp.json();
          message = json?.error?.message || json?.message || `HTTP ${resp.status}`;
        } catch { message = `HTTP ${resp.status}`; }
      }
      return { status, message };
    } catch (e) {
      if (e.name === 'AbortError') return { status: STATUS.testing };
      return { status: STATUS.networkError, message: e.message };
    }
  }

  // ── API publique ─────────────────────────────────────────────

  function get(id) {
    return REGISTRY[id] || null;
  }

  function list() {
    return Object.values(REGISTRY);
  }

  // Lit la clé stockée d'un provider (via Storage)
  function getKey(id) {
    const p = get(id);
    if (!p) return '';
    const settings = (typeof Storage !== 'undefined' && Storage.getSettings) ? Storage.getSettings() : {};
    return settings[p.storageKey] || '';
  }

  // Vérifie d'abord le format, puis lance le test réseau si OK
  async function validate(id, key, signal) {
    const p = get(id);
    if (!p)         return { status: STATUS.unset, message: 'Provider inconnu' };
    if (!key)       return { status: STATUS.unset };
    if (p.keyFormat && !p.keyFormat.test(key)) {
      return { status: STATUS.formatError, message: 'Format de clé inattendu' };
    }
    return await p.test(key, signal);
  }

  return { STATUS, get, list, getKey, validate };
})();
