/* ═══════════════════════════════════════════════
   MUNINN — Couche API (multi-providers)
   Streaming SSE natif, sans serveur
═══════════════════════════════════════════════ */

const API = (() => {

  // ── Injection de contexte temporel ───────────
  function buildSystemPrompt(userPrompt, userMemory) {
    const now     = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const dateLine = `Date et heure actuelles : ${dateStr} à ${timeStr}.`;
    let result = dateLine;
    if (userMemory && userMemory.trim()) {
      result += `\n\n## Mémoire utilisateur\n${userMemory.trim()}`;
    }
    if (userPrompt && userPrompt.trim()) {
      result += `\n\n${userPrompt.trim()}`;
    }
    return result;
  }

  // ── Extraction des blocs <think> du texte accumulé ──
  function splitThinking(text) {
    let thinking = '';
    let clean    = text;
    // Extraire les blocs complets
    clean = clean.replace(/<think>([\s\S]*?)<\/think>/g, (_, t) => { thinking += t; return ''; });
    // Bloc ouvert sans fermeture (en cours de stream)
    const openIdx = clean.lastIndexOf('<think>');
    if (openIdx !== -1) {
      thinking += clean.slice(openIdx + 7);
      clean     = clean.slice(0, openIdx);
    }
    return { thinking: thinking.trim(), clean: clean.trim() };
  }

  // ── Gestion dépassement contexte (auto-troncation) ──

  // Garde uniquement les `keepFraction` derniers messages (hors system)
  function trimContextMessages(messages, keepFraction) {
    const system    = messages.filter(m => m.role === 'system');
    const nonSystem = messages.filter(m => m.role !== 'system');
    const keepCount = Math.max(2, Math.ceil(nonSystem.length * keepFraction));
    return [...system, ...nonSystem.slice(nonSystem.length - keepCount)];
  }

  // Détecte une erreur de dépassement de tokens (tous providers)
  function isTokenLimitError(errText) {
    return /token.*exceed|exceed.*token|maximum.*token|token.*maximum|too.{0,10}long|prompt.*long|context.*length/i.test(errText);
  }

  // Retry sur rate-limit 429 avec backoff exponentiel (max 3 tentatives)
  async function wait429(attempt) {
    const ms = Math.min(2000 * Math.pow(2, attempt), 16000); // 2s, 4s, 8s, max 16s
    await new Promise(r => setTimeout(r, ms));
  }
  // Mappe (status, errText) → message utilisateur typé, calqué sur Gungnir.
  // Distingue : clé invalide (401/403), crédits épuisés (402),
  // modèle introuvable (404), serveur indisponible (5xx).
  function formatProviderError(providerName, status, errText) {
    const txt = String(errText || '').trim();
    if (status === 401 || status === 403 || /unauthor|invalid.*api.*key|invalid.*token|authentication/i.test(txt)) {
      return `${providerName} : clé API invalide ou expirée — vérifiez-la dans le modal "Clés API".`;
    }
    if (status === 402 || /payment|insufficient|credit|quota.*exceeded.*pay/i.test(txt)) {
      return `${providerName} : crédits épuisés ou paiement requis sur votre compte.`;
    }
    if (status === 404 || /model.*not.*found|no.*such.*model|unknown.*model/i.test(txt)) {
      return `${providerName} : modèle introuvable (peut-être renommé ou retiré).`;
    }
    if (status >= 500 && status < 600) {
      return `${providerName} : serveur temporairement indisponible (HTTP ${status}). Réessayez dans quelques instants.`;
    }
    return `${providerName} erreur ${status}: ${txt || '(pas de détail)'}`;
  }

  function isRateLimitError(status, errText) {
    return status === 429 || /rate.limit|too many request|quota.*exceed|resource.*exhaust/i.test(errText);
  }

  // ── Helpers SSE ───────────────────────────────

  async function readSSEStream(response, onChunk, signal) {
    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    try {
      while (true) {
        if (signal && signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === ':' ) continue;
          if (trimmed.startsWith('data:')) {
            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') return;
            try {
              const parsed = JSON.parse(data);
              onChunk(parsed);
            } catch { /* ignore malformed JSON */ }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ── Formattage des messages pour Gemini ───────
  function toGeminiMessages(messages) {
    return messages
      .filter(m => m.role !== 'system')
      .map(m => {
        const parts = [];

        // Attachments (images)
        if (m.attachments && m.attachments.length > 0) {
          for (const att of m.attachments) {
            if (att.type === 'image') {
              const mimeType = att.mimeType || 'image/jpeg';
              const b64      = att.data.includes(',') ? att.data.split(',')[1] : att.data;
              parts.push({ inline_data: { mime_type: mimeType, data: b64 } });
            } else if (att.type === 'pdf') {
              // PDF natif Gemini — envoyé en base64 inline_data
              const b64 = att.data.includes(',') ? att.data.split(',')[1] : att.data;
              parts.push({ inline_data: { mime_type: 'application/pdf', data: b64 } });
            } else if (att.type === 'text') {
              parts.push({ text: `[Fichier: ${att.name}]\n${att.data}` });
            }
          }
        }

        parts.push({ text: m.content || '' });

        return {
          role:  m.role === 'assistant' ? 'model' : 'user',
          parts,
        };
      });
  }

  // ── Formattage des messages pour Anthropic ─────
  function toAnthropicMessages(messages) {
    return messages
      .filter(m => m.role !== 'system')
      .map(m => {
        if (m.role === 'assistant') {
          return { role: 'assistant', content: m.content || '' };
        }

        // User message (possibly multimodal)
        const content = [];

        if (m.attachments && m.attachments.length > 0) {
          for (const att of m.attachments) {
            if (att.type === 'image') {
              const mimeType = att.mimeType || 'image/jpeg';
              const b64      = att.data.includes(',') ? att.data.split(',')[1] : att.data;
              content.push({
                type: 'image',
                source: { type: 'base64', media_type: mimeType, data: b64 },
              });
            } else if (att.type === 'pdf') {
              // PDF natif Anthropic — type document
              const b64 = att.data.includes(',') ? att.data.split(',')[1] : att.data;
              content.push({
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: b64 },
              });
            } else if (att.type === 'text') {
              content.push({ type: 'text', text: `[Fichier: ${att.name}]\n${att.data}` });
            }
          }
        }

        content.push({ type: 'text', text: m.content || '' });

        return { role: 'user', content };
      });
  }

  // ── Gemini streaming ──────────────────────────
  async function streamGemini({ modelId, messages, settings, onChunk, onDone, onError, onThinking, signal }) {
    const apiKey = Storage.getSettings().geminiKey;
    if (!apiKey) { onError('Clé API Gemini manquante. Ajoutez-la dans la barre latérale ou les Paramètres.'); return; }

    const url           = `${MUNINN_CONFIG.endpoints.gemini}/${modelId}:streamGenerateContent?key=${apiKey}&alt=sse`;
    const systemPrompt  = buildSystemPrompt(settings.systemPrompt || '', settings.userMemory || '');

    let workingMessages = messages;
    let trimCount       = 0;
    let rateRetry       = 0;
    const MAX_TRIM      = 3;
    let response;

    while (true) {
      const contents = toGeminiMessages(workingMessages);
      const body     = {
        contents,
        generationConfig: {
          temperature:     settings.temperature ?? 0.7,
          maxOutputTokens: settings.maxTokens   ?? 4096,
        },
      };
      if (systemPrompt) body.system_instruction = { parts: [{ text: systemPrompt }] };
      if (settings.webSearch) body.tools = [{ google_search: {} }];

      try {
        response = await fetch(url, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
          signal,
        });
      } catch (e) {
        if (e.name === 'AbortError') return;
        onError('Erreur réseau Gemini : ' + e.message);
        return;
      }

      if (!response.ok) {
        let errText = '';
        try { const j = await response.json(); errText = j?.error?.message || ''; } catch {}
        // Retry automatique avec contexte réduit si dépassement de tokens
        if (isRateLimitError(response.status, errText) && rateRetry < 3) {
          rateRetry++;
          await wait429(rateRetry - 1);
          continue;
        }
        if (isTokenLimitError(errText) && trimCount < MAX_TRIM) {
          trimCount++;
          workingMessages = trimContextMessages(messages, Math.pow(0.5, trimCount));
          continue;
        }
        onError(formatProviderError('Gemini', response.status, errText));
        return;
      }
      break; // Réponse OK — on passe au lecteur SSE
    }

    let fullText    = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let citations   = [];

    await readSSEStream(response, (parsed) => {
      const parts = parsed?.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.thought && part.text) {
          // Bloc de raisonnement Gemini (thinkingConfig)
          if (onThinking) onThinking(part.text);
        } else if (part.text) {
          fullText += part.text;
          onChunk(part.text, fullText);
        }
      }
      // Capture token counts from usageMetadata (present in final chunks)
      if (parsed?.usageMetadata) {
        inputTokens  = parsed.usageMetadata.promptTokenCount     || inputTokens;
        outputTokens = parsed.usageMetadata.candidatesTokenCount || outputTokens;
      }
      // Citations Google Search grounding
      const grounding = parsed?.candidates?.[0]?.groundingMetadata;
      if (grounding?.groundingChunks) {
        for (const chunk of grounding.groundingChunks) {
          if (chunk.web?.uri && !citations.some(c => c.url === chunk.web.uri)) {
            citations.push({ url: chunk.web.uri, title: chunk.web.title || '' });
          }
        }
      }
    }, signal);

    onDone(fullText, { inputTokens, outputTokens, citations: citations.length ? citations : null });
  }

  // ── Anthropic streaming ───────────────────────
  async function streamAnthropic({ modelId, messages, settings, onChunk, onDone, onError, signal }) {
    const apiKey = Storage.getSettings().anthropicKey;
    if (!apiKey) { onError('Clé API Anthropic manquante. Ajoutez-la dans la barre latérale ou les Paramètres.'); return; }

    const systemPrompt = buildSystemPrompt(settings.systemPrompt || '', settings.userMemory || '');

    // Recherche web native Anthropic
    const headers = {
      'x-api-key':                               apiKey,
      'anthropic-version':                       '2023-06-01',
      'content-type':                            'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    if (settings.webSearch) {
      headers['anthropic-beta'] = 'web-search-2025-03-05';
    }

    let workingMessages = messages;
    let trimCount       = 0;
    let rateRetry       = 0;
    const MAX_TRIM      = 3;
    let response;

    while (true) {
      const body = {
        model:      modelId,
        max_tokens: settings.maxTokens ?? 4096,
        stream:     true,
        messages:   toAnthropicMessages(workingMessages),
        system:     systemPrompt,
      };
      if (settings.temperature !== undefined) body.temperature = settings.temperature;
      if (settings.webSearch) body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];

      try {
        response = await fetch(MUNINN_CONFIG.endpoints.anthropic, {
          method:  'POST',
          headers,
          body:    JSON.stringify(body),
          signal,
        });
      } catch (e) {
        if (e.name === 'AbortError') return;
        onError('Erreur réseau Anthropic : ' + e.message);
        return;
      }

      if (!response.ok) {
        let errText = '';
        try { const j = await response.json(); errText = j?.error?.message || ''; } catch {}
        if (isRateLimitError(response.status, errText) && rateRetry < 3) {
          rateRetry++;
          await wait429(rateRetry - 1);
          continue;
        }
        if (isTokenLimitError(errText) && trimCount < MAX_TRIM) {
          trimCount++;
          workingMessages = trimContextMessages(messages, Math.pow(0.5, trimCount));
          continue;
        }
        onError(formatProviderError('Anthropic', response.status, errText));
        return;
      }
      break; // Réponse OK — on passe au lecteur SSE
    }

    let fullText     = '';
    let inputTokens  = 0;
    let outputTokens = 0;
    let citations    = [];
    let currentBlockType = null;

    await readSSEStream(response, (parsed) => {
      // Capture input tokens from message_start
      if (parsed.type === 'message_start' && parsed.message?.usage) {
        inputTokens = parsed.message.usage.input_tokens || 0;
      }
      // Capture output tokens from message_delta
      if (parsed.type === 'message_delta' && parsed.usage) {
        outputTokens = parsed.usage.output_tokens || 0;
      }
      // Début d'un bloc — détecter les résultats de recherche web
      if (parsed.type === 'content_block_start') {
        currentBlockType = parsed.content_block?.type || null;
        if (currentBlockType === 'web_search_tool_result') {
          const results = parsed.content_block.content || [];
          for (const r of results) {
            if (r.type === 'web_search_result' && r.url) {
              citations.push({ url: r.url, title: r.title || '' });
            }
          }
        }
      }
      if (parsed.type === 'content_block_stop') {
        currentBlockType = null;
      }
      // Stream text chunks (uniquement les blocs texte, pas les blocs tool)
      if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
        const text = parsed.delta.text || '';
        fullText += text;
        onChunk(text, fullText);
      }
    }, signal);

    onDone(fullText, { inputTokens, outputTokens, citations: citations.length ? citations : null });
  }

  // ── Formattage des messages pour Perplexity (OpenAI-style, texte uniquement) ─
  function toPerplexityMessages(messages, systemPrompt) {
    const result = [];
    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt });
    }
    for (const m of messages) {
      if (m.role === 'system') continue;
      result.push({
        role:    m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content || '',
      });
    }
    return result;
  }

  // ── Formattage des messages pour OpenRouter (multimodal OpenAI-compatible) ─
  // Utilisé pour les modèles OpenRouter avec supportsImages: true (ex: MiMo Omni)
  function toOpenRouterMessages(messages, systemPrompt) {
    const result = [];
    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt });
    }
    for (const m of messages) {
      if (m.role === 'system') continue;
      const role = m.role === 'assistant' ? 'assistant' : 'user';

      // Messages assistant → toujours texte simple
      if (role === 'assistant' || !m.attachments || m.attachments.length === 0) {
        result.push({ role, content: m.content || '' });
        continue;
      }

      // Messages utilisateur avec pièces jointes → format multimodal
      const content = [];
      for (const att of m.attachments) {
        if (att.type === 'image') {
          const mimeType = att.mimeType || 'image/jpeg';
          const dataUrl  = att.data.startsWith('data:')
            ? att.data
            : `data:${mimeType};base64,${att.data}`;
          content.push({ type: 'image_url', image_url: { url: dataUrl } });
        } else if (att.type === 'text') {
          content.push({ type: 'text', text: `[Fichier: ${att.name}]\n${att.data}` });
        }
        // PDF non supporté en multimodal OpenAI-style — ignoré silencieusement
      }
      content.push({ type: 'text', text: m.content || '' });
      result.push({ role, content });
    }
    return result;
  }

  // ── Perplexity streaming ──────────────────────
  async function streamPerplexity({ modelId, messages, settings, onChunk, onDone, onError, onThinking, signal }) {
    const apiKey = Storage.getSettings().perplexityKey;
    if (!apiKey) { onError('Clé API Perplexity manquante. Ajoutez-la dans la barre latérale ou les Paramètres.'); return; }

    const systemPrompt  = buildSystemPrompt(settings.systemPrompt || '', settings.userMemory || '');
    let workingMessages = messages;
    let trimCount       = 0;
    let rateRetry       = 0;
    const MAX_TRIM      = 3;
    let response;

    while (true) {
      const body = {
        model:       modelId,
        messages:    toPerplexityMessages(workingMessages, systemPrompt),
        max_tokens:  settings.maxTokens  ?? 4096,
        temperature: settings.temperature ?? 0.7,
        stream:      true,
      };

      try {
        response = await fetch(MUNINN_CONFIG.endpoints.perplexity, {
          method:  'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
          signal,
        });
      } catch (e) {
        if (e.name === 'AbortError') return;
        onError('Erreur réseau Perplexity : ' + e.message);
        return;
      }

      if (!response.ok) {
        let errText = '';
        try { const j = await response.json(); errText = j?.error?.message || ''; } catch {}
        if (isRateLimitError(response.status, errText) && rateRetry < 3) {
          rateRetry++;
          await wait429(rateRetry - 1);
          continue;
        }
        if (isTokenLimitError(errText) && trimCount < MAX_TRIM) {
          trimCount++;
          workingMessages = trimContextMessages(messages, Math.pow(0.5, trimCount));
          continue;
        }
        onError(formatProviderError('Perplexity', response.status, errText));
        return;
      }
      break;
    }

    let fullText     = '';
    let inputTokens  = 0;
    let outputTokens = 0;
    let citations    = [];

    await readSSEStream(response, (parsed) => {
      // Token usage (present in final chunk)
      if (parsed.usage) {
        inputTokens  = parsed.usage.prompt_tokens     || inputTokens;
        outputTokens = parsed.usage.completion_tokens || outputTokens;
      }
      // Citations (dans le dernier chunk)
      if (parsed.citations && parsed.citations.length) citations = parsed.citations;

      // Raisonnement — r1-1776 / sonar-reasoning exposent reasoning_content ou reasoning
      const reasoning = parsed?.choices?.[0]?.delta?.reasoning_content
                     || parsed?.choices?.[0]?.delta?.reasoning;
      if (reasoning && onThinking) onThinking(reasoning);

      const delta = parsed?.choices?.[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        // Filtrer les balises <think> inline si le modèle les inclut dans le contenu
        const { clean } = splitThinking(fullText);
        onChunk(delta, clean || fullText);
      }
    }, signal);

    const { thinking: thinkBlock, clean } = splitThinking(fullText);
    onDone(clean || fullText, { inputTokens, outputTokens, citations: citations.length ? citations : null, thinking: thinkBlock || null });
  }

  // ── DeepSeek streaming (OpenAI-compatible) ───
  async function streamDeepSeek({ modelId, messages, settings, onChunk, onDone, onError, onThinking, signal }) {
    const apiKey = Storage.getSettings().deepseekKey;
    if (!apiKey) { onError('Clé API DeepSeek manquante. Ajoutez-la dans la barre latérale ou les Paramètres.'); return; }

    const systemPrompt  = buildSystemPrompt(settings.systemPrompt || '', settings.userMemory || '');
    let workingMessages = messages;
    let trimCount       = 0;
    let rateRetry       = 0;
    const MAX_TRIM      = 3;
    let response;

    while (true) {
      const body = {
        model:      modelId,
        messages:   toPerplexityMessages(workingMessages, systemPrompt),
        max_tokens: settings.maxTokens ?? 4096,
        stream:     true,
      };
      if (modelId !== 'deepseek-reasoner') body.temperature = settings.temperature ?? 0.7;

      try {
        response = await fetch(MUNINN_CONFIG.endpoints.deepseek, {
          method:  'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
          signal,
        });
      } catch (e) {
        if (e.name === 'AbortError') return;
        onError('Erreur réseau DeepSeek : ' + e.message);
        return;
      }

      if (!response.ok) {
        let errText = '';
        try { const j = await response.json(); errText = j?.error?.message || ''; } catch {}
        if (isRateLimitError(response.status, errText) && rateRetry < 3) {
          rateRetry++;
          await wait429(rateRetry - 1);
          continue;
        }
        if (isTokenLimitError(errText) && trimCount < MAX_TRIM) {
          trimCount++;
          workingMessages = trimContextMessages(messages, Math.pow(0.5, trimCount));
          continue;
        }
        onError(formatProviderError('DeepSeek', response.status, errText));
        return;
      }
      break;
    }

    let fullText     = '';
    let inputTokens  = 0;
    let outputTokens = 0;

    await readSSEStream(response, (parsed) => {
      if (parsed.usage) {
        inputTokens  = parsed.usage.prompt_tokens     || inputTokens;
        outputTokens = parsed.usage.completion_tokens || outputTokens;
      }
      // DeepSeek R1 envoie reasoning_content séparé
      const thinking = parsed?.choices?.[0]?.delta?.reasoning_content;
      if (thinking && onThinking) onThinking(thinking);

      const delta = parsed?.choices?.[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        // Filtrer <think> inline si présent
        const { clean } = splitThinking(fullText);
        onChunk(delta, clean || fullText);
      }
    }, signal);

    const { thinking: thinkBlock, clean } = splitThinking(fullText);
    onDone(clean || fullText, { inputTokens, outputTokens, thinking: thinkBlock || null });
  }

  // ── Qwen streaming (OpenAI-compatible / DashScope) ─
  async function streamQwen({ modelId, messages, settings, onChunk, onDone, onError, signal }) {
    const apiKey = Storage.getSettings().qwenKey;
    if (!apiKey) { onError('Clé API Qwen manquante. Ajoutez-la dans la barre latérale ou les Paramètres.'); return; }

    const systemPrompt  = buildSystemPrompt(settings.systemPrompt || '', settings.userMemory || '');
    let workingMessages = messages;
    let trimCount       = 0;
    let rateRetry       = 0;
    const MAX_TRIM      = 3;
    let response;

    while (true) {
      const body = {
        model:       modelId,
        messages:    toPerplexityMessages(workingMessages, systemPrompt),
        max_tokens:  settings.maxTokens  ?? 4096,
        temperature: settings.temperature ?? 0.7,
        stream:      true,
      };

      try {
        response = await fetch(MUNINN_CONFIG.endpoints.qwen, {
          method:  'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
          signal,
        });
      } catch (e) {
        if (e.name === 'AbortError') return;
        onError('Erreur réseau Qwen : ' + e.message);
        return;
      }

      if (!response.ok) {
        let errText = '';
        try { const j = await response.json(); errText = j?.error?.message || ''; } catch {}
        if (isRateLimitError(response.status, errText) && rateRetry < 3) {
          rateRetry++;
          await wait429(rateRetry - 1);
          continue;
        }
        if (isTokenLimitError(errText) && trimCount < MAX_TRIM) {
          trimCount++;
          workingMessages = trimContextMessages(messages, Math.pow(0.5, trimCount));
          continue;
        }
        onError(formatProviderError('Qwen', response.status, errText));
        return;
      }
      break;
    }

    let fullText     = '';
    let inputTokens  = 0;
    let outputTokens = 0;

    await readSSEStream(response, (parsed) => {
      if (parsed.usage) {
        inputTokens  = parsed.usage.prompt_tokens     || inputTokens;
        outputTokens = parsed.usage.completion_tokens || outputTokens;
      }
      const delta = parsed?.choices?.[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        onChunk(delta, fullText);
      }
    }, signal);

    onDone(fullText, { inputTokens, outputTokens });
  }

  // ── OpenRouter streaming (OpenAI-compatible) ─────
  async function streamOpenRouter({ modelId, messages, settings, onChunk, onDone, onError, onThinking, signal }) {
    const apiKey = Storage.getSettings().openrouterKey;
    if (!apiKey) { onError('Clé API OpenRouter manquante. Ajoutez-la dans les Paramètres.'); return; }

    const systemPrompt  = buildSystemPrompt(settings.systemPrompt || '', settings.userMemory || '');
    let workingMessages = messages;
    let trimCount       = 0;
    let rateRetry       = 0;
    const MAX_TRIM      = 3;
    let response;

    // Utiliser le formattage multimodal si le modèle supporte les images
    const model = getModelById(modelId);
    const buildMsgs = (msgs) => model?.supportsImages
      ? toOpenRouterMessages(msgs, systemPrompt)
      : toPerplexityMessages(msgs, systemPrompt);

    while (true) {
      const body = {
        model:          modelId,
        messages:       buildMsgs(workingMessages),
        max_tokens:     settings.maxTokens  ?? 4096,
        temperature:    settings.temperature ?? 0.7,
        stream:         true,
        stream_options: { include_usage: true },
      };

      try {
        response = await fetch(MUNINN_CONFIG.endpoints.openrouter, {
          method:  'POST',
          headers: {
            'Authorization': 'Bearer ' + apiKey,
            'Content-Type':  'application/json',
            'HTTP-Referer':  'https://muninn.local',
            'X-Title':       'Muninn',
          },
          body:   JSON.stringify(body),
          signal,
        });
      } catch (e) {
        if (e.name === 'AbortError') return;
        onError('Erreur réseau OpenRouter : ' + e.message);
        return;
      }

      if (!response.ok) {
        let errText = '';
        try { const j = await response.json(); errText = j?.error?.message || ''; } catch {}
        if (isRateLimitError(response.status, errText) && rateRetry < 3) {
          rateRetry++;
          await wait429(rateRetry - 1);
          continue;
        }
        if (isTokenLimitError(errText) && trimCount < MAX_TRIM) {
          trimCount++;
          workingMessages = trimContextMessages(messages, Math.pow(0.5, trimCount));
          continue;
        }
        onError(formatProviderError('OpenRouter', response.status, errText));
        return;
      }
      break;
    }

    let fullText       = '';
    let reasoningAccum = '';
    let inputTokens    = 0;
    let outputTokens   = 0;

    await readSSEStream(response, (parsed) => {
      if (parsed.usage) {
        inputTokens  = parsed.usage.prompt_tokens     || inputTokens;
        outputTokens = parsed.usage.completion_tokens || outputTokens;
      }

      const choice = parsed?.choices?.[0];
      if (!choice) return;

      // ── Reasoning / thinking ─
      // Certains modèles utilisent 'reasoning', d'autres 'reasoning_content' (ex: DeepSeek via OR)
      const reasoning = choice.delta?.reasoning || choice.delta?.reasoning_content;
      if (reasoning) {
        reasoningAccum += reasoning;
        if (onThinking) onThinking(reasoning);
      }

      // ── Contenu texte — plusieurs fallbacks selon le modèle ──
      // 1. delta.content  → streaming standard OpenAI
      // 2. delta.text     → certains anciens modèles
      // 3. message.content → chunk final non-streamé (mode fallback de certains providers)
      const rawDelta = choice.delta?.content ?? choice.delta?.text ?? choice.message?.content ?? null;

      // N'ajouter que les vraies chaînes non-vides
      if (rawDelta !== null && rawDelta !== '') {
        fullText += rawDelta;
        const { clean } = splitThinking(fullText);
        onChunk(rawDelta, clean || fullText);
      }
    }, signal);

    // Cas particulier : le modèle retourne UNIQUEMENT du reasoning sans contenu texte
    // (ex: certains modèles via OpenRouter qui n'émettent que des tokens de réflexion)
    // → on utilise le reasoning accumulé comme réponse finale au lieu d'une réponse vide
    const finalText = fullText || reasoningAccum;
    const useReasoningAsFinal = !fullText && !!reasoningAccum;

    const { thinking: thinkBlock, clean } = splitThinking(finalText);
    // Si on recycle le reasoning comme texte final, on ne le passe pas en 'thinking' (évite le doublon)
    const thinkingPayload = useReasoningAsFinal ? null : (thinkBlock || null);
    onDone(clean || finalText, { inputTokens, outputTokens, thinking: thinkingPayload });
  }

  // ── Mistral streaming (OpenAI-compatible, dernier msg doit être user) ─
  async function streamMistral({ modelId, messages, settings, onChunk, onDone, onError, onThinking, signal }) {
    const apiKey = Storage.getSettings().mistralKey;
    if (!apiKey) { onError('Clé API Mistral manquante. Ajoutez-la dans les Paramètres.'); return; }

    const systemPrompt  = buildSystemPrompt(settings.systemPrompt || '', settings.userMemory || '');
    let workingMessages = messages;
    let trimCount       = 0;
    let rateRetry       = 0;
    const MAX_TRIM      = 3;
    let response;

    while (true) {
      // Mistral exige que le dernier message soit de rôle user
      let mistralMessages = toPerplexityMessages(workingMessages, systemPrompt);
      while (mistralMessages.length > 0 && mistralMessages[mistralMessages.length - 1].role === 'assistant') {
        mistralMessages.pop();
      }

      const body = {
        model:          modelId,
        messages:       mistralMessages,
        max_tokens:     settings.maxTokens  ?? 4096,
        temperature:    settings.temperature ?? 0.7,
        stream:         true,
        stream_options: { include_usage: true },
      };

      try {
        response = await fetch(MUNINN_CONFIG.endpoints.mistral, {
          method:  'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
          signal,
        });
      } catch (e) {
        if (e.name === 'AbortError') return;
        onError('Erreur réseau Mistral : ' + e.message);
        return;
      }

      if (!response.ok) {
        let errText = '';
        try { const j = await response.json(); errText = j?.message || j?.error?.message || ''; } catch {}
        if (isRateLimitError(response.status, errText) && rateRetry < 3) {
          rateRetry++;
          await wait429(rateRetry - 1);
          continue;
        }
        if (isTokenLimitError(errText) && trimCount < MAX_TRIM) {
          trimCount++;
          workingMessages = trimContextMessages(messages, Math.pow(0.5, trimCount));
          continue;
        }
        onError(formatProviderError('Mistral', response.status, errText));
        return;
      }
      break;
    }

    let fullText       = '';
    let inputTokens    = 0;
    let outputTokens   = 0;
    let prevThinkingLen = 0; // pour émettre uniquement le delta de thinking

    await readSSEStream(response, (parsed) => {
      if (parsed.usage) {
        inputTokens  = parsed.usage.prompt_tokens     || inputTokens;
        outputTokens = parsed.usage.completion_tokens || outputTokens;
      }
      let delta = parsed?.choices?.[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        const { thinking, clean } = splitThinking(fullText);
        // Émettre uniquement le delta de thinking accumulé depuis le dernier chunk
        if (onThinking && thinking.length > prevThinkingLen) {
          onThinking(thinking.slice(prevThinkingLen));
          prevThinkingLen = thinking.length;
        }
        onChunk(delta, clean || fullText);
      }
    }, signal);

    const { thinking: thinkBlock, clean } = splitThinking(fullText);
    onDone(clean || fullText, { inputTokens, outputTokens, thinking: thinkBlock || null });
  }

  // ── Custom provider streaming (OpenAI-compatible) ─
  async function streamCustom({ modelId, messages, settings, onChunk, onDone, onError, signal }) {
    const providers = Storage.getCustomProviders();
    const provider  = providers.find(p => p.id === modelId);
    if (!provider) { onError('Provider personnalisé introuvable : ' + modelId); return; }

    const apiKey = provider.key;
    if (!apiKey) { onError('Clé API manquante pour ' + provider.name + '. Configurez-la dans Clés API.'); return; }

    const systemPrompt = buildSystemPrompt(settings.systemPrompt || '', settings.userMemory || '');
    const msgs = toPerplexityMessages(messages, systemPrompt);

    const body = {
      model:       provider.modelId,
      messages:    msgs,
      max_tokens:  settings.maxTokens  ?? 4096,
      temperature: settings.temperature ?? 0.7,
      stream:      true,
    };

    let response;
    try {
      response = await fetch(provider.endpoint, {
        method:  'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type':  'application/json',
        },
        body:   JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (e.name === 'AbortError') return;
      onError('Erreur réseau ' + provider.name + ' : ' + e.message);
      return;
    }

    if (!response.ok) {
      let errText = '';
      try { const j = await response.json(); errText = j?.error?.message || ''; } catch {}
      onError(formatProviderError(provider.name, response.status, errText));
      return;
    }

    let fullText     = '';
    let inputTokens  = 0;
    let outputTokens = 0;

    await readSSEStream(response, (parsed) => {
      if (parsed.usage) {
        inputTokens  = parsed.usage.prompt_tokens     || inputTokens;
        outputTokens = parsed.usage.completion_tokens || outputTokens;
      }
      const delta = parsed?.choices?.[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        onChunk(delta, fullText);
      }
    }, signal);

    onDone(fullText, { inputTokens, outputTokens });
  }

  // ── Compression base64 PNG → JPEG ────────────
  function compressImageB64(b64png, quality = 0.82) {
    return new Promise((resolve) => {
      const img  = new Image();
      img.onload = () => {
        const canvas  = document.createElement('canvas');
        canvas.width  = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve('data:image/png;base64,' + b64png);
      img.src = 'data:image/png;base64,' + b64png;
    });
  }

  // ── Imagen / Gemini image generation (Google) ─
  async function generateImageImagen({ modelId, prompt, aspectRatio = '1:1', signal }) {
    const apiKey = Storage.getSettings().geminiKey;
    if (!apiKey) throw new Error('Clé API Gemini manquante. Ajoutez-la dans les Paramètres.');

    // Ajouter le format au prompt si pas carré
    const ratioSuffix = aspectRatio === '16:9' ? '\n[Format: paysage 16:9, image horizontale large]'
                      : aspectRatio === '9:16'  ? '\n[Format: portrait 9:16, image verticale haute]'
                      : '';
    const finalPrompt = prompt + ratioSuffix;

    // IMAGE + TEXT requis par certains modèles récents (ex: gemini-3.1-flash-image-preview)
    const url  = `${MUNINN_CONFIG.endpoints.gemini}/${modelId}:generateContent?key=${apiKey}`;
    const body = {
      contents:         [{ parts: [{ text: finalPrompt }] }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
    };

    // Timeout 90s — certains modèles (ex: 3.1-flash-image-preview) sont lents
    const timeoutId  = setTimeout(() => abortCtrl.abort(), 90_000);
    const abortCtrl  = new AbortController();
    const combined   = signal
      ? AbortSignal.any([signal, abortCtrl.signal])
      : abortCtrl.signal;

    let response;
    try {
      response = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  combined,
      });
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        if (abortCtrl.signal.aborted && !signal?.aborted)
          throw new Error('Timeout Imagen : la génération a dépassé 90 secondes.');
        throw e;
      }
      throw new Error('Erreur réseau Imagen : ' + e.message);
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      let errText = '';
      try { const j = await response.json(); errText = j?.error?.message || ''; } catch {}
      throw new Error(`Imagen erreur ${response.status}: ${errText}`);
    }

    const data = await response.json();

    // Parcourt tous les candidates et toutes les parts pour trouver une image
    let imagePart = null;
    for (const candidate of (data?.candidates || [])) {
      for (const part of (candidate?.content?.parts || [])) {
        if (part.inlineData) { imagePart = part; break; }
      }
      if (imagePart) break;
    }
    if (!imagePart) throw new Error('Aucune image retournée par Imagen.');

    const { mimeType, data: b64 } = imagePart.inlineData;
    if (mimeType === 'image/png') return await compressImageB64(b64);
    return `data:${mimeType};base64,${b64}`;
  }

  // ── OpenRouter image generation ───────────────
  async function generateImageOpenRouter({ modelId, prompt, aspectRatio = '1:1', signal }) {
    const apiKey = Storage.getSettings().openrouterKey;
    if (!apiKey) throw new Error('Clé API OpenRouter manquante. Ajoutez-la dans les Paramètres.');

    // Mapping aspect ratio → taille standard
    const sizeMap = {
      '1:1':  '1024x1024',
      '16:9': '1792x1024',
      '9:16': '1024x1792',
    };
    const size = sizeMap[aspectRatio] || '1024x1024';

    const body = {
      model:           modelId,
      prompt,
      n:               1,
      size,
      response_format: 'b64_json',
    };

    // Timeout 120s — certains modèles (Flux, Ideogram) peuvent être lents
    const abortCtrl = new AbortController();
    const timeoutId = setTimeout(() => abortCtrl.abort(), 120_000);
    const combined  = signal
      ? AbortSignal.any([signal, abortCtrl.signal])
      : abortCtrl.signal;

    let response;
    try {
      response = await fetch(MUNINN_CONFIG.endpoints.openrouterImages, {
        method:  'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type':  'application/json',
          'HTTP-Referer':  'https://muninn.local',
          'X-Title':       'Muninn',
        },
        body:   JSON.stringify(body),
        signal: combined,
      });
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        if (abortCtrl.signal.aborted && !signal?.aborted)
          throw new Error('Timeout : la génération d\'image a dépassé 120 secondes.');
        throw e;
      }
      throw new Error('Erreur réseau OpenRouter Image : ' + e.message);
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      let errText = '';
      try { const j = await response.json(); errText = j?.error?.message || ''; } catch {}
      throw new Error(`OpenRouter Image erreur ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const item = data?.data?.[0];
    if (!item) throw new Error('Aucune image retournée par OpenRouter.');

    // Selon le modèle : base64 ou URL
    if (item.b64_json) {
      const b64 = item.b64_json;
      // Compresser PNG → JPEG si besoin
      if (b64.startsWith('iVBOR')) return await compressImageB64(b64); // PNG header base64
      return 'data:image/jpeg;base64,' + b64;
    }
    if (item.url) return item.url;

    throw new Error('Format de réponse image OpenRouter inattendu.');
  }

  // ── Dispatch génération d'image ───────────────
  async function generateImage({ modelId, prompt, aspectRatio = '1:1', signal }) {
    const model = getModelById(modelId);
    if (!model) throw new Error('Modèle inconnu : ' + modelId);
    if (model.provider === 'imagen')
      return await generateImageImagen({ modelId, prompt, aspectRatio, signal });
    if (model.provider === 'openrouter' && model.type === 'image')
      return await generateImageOpenRouter({ modelId, prompt, aspectRatio, signal });
    throw new Error('Provider image non supporté : ' + model.provider);
  }

  // ── Dispatch selon provider ───────────────────
  async function stream({ modelId, messages, settings, onChunk, onDone, onError, onThinking, signal }) {
    const model = getModelById(modelId);
    if (!model) { onError(`Modèle inconnu : ${modelId}`); return; }

    if (model.provider === 'gemini') {
      await streamGemini({ modelId, messages, settings, onChunk, onDone, onError, onThinking, signal });
    } else if (model.provider === 'anthropic') {
      await streamAnthropic({ modelId, messages, settings, onChunk, onDone, onError, signal });
    } else if (model.provider === 'perplexity') {
      await streamPerplexity({ modelId, messages, settings, onChunk, onDone, onError, onThinking, signal });
    } else if (model.provider === 'deepseek') {
      await streamDeepSeek({ modelId, messages, settings, onChunk, onDone, onError, onThinking, signal });
    } else if (model.provider === 'qwen') {
      await streamQwen({ modelId, messages, settings, onChunk, onDone, onError, signal });
    } else if (model.provider === 'mistral') {
      await streamMistral({ modelId, messages, settings, onChunk, onDone, onError, onThinking, signal });
    } else if (model.provider === 'openrouter') {
      await streamOpenRouter({ modelId, messages, settings, onChunk, onDone, onError, onThinking, signal });
    } else if (model.provider === 'custom') {
      await streamCustom({ modelId, messages, settings, onChunk, onDone, onError, signal });
    } else {
      onError('Provider non supporté : ' + model.provider);
    }
  }

  // ── Génération de titre (non-streaming) ──────
  async function generateTitle({ modelId, firstUserMsg, firstAssistantMsg }) {
    const model = getModelById(modelId);
    if (!model) return null;
    const s = Storage.getSettings();
    const keys = { gemini: s.geminiKey, anthropic: s.anthropicKey, perplexity: s.perplexityKey, deepseek: s.deepseekKey, qwen: s.qwenKey, mistral: s.mistralKey, openrouter: s.openrouterKey };
    let apiKey = keys[model.provider];
    let customProvider = null;
    if (model.provider === 'custom') {
      customProvider = Storage.getCustomProviders().find(p => p.id === modelId);
      apiKey = customProvider?.key || null;
    }
    if (!apiKey) return null;

    const prompt = "Génère un titre court (4-6 mots maximum) en français pour cette conversation. Réponds uniquement avec le titre, sans guillemets ni ponctuation finale.";
    const msgs = [
      { role: 'user',      content: firstUserMsg      },
      { role: 'assistant', content: firstAssistantMsg },
      { role: 'user',      content: prompt            },
    ];

    try {
      if (model.provider === 'gemini') {
        const url = `${MUNINN_CONFIG.endpoints.gemini}/${modelId}:generateContent?key=${apiKey}`;
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: toGeminiMessages(msgs), generationConfig: { maxOutputTokens: 25, temperature: 0.4 } }) });
        if (!res.ok) return null;
        return (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
      }
      if (model.provider === 'anthropic') {
        const res = await fetch(MUNINN_CONFIG.endpoints.anthropic, { method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: modelId, max_tokens: 25, messages: toAnthropicMessages(msgs) }) });
        if (!res.ok) return null;
        return (await res.json())?.content?.[0]?.text?.trim() || null;
      }
      if (model.provider === 'custom' && customProvider) {
        const body = { model: customProvider.modelId, messages: toPerplexityMessages(msgs, null), max_tokens: 25, temperature: 0.4, stream: false };
        const res = await fetch(customProvider.endpoint, { method: 'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(body) });
        if (!res.ok) return null;
        return (await res.json())?.choices?.[0]?.message?.content?.trim() || null;
      }
      if (model.provider === 'perplexity' || model.provider === 'deepseek' || model.provider === 'qwen') {
        const body = { model: modelId, messages: toPerplexityMessages(msgs, null), max_tokens: 25, stream: false };
        if (modelId !== 'deepseek-reasoner') body.temperature = 0.4;
        const res = await fetch(MUNINN_CONFIG.endpoints[model.provider], { method: 'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(body) });
        if (!res.ok) return null;
        return (await res.json())?.choices?.[0]?.message?.content?.trim() || null;
      }
      if (model.provider === 'mistral') {
        let mMsgs = toPerplexityMessages(msgs, null);
        while (mMsgs.length > 0 && mMsgs[mMsgs.length - 1].role === 'assistant') mMsgs.pop();
        const body = { model: modelId, messages: mMsgs, max_tokens: 25, temperature: 0.4, stream: false };
        const res = await fetch(MUNINN_CONFIG.endpoints.mistral, { method: 'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(body) });
        if (!res.ok) return null;
        return (await res.json())?.choices?.[0]?.message?.content?.trim() || null;
      }
      if (model.provider === 'openrouter') {
        const body = { model: modelId, messages: toPerplexityMessages(msgs, null), max_tokens: 25, temperature: 0.4, stream: false };
        const res = await fetch(MUNINN_CONFIG.endpoints.openrouter, { method: 'POST',
          headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://muninn.local', 'X-Title': 'Muninn' },
          body: JSON.stringify(body) });
        if (!res.ok) return null;
        return (await res.json())?.choices?.[0]?.message?.content?.trim() || null;
      }
    } catch { return null; }
    return null;
  }

  return { stream, generateTitle, generateImage };

})();
