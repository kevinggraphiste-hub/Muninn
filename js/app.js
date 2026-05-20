/* ═══════════════════════════════════════════════
   MUNNIN — Contrôleur principal
═══════════════════════════════════════════════ */

(function () {

  // ── État global ───────────────────────────────
  let currentConvId      = null;
  let isGenerating       = false;
  let abortController    = null;
  let pendingAttachments = []; // [{ type, name, mimeType, data }]
  let interimText        = '';
  let imageAspectRatio   = '1:1'; // format image actif
  let webSearchEnabled   = false; // toggle recherche web

  // Fonctions UI partagées entre init() et les fonctions de conversation
  let updateTokenCounter = () => {};
  let updateScrollBtn    = () => {};

  // ── Références DOM ────────────────────────────
  const $ = id => document.getElementById(id);
  const convList          = $('convList');
  const messagesContainer = $('messagesContainer');
  const emptyState        = $('emptyState');
  const promptInput       = $('promptInput');
  const sendBtn           = $('sendBtn');
  const voiceBtn          = $('voiceBtn');
  const ttsToggle         = $('ttsToggle');
  const fileInput         = $('fileInput');
  const attachmentsBar    = $('attachmentsBar');
  const modelSelectorBtn  = $('modelSelectorBtn');
  const modelDropdown     = $('modelDropdown');
  const modelSelector     = $('modelSelector');
  const selectedModelName = $('selectedModelName');
  const modelProviderDot  = $('modelProviderDot');
  const charCounter       = $('charCounter');
  const optimizeBtn       = $('optimizeBtn');
  const webSearchBtn      = $('webSearchBtn');
  const imageFormatBar    = $('imageFormatBar');

  // ── Toast notifications ───────────────────────
  const toastContainer = (() => {
    const div = document.createElement('div');
    div.className = 'toast-container';
    document.body.appendChild(div);
    return div;
  })();

  function toast(msg, type = 'info', duration = 3000) {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    toastContainer.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity 0.3s';
      t.style.opacity    = '0';
      setTimeout(() => t.remove(), 300);
    }, duration);
  }

  // ── Thème ─────────────────────────────────────
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    Storage.setTheme(theme);
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
  }

  // ── Taille de texte ───────────────────────────
  function applyFontSize(size) {
    document.documentElement.setAttribute('data-fontsize', size);
    Storage.setFontSize(size);
    document.querySelectorAll('.fontsize-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.size === size);
    });
  }

  // ── Modèle selector ───────────────────────────
  // Synchronise les providers personnalisés dans MUNNIN_CONFIG.models pour que getModelById() fonctionne
  function syncCustomProvidersToConfig() {
    MUNNIN_CONFIG.models = MUNNIN_CONFIG.models.filter(m => !m.id.startsWith('custom_'));
    const customs = Storage.getCustomProviders();
    for (const cp of customs) {
      MUNNIN_CONFIG.models.push({
        id:             cp.id,
        name:           cp.name,
        description:    cp.modelId,
        provider:       'custom',
        supportsImages: false,
        supportsFiles:  false,
        contextWindow:  '—',
        pricing:        { inputPer1M: 0, outputPer1M: 0 },
      });
    }
  }

  function buildModelDropdown() {
    syncCustomProvidersToConfig();
    const groups = getModelsByProvider();
    const labels = { gemini: 'Google Gemini', anthropic: 'Anthropic Claude', perplexity: 'Perplexity', deepseek: 'DeepSeek', qwen: 'Qwen (Alibaba)', mistral: 'Mistral AI', openrouter: 'OpenRouter', custom: 'Providers personnalisés' };
    const dots   = { gemini: 'var(--provider-gemini)', anthropic: 'var(--provider-anthropic)', perplexity: 'var(--provider-perplexity)', deepseek: 'var(--provider-deepseek)', qwen: 'var(--provider-qwen)', mistral: 'var(--provider-mistral, #FF7000)', openrouter: 'var(--provider-openrouter)', custom: '#6366f1' };

    modelDropdown.innerHTML = '';

    for (const [provider, models] of Object.entries(groups)) {
      const textModels = models.filter(m => m.type !== 'image');
      if (textModels.length === 0) continue;

      const label = document.createElement('div');
      label.className = 'model-group-label';
      label.innerHTML = `<span class="model-group-dot" style="background:${dots[provider] || 'var(--text-muted)'}"></span>${labels[provider] || provider}`;
      modelDropdown.appendChild(label);

      for (const model of textModels) {
        const opt = document.createElement('div');
        opt.className   = 'model-option';
        opt.dataset.id  = model.id;
        opt.innerHTML   = `
          <span class="model-option-name">${model.name}</span>
          <span class="model-option-desc">${model.description}</span>`;
        opt.addEventListener('click', () => selectModel(model.id));
        modelDropdown.appendChild(opt);
      }
    }

    // ── Section génération d'images ───────────────
    const imageModels = MUNNIN_CONFIG.models.filter(m => m.type === 'image');
    if (imageModels.length > 0) {
      const sep = document.createElement('div');
      sep.className = 'model-image-separator';
      sep.textContent = '🖼️ Génération d\'images';
      modelDropdown.appendChild(sep);

      const imageDots   = { imagen: 'var(--provider-imagen)', openrouter: 'var(--provider-openrouter)' };
      const imageLabels = { imagen: 'Google Imagen', openrouter: 'OpenRouter' };
      const imageGroups = {};
      for (const m of imageModels) {
        if (!imageGroups[m.provider]) imageGroups[m.provider] = [];
        imageGroups[m.provider].push(m);
      }

      for (const [imgProvider, imgModels] of Object.entries(imageGroups)) {
        const grpLabel = document.createElement('div');
        grpLabel.className = 'model-group-label';
        const dot = document.createElement('span');
        dot.className = 'model-group-dot';
        dot.style.background = imageDots[imgProvider] || 'var(--text-muted)';
        grpLabel.appendChild(dot);
        grpLabel.appendChild(document.createTextNode(imageLabels[imgProvider] || imgProvider));
        modelDropdown.appendChild(grpLabel);

        for (const model of imgModels) {
          const opt = document.createElement('div');
          opt.className  = 'model-option';
          opt.dataset.id = model.id;
          const nameSpan = document.createElement('span');
          nameSpan.className   = 'model-option-name';
          nameSpan.textContent = model.name;
          const descSpan = document.createElement('span');
          descSpan.className   = 'model-option-desc';
          descSpan.textContent = model.description;
          opt.appendChild(nameSpan);
          opt.appendChild(descSpan);
          opt.addEventListener('click', () => selectModel(model.id));
          modelDropdown.appendChild(opt);
        }
      }
    }
  }

  function selectModel(modelId) {
    Storage.setModel(modelId);
    updateModelDisplay(modelId);
    closeModelDropdown();

    // Persister le modèle dans la conversation courante
    if (currentConvId) {
      Storage.updateConversationModel(currentConvId, modelId);
    }

    // L'adaptation UI (optimize btn, format image, placeholder) est gérée par updateModelDisplay
  }

  function updateModelDisplay(modelId) {
    const model = getModelById(modelId);
    if (!model) return;
    selectedModelName.textContent = model.name;
    const colors = { gemini: 'var(--provider-gemini)', anthropic: 'var(--provider-anthropic)', perplexity: 'var(--provider-perplexity)', deepseek: 'var(--provider-deepseek)', qwen: 'var(--provider-qwen)', mistral: 'var(--provider-mistral, #FF7000)', openrouter: 'var(--provider-openrouter)', imagen: 'var(--provider-imagen)', custom: '#6366f1' };
    modelProviderDot.style.background = colors[model.provider] || 'var(--text-muted)';

    // Adapter l'UI selon le type de modèle (image vs texte)
    const isImageModel = model?.type === 'image';
    if (optimizeBtn) optimizeBtn.style.display = isImageModel ? 'none' : '';
    if (imageFormatBar) imageFormatBar.style.display = isImageModel ? 'flex' : 'none';
    promptInput.placeholder = isImageModel ? '✏️ Décrivez l\'image à générer…' : 'Écrivez un message…';

    // Marquer l'option sélectionnée
    document.querySelectorAll('.model-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.id === modelId);
    });
  }

  function toggleModelDropdown() {
    const isOpen = modelDropdown.classList.contains('open');
    if (isOpen) closeModelDropdown();
    else         openModelDropdown();
  }

  function openModelDropdown() {
    modelDropdown.classList.add('open');
    modelSelector.classList.add('open');
    modelDropdown.style.display = 'block';
  }

  function closeModelDropdown() {
    modelDropdown.classList.remove('open');
    modelSelector.classList.remove('open');
    modelDropdown.style.display = 'none';
  }

  // ── Conversations sidebar ─────────────────────
  let _convSearchQuery = '';

  function renderConvList(filter) {
    if (filter !== undefined) _convSearchQuery = filter;
    const q      = (_convSearchQuery || '').toLowerCase().trim();
    const cu     = Storage.getCurrentUser();
    let   convs  = Storage.getConversations();

    // Filtrer selon la recherche
    if (q) {
      convs = convs.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some(m => typeof m.content === 'string' && m.content.toLowerCase().includes(q))
      );
    }

    convList.innerHTML = '';

    if (convs.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:12px 14px;font-size:12px;color:var(--text-muted);';
      empty.textContent   = q ? 'Aucune conversation trouvée' : 'Aucune conversation';
      convList.appendChild(empty);
      return;
    }

    const folders  = Storage.getFolders(cu?.id);
    const allTags  = Storage.getTags(cu?.id);
    const pinned   = convs.filter(c => c.pinned);
    const unpinned = convs.filter(c => !c.pinned);

    function makeSep(label) {
      const s = document.createElement('div');
      s.className   = 'conv-section-label';
      s.textContent = label;
      return s;
    }

    function makeItem(conv) {
      const convTags   = (conv.tags || []).map(tid => allTags.find(t => t.id === tid)).filter(Boolean);
      const tagsHtml   = convTags.map(t => '<span class="conv-tag-dot" style="background:' + t.color + '" title="' + escapeHtml(t.name) + '"></span>').join('');
      const folderInfo = conv.folderId ? folders.find(f => f.id === conv.folderId) : null;
      const folderDot  = folderInfo
        ? '<span class="conv-folder-indicator" style="background:' + folderInfo.color + '" title="📁 ' + escapeHtml(folderInfo.name) + '"></span>'
        : '';
      const item      = document.createElement('div');
      item.className  = 'conv-item' + (conv.id === currentConvId ? ' active' : '') + (conv.pinned ? ' pinned' : '');
      const costBadge = conv.totalCost > 0
        ? '<span class="conv-cost-badge" title="Coût estimé de la conversation">$' + conv.totalCost.toFixed(3) + '</span>'
        : '';
      item.innerHTML  = '<span class="conv-title">' + escapeHtml(conv.title) + costBadge + '</span>'
        + (folderDot ? '<span class="conv-meta-row">' + folderDot + (tagsHtml ? tagsHtml : '') + '</span>' : (tagsHtml ? '<span class="conv-tags-row">' + tagsHtml + '</span>' : ''))
        + '<div class="conv-actions">'
        + '<button class="conv-pin' + (conv.pinned ? ' active' : '') + '" data-id="' + conv.id + '" title="' + (conv.pinned ? 'Désépingler' : 'Épingler') + '">📌</button>'
        + '<div class="conv-export-wrap">'
        + '<button class="conv-export" data-id="' + conv.id + '" title="Actions (exporter, dossier, étiquette)">⋯</button>'
        + '<div class="conv-export-menu" id="emenu-' + conv.id + '">'
        + '<button class="conv-export-option" data-action="markdown">📄 Markdown</button>'
        + '<button class="conv-export-option" data-action="html">🌐 HTML standalone</button>'
        + '<button class="conv-export-option" data-action="pdf">🖨️ PDF</button>'
        + '<button class="conv-export-option" data-action="summary">✨ Résumé IA</button>'
        + '<button class="conv-export-option" data-action="newconv">🆕 Résumé → Nouvelle conv</button>'
        + '<div class="conv-export-sep"></div>'
        + '<button class="conv-export-option" data-action="newFolder">📁 Nouveau dossier</button>'
        + (folders.length > 0
            ? folders.map(f => '<button class="conv-export-option conv-move-btn" data-fid="' + f.id + '" style="--fdot:' + f.color + '">'
                + (conv.folderId === f.id ? '✓ ' : '') + escapeHtml(f.name) + '</button>').join('')
              + '<button class="conv-export-option conv-move-btn" data-fid="">' + (conv.folderId === null ? '✓ ' : '') + 'Sans dossier</button>'
            : '')
        + (allTags.length > 0
            ? '<div class="conv-export-sep"></div>'
              + allTags.map(t => '<button class="conv-export-option conv-tag-btn" data-tid="' + t.id + '">'
                + '<span class="conv-export-tag-dot" style="background:' + t.color + '"></span>'
                + ((conv.tags || []).includes(t.id) ? '✓ ' : '') + escapeHtml(t.name) + '</button>').join('')
            : '')
        + '</div></div>'
        + '<button class="conv-delete" data-id="' + conv.id + '" title="Supprimer">✕</button>'
        + '</div>';

      item.addEventListener('click', (e) => {
        if (e.target.closest('.conv-actions')) return;
        // Fermer tous les menus ouverts
        document.querySelectorAll('.conv-export-menu.open').forEach(m => m.classList.remove('open'));
        loadConversation(conv.id);
      });

      item.querySelector('.conv-pin').addEventListener('click', (e) => {
        e.stopPropagation();
        Storage.togglePin(conv.id);
        renderConvList();
      });

      item.querySelector('.conv-export').addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = item.querySelector('.conv-export-menu');
        const isOpen = menu.classList.contains('open');
        // Fermer tous les autres menus
        document.querySelectorAll('.conv-export-menu.open').forEach(m => m.classList.remove('open'));
        if (!isOpen) menu.classList.add('open');
      });

      item.querySelectorAll('.conv-export-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const menu = item.querySelector('.conv-export-menu');
          menu.classList.remove('open');
          const action = opt.dataset.action;
          const fid    = opt.dataset.fid;
          const tid    = opt.dataset.tid;
          if (action === 'markdown') exportConversation(conv.id);
          else if (action === 'html')    exportConversationHTML(conv.id);
          else if (action === 'pdf')     exportConversationPDF(conv.id);
          else if (action === 'summary') exportConversationSummary(conv.id);
          else if (action === 'newconv') summaryToNewConv(conv.id);
          else if (action === 'newFolder') openQuickFolderModal(conv.id);
          else if (fid !== undefined) {
            Storage.setConvFolder(conv.id, fid || null);
            renderConvList();
          } else if (tid !== undefined) {
            const currentTags = conv.tags || [];
            const newTags = currentTags.includes(tid)
              ? currentTags.filter(t => t !== tid)
              : [...currentTags, tid];
            Storage.setConvTags(conv.id, newTags);
            renderConvList();
          }
        });
      });

      item.querySelector('.conv-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteConversation(conv.id);
      });
      return item;
    }

    // ── Épinglées ──
    if (pinned.length > 0) {
      convList.appendChild(makeSep('Épinglées'));
      pinned.forEach(c => convList.appendChild(makeItem(c)));
    }

    if (q) {
      // En mode recherche : pas de regroupement par dossiers
      const unp = unpinned;
      if (unp.length > 0) {
        if (pinned.length > 0) convList.appendChild(makeSep('Résultats'));
        unp.forEach(c => convList.appendChild(makeItem(c)));
      }
      return;
    }

    // ── Dossiers ──
    for (const folder of folders) {
      const folderConvs = unpinned.filter(c => c.folderId === folder.id);
      if (folderConvs.length === 0) continue;

      const header = document.createElement('div');
      header.className = 'conv-folder-header';
      header.innerHTML = '<span class="conv-folder-dot" style="background:' + folder.color + '"></span>'
        + '<span class="conv-folder-name">' + escapeHtml(folder.name) + '</span>'
        + '<span class="conv-folder-count">' + folderConvs.length + '</span>'
        + '<span class="conv-folder-arrow">' + (folder.collapsed ? '▶' : '▼') + '</span>';

      header.addEventListener('click', () => {
        Storage.updateFolder(cu?.id, folder.id, { collapsed: !folder.collapsed });
        renderConvList();
      });
      convList.appendChild(header);

      if (!folder.collapsed) {
        folderConvs.forEach(c => convList.appendChild(makeItem(c)));
      }
    }

    // ── Sans dossier ──
    const noFolder = unpinned.filter(c => !c.folderId);
    if (noFolder.length > 0) {
      if (folders.length > 0 && folders.some(f => unpinned.some(c => c.folderId === f.id))) {
        convList.appendChild(makeSep('Sans dossier'));
      } else if (pinned.length > 0) {
        convList.appendChild(makeSep('Conversations'));
      }
      noFolder.forEach(c => convList.appendChild(makeItem(c)));
    }
  }

  function exportConversation(id) {
    const conv = Storage.getConversation(id);
    if (!conv) return;
    const modelName = getModelById(conv.modelId)?.name || conv.modelId || '';
    const date      = new Date().toLocaleDateString('fr-FR');
    const costStr   = conv.totalCost > 0 ? ` — Coût : $${conv.totalCost.toFixed(4)}` : '';
    const lines = [
      `# ${conv.title}`, '',
      `*Exporté le ${date} — Modèle : ${modelName}${costStr}*`,
      '',
    ];
    let prevModelId = null;
    for (const msg of conv.messages) {
      if (msg.role === 'assistant' && msg.modelId && prevModelId && msg.modelId !== prevModelId) {
        const prevM = getModelById(prevModelId)?.name || prevModelId;
        const newM  = getModelById(msg.modelId)?.name  || msg.modelId;
        lines.push(`---`, `*Changement de modèle : ${prevM} → ${newM}*`, '');
      }
      if (msg.role === 'assistant' && msg.modelId) prevModelId = msg.modelId;
      if (msg.role === 'user')           lines.push('## Utilisateur', '', msg.content, '');
      else if (msg.role === 'assistant') lines.push('## Assistant',   '', msg.content, '');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `munnin-${conv.title.replace(/[^a-z0-9\u00C0-\u024F]/gi, '').replace(/\s+/g, '-').slice(0, 40) || 'conv'}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Conversation exportée ✓', 'success', 2000);
  }

  function exportConversationPDF(id) {
    const conv = Storage.getConversation(id);
    if (!conv) return;
    const modelName = getModelById(conv.modelId)?.name || conv.modelId || '';
    const date = new Date().toLocaleDateString('fr-FR');

    const messagesHtml = conv.messages.map(msg => {
      if (msg.role === 'user') {
        return '<div class="msg user"><div class="role">Utilisateur</div><div class="content">'
          + escapeHtml(msg.content).replace(/\n/g, '<br>') + '</div></div>';
      } else {
        let html = msg.content;
        try { html = marked.parse(msg.content || ''); } catch { html = escapeHtml(msg.content).replace(/\n/g, '<br>'); }
        return '<div class="msg assistant"><div class="role">Assistant</div><div class="content">' + html + '</div></div>';
      }
    }).join('');

    const css = [
      'body{font-family:"Segoe UI",Arial,sans-serif;font-size:13px;color:#1a1a1a;max-width:820px;margin:0 auto;padding:32px 24px}',
      'h1{font-size:20px;margin:0 0 4px}.meta{font-size:11px;color:#666;margin-bottom:28px}',
      '.msg{margin-bottom:18px;page-break-inside:avoid}',
      '.role{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}',
      '.msg.user .role{color:#7c3aed}.msg.assistant .role{color:#0369a1}',
      '.content{line-height:1.6;white-space:pre-wrap}.msg.assistant .content{white-space:normal}',
      'pre{background:#f4f4f4;padding:10px 14px;border-radius:6px;overflow:auto;font-size:12px}',
      'code{font-family:Consolas,monospace;font-size:12px}p{margin:0 0 8px}',
      'ul,ol{margin:0 0 8px;padding-left:20px}hr{border:none;border-top:1px solid #e5e5e5;margin:24px 0}',
      '@media print{body{padding:0}}',
    ].join('');

    const htmlParts = [
      '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">',
      '<title>' + escapeHtml(conv.title) + '</title>',
      '<style>' + css + '</style></head><body>',
      '<h1>' + escapeHtml(conv.title) + '</h1>',
      '<div class="meta">Exporte le ' + date + ' - Modele : ' + escapeHtml(modelName) + '</div>',
      '<hr>' + messagesHtml,
      '</body></html>',
    ];

    const blob = new Blob([htmlParts.join('')], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const printLink = document.createElement('a');
    printLink.href = blobUrl;
    printLink.target = '_blank';
    printLink.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    toast('Ouvrez le fichier dans votre navigateur puis imprimez (Ctrl+P) pour exporter en PDF', 'info', 5000);
  }

  async function exportConversationSummary(id) {
    const conv = Storage.getConversation(id);
    if (!conv || conv.messages.length < 2) {
      toast('Pas assez de messages à résumer', 'error'); return;
    }
    const settings = Storage.getSettings();
    const hasGemini = !!settings.geminiKey;
    const hasClaude = !!settings.anthropicKey;
    if (!hasGemini && !hasClaude) {
      toast('Clé API requise pour le résumé IA', 'error'); return;
    }
    toast('Génération du résumé…', 'info', 2500);
    const convText = conv.messages.map(m => (m.role === 'user' ? 'Utilisateur' : 'Assistant') + ' : ' + m.content).join('\n\n');
    const sysMsg   = 'Résume cette conversation en 5 à 10 points clés, en Markdown (bullet points). Sois concis et factuel.';
    try {
      let summary = '';
      if (hasGemini) {
        const url  = MUNNIN_CONFIG.endpoints.gemini + '/gemini-2.5-flash:generateContent?key=' + settings.geminiKey;
        const res  = await fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: sysMsg }] },
            contents: [{ role: 'user', parts: [{ text: convText }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
          }),
        });
        const data = await res.json();
        summary    = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else {
        const res  = await fetch(MUNNIN_CONFIG.endpoints.anthropic, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': settings.anthropicKey,
            'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024,
            system: sysMsg, messages: [{ role: 'user', content: convText }] }),
        });
        const data = await res.json();
        summary    = data.content?.[0]?.text || '';
      }
      if (!summary) { toast('Résumé vide retourné', 'error'); return; }
      const md   = '# Résumé — ' + conv.title + '\n\n*Généré le ' + new Date().toLocaleDateString('fr-FR') + '*\n\n' + summary.trim();
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'resume-' + (conv.title.replace(/[^a-z0-9\u00C0-\u024F]/gi, '-').slice(0, 40) || 'conv') + '.md';
      a.click();
      URL.revokeObjectURL(url);
      toast('Résumé exporté ✓', 'success', 2000);
    } catch {
      toast('Erreur lors de la génération du résumé', 'error');
    }
  }

  // ── Export HTML standalone ─────────────────────
  function exportConversationHTML(id) {
    const conv = Storage.getConversation(id);
    if (!conv) return;
    const modelName = getModelById(conv.modelId)?.name || conv.modelId || '';
    const date      = new Date().toLocaleDateString('fr-FR');
    const title     = escapeHtml(conv.title);

    const messagesHtml = conv.messages.map(msg => {
      if (msg.role === 'user') {
        return `<div class="msg user"><div class="role">Utilisateur</div><div class="content">${escapeHtml(msg.content).replace(/\n/g, '<br>')}</div></div>`;
      }
      let html = msg.content;
      try { html = marked.parse(msg.content || ''); } catch { html = escapeHtml(msg.content).replace(/\n/g, '<br>'); }
      return `<div class="msg assistant"><div class="role">Assistant</div><div class="content">${html}</div></div>`;
    }).join('');

    const doc = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
:root{--bg:#f5f0e8;--bg2:#fff;--text:#1a1a1a;--text2:#555;--user-c:#7c3aed;--ai-c:#0369a1;--border:#e0d9d0;--code-bg:#f4f4f4}
[data-theme=dark]{--bg:#1a1a1a;--bg2:#252525;--text:#f0ebe3;--text2:#9a9a9a;--user-c:#a78bfa;--ai-c:#60a5fa;--border:#333;--code-bg:#2a2a2a}
body{font-family:"Segoe UI",Arial,sans-serif;font-size:14px;color:var(--text);background:var(--bg);margin:0;padding:0}
.container{max-width:860px;margin:0 auto;padding:32px 24px}
header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:16px;border-bottom:1px solid var(--border)}
h1{font-size:20px;margin:0 0 4px;color:var(--text)}.meta{font-size:12px;color:var(--text2)}
.theme-toggle{background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px}
.msg{margin-bottom:20px;padding:14px 16px;border-radius:10px;background:var(--bg2);border:1px solid var(--border)}
.role{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
.msg.user .role{color:var(--user-c)}.msg.assistant .role{color:var(--ai-c)}
.content{line-height:1.65}.msg.user .content{white-space:pre-wrap}
pre{background:var(--code-bg);padding:12px 16px;border-radius:6px;overflow:auto;font-size:12px;margin:8px 0}
code{font-family:Consolas,monospace;font-size:12px}
p{margin:0 0 10px}ul,ol{margin:0 0 10px;padding-left:22px}
h2,h3,h4{margin:16px 0 8px}
</style>
</head>
<body data-theme="light">
<div class="container">
<header>
  <div>
    <h1>${title}</h1>
    <div class="meta">Exporté le ${date} &nbsp;·&nbsp; ${escapeHtml(modelName)} &nbsp;·&nbsp; ${conv.messages.length} messages</div>
  </div>
  <button class="theme-toggle" onclick="document.body.dataset.theme=document.body.dataset.theme==='dark'?'light':'dark'">🌗 Thème</button>
</header>
${messagesHtml}
</div>
</body>
</html>`;

    const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `muninn-${(conv.title.replace(/[^a-z0-9\u00C0-\u024F]/gi, '-').slice(0, 40) || 'conv')}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Export HTML ✓', 'success', 2000);
  }

  // ── Résumé IA → Nouvelle conversation ─────────
  async function summaryToNewConv(id) {
    const conv = Storage.getConversation(id);
    if (!conv || conv.messages.length < 2) { toast('Pas assez de messages à résumer', 'error'); return; }
    const settings  = Storage.getSettings();
    const hasGemini = !!settings.geminiKey;
    const hasClaude = !!settings.anthropicKey;
    if (!hasGemini && !hasClaude) { toast('Clé API Gemini ou Anthropic requise', 'error'); return; }
    toast('Génération du résumé…', 'info', 3000);
    const convText = conv.messages.map(m => (m.role === 'user' ? 'Utilisateur' : 'Assistant') + ' : ' + m.content).join('\n\n');
    const sysMsg   = 'Résume cette conversation de façon concise (5-8 points clés max) en Markdown. Ce résumé sera utilisé comme contexte de départ pour une nouvelle conversation.';
    try {
      let summary = '';
      if (hasGemini) {
        const url = MUNNIN_CONFIG.endpoints.gemini + '/gemini-2.5-flash:generateContent?key=' + settings.geminiKey;
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: sysMsg }] },
            contents: [{ role: 'user', parts: [{ text: convText }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 512 } }) });
        summary = (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else {
        const res = await fetch(MUNNIN_CONFIG.endpoints.anthropic, { method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': settings.anthropicKey,
            'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 512,
            system: sysMsg, messages: [{ role: 'user', content: convText }] }) });
        summary = (await res.json())?.content?.[0]?.text || '';
      }
      if (!summary) { toast('Résumé vide retourné', 'error'); return; }
      newConversation();
      promptInput.value = `## Résumé de la conversation précédente\n\n${summary.trim()}\n\n---\n\n`;
      promptInput.dispatchEvent(new Event('input'));
      promptInput.focus();
      toast('Résumé injecté — continuez la conversation ✓', 'success', 3000);
    } catch {
      toast('Erreur lors de la génération du résumé', 'error');
    }
  }

  function deleteConversation(id) {
    if (!confirm('Supprimer cette conversation ?')) return;
    Storage.deleteConversation(id);
    if (currentConvId === id) {
      const remaining = Storage.getConversations();
      if (remaining.length > 0) loadConversation(remaining[0].id);
      else newConversation();
    }
    renderConvList();
  }

  // ── Chargement / création de conversation ─────
  function newConversation() {
    if (isGenerating) stopGeneration();

    const modelId = Storage.getModel();
    const conv    = Storage.createConversation(modelId);
    currentConvId = conv.id;

    messagesContainer.innerHTML = '';
    messagesContainer.style.display = 'none';
    emptyState.style.display    = 'flex';
    pendingAttachments           = [];
    renderAttachmentsBar();
    renderConvList();
    promptInput.focus();
  }

  function loadConversation(id) {
    if (isGenerating) stopGeneration();

    const conv = Storage.getConversation(id);
    if (!conv) return;

    currentConvId = id;
    Storage.setCurrentConvId(id);

    messagesContainer.innerHTML = '';

    if (conv.messages.length === 0) {
      emptyState.style.display    = 'flex';
      messagesContainer.style.display = 'none';
    } else {
      emptyState.style.display    = 'none';
      messagesContainer.style.display = 'flex';

      let _prevAssistantModelId = null;
      conv.messages.forEach((msg, msgIdx) => {
        // Marqueur de changement de modèle
        if (msg.role === 'assistant' && msg.modelId && _prevAssistantModelId && msg.modelId !== _prevAssistantModelId) {
          const marker = document.createElement('div');
          marker.className = 'model-switch-marker';
          const prevM = getModelById(_prevAssistantModelId);
          const newM  = getModelById(msg.modelId);
          marker.innerHTML = '<span>Passage de <b>' + escapeHtml(prevM?.name || _prevAssistantModelId) + '</b> à <b>' + escapeHtml(newM?.name || msg.modelId) + '</b></span>';
          messagesContainer.appendChild(marker);
        }
        if (msg.role === 'assistant' && msg.modelId) _prevAssistantModelId = msg.modelId;
        appendMessageBubble(msg.role, msg.content, msg.attachments || [], false, msg.modelId || null, msgIdx);
      });
      scrollToBottom();
    }

    // Restaurer le modèle de la conv
    if (conv.modelId) {
      Storage.setModel(conv.modelId);
      updateModelDisplay(conv.modelId);
    }

    renderConvList();
    promptInput.focus();
    // Ferme la sidebar sur mobile après sélection
    document.dispatchEvent(new Event('convSelected'));
    // Mise à jour compteur tokens
    if (typeof updateTokenCounter === 'function') updateTokenCounter();
  }

  // ── Rendu des messages ────────────────────────
  function escapeHtml(text) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(text));
    return d.innerHTML;
  }

  function renderMarkdown(text) {
    if (!renderMarkdown._configured && window.hljs) {
      const renderer = new marked.Renderer();
      renderer.code = function(code, lang) {
        const src      = typeof code === 'object' ? code.text : code;
        const lng      = (typeof code === 'object' ? code.lang : lang) || '';
        const language = lng && hljs.getLanguage(lng) ? lng : 'plaintext';
        const highlighted = hljs.highlight(src, { language }).value;
        const langLabel   = language !== 'plaintext' ? escapeHtml(language) : '';
        return `<div class="code-block">
  <div class="code-header">
    <span class="code-lang-tag">${langLabel}</span>
    <button class="code-copy-btn" title="Copier le code">
      <svg class="icon-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      <svg class="icon-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
    </button>
  </div>
  <pre><code class="hljs language-${escapeHtml(language)}">${highlighted}</code></pre>
</div>`;
      };
      marked.use({ renderer });
      renderMarkdown._configured = true;
    }
    try {
      return marked.parse(text, { breaks: true, gfm: true });
    } catch {
      return escapeHtml(text).replace(/\n/g, '<br>');
    }
  }

  function appendMessageBubble(role, content, attachments = [], streaming = false, overrideModelId = null, msgIndex = null) {
    const user     = Storage.getCurrentUser();
    const modelId  = overrideModelId || Storage.getModel();
    const model    = getModelById(modelId);

    const row = document.createElement('div');
    row.className = `message-row ${role}`;

    // Attachments HTML
    let attachHtml = '';
    if (attachments && attachments.length > 0) {
      attachHtml = '<div class="message-attachments">';
      for (const att of attachments) {
        if (att.type === 'image') {
          attachHtml += `<img class="attachment-thumb" src="${att.data}" alt="${escapeHtml(att.name)}">`;
        } else {
          attachHtml += `<div class="attachment-file">📄 ${escapeHtml(att.name)}</div>`;
        }
      }
      attachHtml += '</div>';
    }

    const senderLabel = role === 'user'
      ? (user ? escapeHtml(user.name) : 'Vous')
      : (model ? escapeHtml(model.name) : 'Assistant');

    const avatarLabel = role === 'user'
      ? (user ? user.avatar : '🐺')
      : '◈';

    const modelTag = role === 'assistant' && model
      ? `<span class="message-model-tag">${escapeHtml(model.provider)}</span>`
      : '';

    let contentHtml;
    if (!streaming && content && content.startsWith('[IMAGE:')) {
      const src = content.slice(7, content.lastIndexOf(']'));
      const img = document.createElement('img');
      img.className = 'generated-image';
      img.src       = src;
      img.alt       = 'Image générée';
      img.loading   = 'lazy';
      img.addEventListener('click', () => openLightbox(src));
      const dlLink  = document.createElement('a');
      dlLink.className    = 'image-download-btn';
      dlLink.href         = src;
      dlLink.target       = '_blank';
      dlLink.download     = 'image-munnin.jpg';
      dlLink.textContent  = '⬇ Télécharger';
      const wrap = document.createElement('div');
      wrap.className = 'image-result-wrap';
      wrap.appendChild(img);
      const actions = document.createElement('div');
      actions.className = 'image-actions';
      actions.appendChild(dlLink);
      wrap.appendChild(actions);
      // On insère via un placeholder puis on swap après création du row
      contentHtml = '<span class="__img_placeholder__"></span>';
      // Stocker pour injection post-appendChild
      appendMessageBubble._pendingImgWrap = wrap;
    } else if (streaming) {
      contentHtml = `<span class="streaming-cursor">${escapeHtml(content)}</span>`;
    } else {
      contentHtml = renderMarkdown(content);
    }

    // Boutons d'action (masqués au hover)
    const copyBtn = `<button class="msg-copy-btn" title="Copier le message">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      Copier
    </button>`;
    const regenBtn = (!streaming && role === 'assistant')
      ? `<button class="msg-regen-btn" title="Régénérer la réponse">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          Régénérer
        </button>`
      : '';
    const editBtn = (!streaming && role === 'user' && msgIndex !== null)
      ? `<button class="msg-edit-btn" title="Modifier le message">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Modifier
        </button>`
      : '';

    row.innerHTML = `
      <div class="message-bubble">
        <div class="message-header">
          <span class="message-avatar">${avatarLabel}</span>
          <span class="message-sender">${senderLabel}</span>
          ${modelTag}
        </div>
        ${attachHtml}
        <div class="message-content">${contentHtml}</div>
        <div class="msg-actions">${copyBtn}${editBtn}${regenBtn}</div>
      </div>`;

    messagesContainer.appendChild(row);

    // Remplacer le placeholder par le vrai élément image si besoin
    if (appendMessageBubble._pendingImgWrap) {
      const placeholder = row.querySelector('.__img_placeholder__');
      if (placeholder) {
        placeholder.replaceWith(appendMessageBubble._pendingImgWrap);
      }
      appendMessageBubble._pendingImgWrap = null;
    }

    // ── Bouton Copier ────────────────────────────
    const copyBtnEl = row.querySelector('.msg-copy-btn');
    if (copyBtnEl) {
      copyBtnEl.addEventListener('click', () => {
        const text = row.querySelector('.message-content')?.innerText || content;
        navigator.clipboard?.writeText(text).then(() => {
          copyBtnEl.classList.add('copied');
          copyBtnEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><polyline points="20 6 9 17 4 12"/></svg> Copié !';
          setTimeout(() => {
            copyBtnEl.classList.remove('copied');
            copyBtnEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copier';
          }, 2000);
        }).catch(() => {
          toast('Copie non supportée par ce navigateur', 'error');
        });
      });
    }

    // ── Bouton Régénérer ─────────────────────────
    const regenBtnEl = row.querySelector('.msg-regen-btn');
    if (regenBtnEl) {
      regenBtnEl.addEventListener('click', () => regenerateLastResponse());
    }

    // ── Bouton Modifier message user ─────────────
    const editBtnEl = row.querySelector('.msg-edit-btn');
    if (editBtnEl && msgIndex !== null) {
      editBtnEl.addEventListener('click', () => startEditMessage(row, msgIndex, content));
    }

    return row;
  }

  // ── Régénération de la dernière réponse ───────
  async function regenerateLastResponse() {
    if (isGenerating || !currentConvId) return;
    const conv = Storage.getConversation(currentConvId);
    if (!conv || conv.messages.length === 0) return;

    // Trouver et supprimer le dernier message assistant
    const lastIdx = conv.messages.length - 1;
    if (conv.messages[lastIdx].role !== 'assistant') return;
    Storage.truncateMessagesAfter(currentConvId, lastIdx);

    // Retirer le dernier bubble du DOM
    const rows = messagesContainer.querySelectorAll('.message-row');
    if (rows.length > 0) rows[rows.length - 1].remove();

    // Relancer la génération avec les messages restants
    isGenerating    = true;
    abortController = new AbortController();

    const modelId       = Storage.getModel();
    const messages      = Storage.getMessages(currentConvId);
    const settings      = Storage.getSettings();
    const aiRow         = appendMessageBubble('assistant', '', [], true);
    const aiContent     = aiRow.querySelector('.message-content');
    let   fullResponse  = '';

    const onDone = async (text, meta) => {
      isGenerating = false;
      aiContent.innerHTML = renderMarkdown(text);
      aiContent.querySelectorAll('img').forEach(img => {
        const src = img.src;
        img.addEventListener('click', () => openLightbox(src));
      });
      const actionsDiv = aiRow.querySelector('.msg-actions');
      if (actionsDiv) {
        const rb = actionsDiv.querySelector('.msg-regen-btn');
        if (rb) rb.addEventListener('click', () => regenerateLastResponse());
        const cb = actionsDiv.querySelector('.msg-copy-btn');
        if (cb) cb.addEventListener('click', () => {
          navigator.clipboard?.writeText(text).then(() => toast('Copié !', 'success', 1200));
        });
      }
      Storage.updateLastAssistantMessage(currentConvId, text);
      if (meta?.inputTokens || meta?.outputTokens) {
        Storage.trackUsage(modelId, meta.inputTokens || 0, meta.outputTokens || 0);
        const { dailyCost, weeklyCost, monthlyCost } = Storage.getCurrentCosts();
        refreshBudgetBars();
        checkBudgetAlerts(dailyCost, weeklyCost, monthlyCost);
      }
    };

    await API.stream({
      modelId,
      messages,
      settings: { ...settings.inference, systemPrompt: settings.systemPrompt, userMemory: settings.userMemory, webSearch: settings.webSearch },
      onChunk: (chunk, full) => {
        fullResponse = full;
        aiContent.innerHTML = renderMarkdown(full) + '<span class="streaming-cursor"></span>';
        scrollToBottom(false);
      },
      onDone,
      onError: (err) => {
        isGenerating = false;
        aiContent.innerHTML = `<span class="error-msg">⚠ ${escapeHtml(err)}</span>`;
      },
      onThinking: (t) => {
        let thinkEl = aiRow.querySelector('.thinking-block');
        if (!thinkEl) {
          thinkEl = document.createElement('details');
          thinkEl.className = 'thinking-block';
          thinkEl.innerHTML = '<summary>Réflexion…</summary><div class="thinking-content"></div>';
          aiContent.before(thinkEl);
        }
        thinkEl.querySelector('.thinking-content').textContent += t;
      },
      signal: abortController.signal,
    });
  }

  // ── Édition d'un message utilisateur ──────────
  function startEditMessage(row, msgIndex, originalContent) {
    if (isGenerating) return;
    const msgContentEl = row.querySelector('.message-content');
    const msgActionsEl = row.querySelector('.msg-actions');
    if (!msgContentEl) return;

    // Remplacer le contenu par un textarea
    const originalHtml = msgContentEl.innerHTML;
    msgContentEl.innerHTML = '';
    const textarea = document.createElement('textarea');
    textarea.className = 'msg-edit-area';
    textarea.value = originalContent;
    msgContentEl.appendChild(textarea);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    // Masquer les boutons d'action
    if (msgActionsEl) msgActionsEl.style.display = 'none';

    // Actions confirmer / annuler
    const actEdit = document.createElement('div');
    actEdit.className = 'msg-edit-actions';
    actEdit.innerHTML = `
      <button class="msg-edit-confirm-btn">✓ Confirmer &amp; régénérer</button>
      <button class="msg-edit-cancel-btn">Annuler</button>
    `;
    msgContentEl.appendChild(actEdit);

    actEdit.querySelector('.msg-edit-cancel-btn').addEventListener('click', () => {
      msgContentEl.innerHTML = originalHtml;
      if (msgActionsEl) msgActionsEl.style.display = '';
    });

    actEdit.querySelector('.msg-edit-confirm-btn').addEventListener('click', async () => {
      const newText = textarea.value.trim();
      if (!newText) return;

      // Mettre à jour le message en storage
      Storage.updateUserMessage(currentConvId, msgIndex, newText);

      // Tronquer tous les messages après ce message utilisateur
      Storage.truncateMessagesAfter(currentConvId, msgIndex + 1);

      // Recharger la conversation depuis le début pour reconstruire le DOM proprement
      const rows = Array.from(messagesContainer.querySelectorAll('.message-row'));
      // Supprimer tous les rows à partir du suivant
      const allRows = messagesContainer.querySelectorAll('.message-row');
      let found = false;
      allRows.forEach(r => {
        if (found) r.remove();
        if (r === row) found = true;
      });
      // Aussi supprimer les marqueurs après ce message
      const allMarkers = messagesContainer.querySelectorAll('.model-switch-marker');
      allMarkers.forEach(m => {
        if (row.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING) m.remove();
      });

      // Mettre à jour le contenu affiché du message édité
      msgContentEl.innerHTML = renderMarkdown(newText);
      if (msgActionsEl) msgActionsEl.style.display = '';

      // Déclencher la génération de la nouvelle réponse
      isGenerating    = true;
      abortController = new AbortController();
      const modelId   = Storage.getModel();
      const messages  = Storage.getMessages(currentConvId);
      const settings  = Storage.getSettings();
      const aiRow     = appendMessageBubble('assistant', '', [], true);
      const aiContent = aiRow.querySelector('.message-content');

      await API.stream({
        modelId,
        messages,
        settings: { ...settings.inference, systemPrompt: settings.systemPrompt, userMemory: settings.userMemory, webSearch: settings.webSearch },
        onChunk: (chunk, full) => {
          aiContent.innerHTML = renderMarkdown(full) + '<span class="streaming-cursor"></span>';
          scrollToBottom(false);
        },
        onDone: async (text, meta) => {
          isGenerating = false;
          aiContent.innerHTML = renderMarkdown(text);
          Storage.addMessage(currentConvId, 'assistant', text, [], modelId);
          if (meta?.inputTokens || meta?.outputTokens) {
            Storage.trackUsage(modelId, meta.inputTokens || 0, meta.outputTokens || 0);
            const { dailyCost, weeklyCost, monthlyCost } = Storage.getCurrentCosts();
            refreshBudgetBars();
            checkBudgetAlerts(dailyCost, weeklyCost, monthlyCost);
          }
          renderConvList();
        },
        onError: (err) => {
          isGenerating = false;
          aiContent.innerHTML = `<span class="error-msg">⚠ ${escapeHtml(err)}</span>`;
        },
        onThinking: (t) => {
          let thinkEl = aiRow.querySelector('.thinking-block');
          if (!thinkEl) {
            thinkEl = document.createElement('details');
            thinkEl.className = 'thinking-block';
            thinkEl.innerHTML = '<summary>Réflexion…</summary><div class="thinking-content"></div>';
            aiContent.before(thinkEl);
          }
          thinkEl.querySelector('.thinking-content').textContent += t;
        },
        signal: abortController.signal,
      });
    });
  }

  function scrollToBottom(smooth = true) {
    const area = $('conversationArea');
    area.scrollTo({ top: area.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
  }

  // ── Envoi du message ──────────────────────────
  async function sendMessage() {
    const text = promptInput.value.trim();
    if (!text && pendingAttachments.length === 0) return;
    if (isGenerating) return;

    // Vérification budget avant envoi
    const budgetExceeded = isBudgetExceeded();
    if (budgetExceeded) {
      toast(`🚫 Budget ${budgetExceeded} épuisé — envoi bloqué. Ajustez vos limites dans Paramètres.`, 'error', 7000);
      return;
    }

    // Créer une conversation si nécessaire
    if (!currentConvId) {
      const conv = Storage.createConversation(Storage.getModel());
      currentConvId = conv.id;
    }

    // Show conversation
    emptyState.style.display    = 'none';
    messagesContainer.style.display = 'flex';

    const attachments = [...pendingAttachments];
    pendingAttachments = [];
    renderAttachmentsBar();

    // Sauvegarder le message utilisateur
    Storage.addMessage(currentConvId, 'user', text, attachments);
    renderConvList(); // Mettre à jour le titre dans le sidebar

    // Afficher le message utilisateur
    appendMessageBubble('user', text, attachments, false);
    scrollToBottom();

    // Réinitialiser input
    promptInput.value = '';
    updateSendBtn();
    autoResizeTextarea();

    // Préparer la réponse
    isGenerating    = true;
    abortController = new AbortController();

    const modelId       = Storage.getModel();
    const selectedModel = getModelById(modelId);

    // ── Branche génération d'image ────────────────
    if (selectedModel?.type === 'image') {
      const aiRow     = appendMessageBubble('assistant', '', [], true);
      const aiContent = aiRow.querySelector('.message-content');
      aiContent.innerHTML = '<span class="image-generating-label">⏳ Génération en cours…</span>';
      scrollToBottom();

      Storage.addMessage(currentConvId, 'assistant', '', [], modelId);
      sendBtn.disabled = true;

      try {
        const result  = await API.generateImage({ modelId, prompt: text, aspectRatio: imageAspectRatio, signal: abortController.signal });
        const stored  = '[IMAGE:' + result + ']';

        // Construire l'affichage image
        const img = document.createElement('img');
        img.className = 'generated-image';
        img.src       = result;
        img.alt       = 'Image générée';
        img.loading   = 'lazy';
        img.addEventListener('click', () => openLightbox(result));
        const dlLink  = document.createElement('a');
        dlLink.className   = 'image-download-btn';
        dlLink.href        = result;
        dlLink.target      = '_blank';
        dlLink.download    = 'image-munnin.jpg';
        dlLink.textContent = '⬇ Télécharger';
        const actions = document.createElement('div');
        actions.className = 'image-actions';
        actions.appendChild(dlLink);
        const wrap = document.createElement('div');
        wrap.className = 'image-result-wrap';
        wrap.appendChild(img);
        wrap.appendChild(actions);

        aiContent.innerHTML = '';
        aiContent.appendChild(wrap);

        Storage.updateLastAssistantMessage(currentConvId, stored);
        const imgBudget = Storage.trackImageUsage(modelId, 1);
        checkBudgetAlerts(imgBudget.dailyCost, imgBudget.weeklyCost, imgBudget.monthlyCost);

        // Titre = prompt de l'utilisateur
        const convForTitle = Storage.getConversation(currentConvId);
        if (convForTitle && convForTitle.messages.length === 2) {
          Storage.updateConversationTitle(currentConvId, text.slice(0, 50) + (text.length > 50 ? '…' : ''));
        }
      } catch (e) {
        if (e.name !== 'AbortError') {
          const errMsg = e.message || 'Erreur de génération';
          aiContent.textContent = '⚠ ' + errMsg;
          aiContent.style.color = 'var(--accent)';
          Storage.updateLastAssistantMessage(currentConvId, '[Erreur: ' + errMsg + ']');
          toast(errMsg, 'error', 5000);
        }
      }

      renderConvList();
      isGenerating     = false;
      sendBtn.disabled = !promptInput.value.trim() && pendingAttachments.length === 0;
      scrollToBottom();
      return;
    }

    // ── Branche streaming (modèles texte) ─────────
    const aiRow    = appendMessageBubble('assistant', '', [], true);
    const aiContent = aiRow.querySelector('.message-content');
    scrollToBottom();

    const settings    = Storage.getSettings();
    const currentUser = Storage.getCurrentUser();
    settings.userMemory    = Storage.getMemory(currentUser?.id);
    settings.webSearch     = webSearchEnabled;

    // Appliquer les overrides du skill actif
    const activeSkillId = Storage.getActiveSkillId(currentUser?.id);
    if (activeSkillId) {
      const activeSkill = Storage.getSkills(currentUser?.id).find(s => s.id === activeSkillId);
      if (activeSkill) {
        if (activeSkill.temperature !== null && activeSkill.temperature !== undefined) settings.temperature = activeSkill.temperature;
        if (activeSkill.maxTokens   !== null && activeSkill.maxTokens   !== undefined) settings.maxTokens   = activeSkill.maxTokens;
        if (activeSkill.systemPrompt) {
          settings.systemPrompt = activeSkill.systemPrompt +
            (settings.systemPrompt ? '\n\n---\n' + settings.systemPrompt : '');
        }
      }
    }

    // Capturer les messages AVANT d'ajouter le placeholder assistant
    // (inclut déjà le message utilisateur qu'on vient d'ajouter)
    const apiMessages = (Storage.getConversation(currentConvId)?.messages || [])
      .map(m => ({ role: m.role, content: m.content, attachments: m.attachments }));

    let fullResponse  = '';
    let thinkingAccum = '';

    // Ajouter le placeholder réponse dans le storage
    Storage.addMessage(currentConvId, 'assistant', '', [], modelId);

    sendBtn.disabled = true;

    await API.stream({
      modelId,
      messages: apiMessages,
      settings,
      signal: abortController.signal,

      onThinking: (chunk) => {
        thinkingAccum += chunk;
        let thinkEl = aiRow.querySelector('.thinking-block');
        if (!thinkEl) {
          thinkEl = document.createElement('details');
          thinkEl.className = 'thinking-block';
          thinkEl.open = true;
          const sum = document.createElement('summary');
          sum.className = 'thinking-summary';
          sum.textContent = '🧠 Raisonnement…';
          const body = document.createElement('div');
          body.className = 'thinking-content';
          thinkEl.appendChild(sum);
          thinkEl.appendChild(body);
          aiContent.parentNode.insertBefore(thinkEl, aiContent);
        }
        thinkEl.querySelector('.thinking-content').textContent = thinkingAccum;
        scrollToBottom(false);
      },

      onChunk: (chunk, full) => {
        fullResponse = full;
        const cursor = aiContent.querySelector('.streaming-cursor');
        if (cursor) {
          cursor.textContent = full;
        } else {
          aiContent.innerHTML = `<span class="streaming-cursor">${escapeHtml(full)}</span>`;
        }
        scrollToBottom(false);
      },

      onDone: (finalText, usage) => {
        const text = finalText || fullResponse;

        // Finaliser le bloc thinking
        const thinking = usage?.thinking || thinkingAccum;
        if (thinking && thinking.trim()) {
          let thinkEl = aiRow.querySelector('.thinking-block');
          if (!thinkEl) {
            thinkEl = document.createElement('details');
            thinkEl.className = 'thinking-block';
            aiContent.parentNode.insertBefore(thinkEl, aiContent);
          }
          thinkEl.open = false;
          const sum = document.createElement('summary');
          sum.className = 'thinking-summary';
          sum.textContent = '🧠 Raisonnement (cliquer pour voir)';
          const body = document.createElement('div');
          body.className = 'thinking-content';
          body.innerHTML = renderMarkdown(thinking);
          thinkEl.replaceChildren(sum, body);
        }

        // Render markdown final
        aiContent.innerHTML = renderMarkdown(text);

        // Citations Perplexity
        if (usage?.citations && usage.citations.length) {
          const citDiv = document.createElement('div');
          citDiv.className = 'citations-list';
          const citTitle = document.createElement('div');
          citTitle.className = 'citations-title';
          citTitle.textContent = '🔗 Sources';
          citDiv.appendChild(citTitle);
          usage.citations.forEach((url, i) => {
            const label = typeof url === 'object' ? (url.title || url.url) : url;
            const href  = typeof url === 'object' ? url.url  : url;
            const a = document.createElement('a');
            a.href      = href;
            a.target    = '_blank';
            a.rel       = 'noopener noreferrer';
            a.className = 'citation-link';
            const num = document.createElement('span');
            num.className   = 'citation-num';
            num.textContent = String(i + 1);
            a.appendChild(num);
            a.appendChild(document.createTextNode(label));
            citDiv.appendChild(a);
          });
          aiRow.appendChild(citDiv);
        }

        // Sauvegarder dans storage
        Storage.updateLastAssistantMessage(currentConvId, text);

        // Suivi des tokens + alertes budget
        if (usage && (usage.inputTokens || usage.outputTokens)) {
          const { dailyCost, weeklyCost, monthlyCost } = Storage.trackUsage(modelId, usage.inputTokens || 0, usage.outputTokens || 0);
          checkBudgetAlerts(dailyCost, weeklyCost, monthlyCost);
          // Coût par conversation
          const _model = getModelById(modelId);
          if (_model?.pricing) {
            const msgCost = ((usage.inputTokens  || 0) / 1_000_000 * (_model.pricing.inputPer1M  || 0))
                          + ((usage.outputTokens || 0) / 1_000_000 * (_model.pricing.outputPer1M || 0));
            if (msgCost > 0) Storage.addConvCost(currentConvId, msgCost);
          }
        }

        // Titre auto via IA après le 1er échange
        const convForTitle = Storage.getConversation(currentConvId);
        if (convForTitle && convForTitle.messages.length === 2) {
          API.generateTitle({
            modelId,
            firstUserMsg:      convForTitle.messages[0].content,
            firstAssistantMsg: convForTitle.messages[1].content,
          }).then(title => {
            if (title && title.trim()) {
              Storage.updateConversationTitle(currentConvId, title.trim());
              renderConvList();
            }
          });
        }

        renderConvList();

        isGenerating = false;
        sendBtn.disabled = !promptInput.value.trim() && pendingAttachments.length === 0;

        // TTS si activé
        if (Speech.isTTSEnabled() && finalText) {
          Speech.speak(Speech.cleanForTTS(finalText));
        }
        scrollToBottom();
      },

      onError: (errMsg) => {
        aiContent.innerHTML = `<span style="color:var(--accent)">⚠ ${escapeHtml(errMsg)}</span>`;
        Storage.updateLastAssistantMessage(currentConvId, `[Erreur: ${errMsg}]`);
        isGenerating = false;
        sendBtn.disabled = !promptInput.value.trim();
        renderConvList();
        toast(errMsg, 'error', 5000);
      },
    });
  }

  function stopGeneration() {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    isGenerating = false;
    sendBtn.disabled = !promptInput.value.trim();
  }

  // ── Input helpers ─────────────────────────────
  function updateSendBtn() {
    const hasText = promptInput.value.trim().length > 0;
    const hasFile = pendingAttachments.length > 0;
    sendBtn.disabled = !hasText && !hasFile;

    const len = promptInput.value.length;
    charCounter.textContent = len > 50 ? `${len}` : '';
  }

  function autoResizeTextarea() {
    promptInput.style.height = 'auto';
    promptInput.style.height = Math.min(promptInput.scrollHeight, 120) + 'px';
  }

  // ── Pièces jointes ────────────────────────────
  async function handleFiles(files) {
    for (const file of files) {
      const isImage = file.type.startsWith('image/');

      if (isImage) {
        const data = await readFileAsDataURL(file);
        pendingAttachments.push({ type: 'image', name: file.name, mimeType: file.type, data });
      } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        // PDF — envoyé en base64 pour lecture native Gemini/Anthropic
        const data = await readFileAsDataURL(file);
        pendingAttachments.push({ type: 'pdf', name: file.name, mimeType: 'application/pdf', data });
      } else {
        // Texte / autres
        const data = await readFileAsText(file);
        pendingAttachments.push({ type: 'text', name: file.name, mimeType: file.type, data });
      }
    }
    renderAttachmentsBar();
    updateSendBtn();
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = e => resolve(e.target.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = e => resolve(e.target.result);
      r.onerror = reject;
      r.readAsText(file);
    });
  }

  function renderAttachmentsBar() {
    attachmentsBar.innerHTML = '';
    if (pendingAttachments.length === 0) {
      attachmentsBar.style.display = 'none';
      return;
    }
    attachmentsBar.style.display = 'flex';

    for (let i = 0; i < pendingAttachments.length; i++) {
      const att  = pendingAttachments[i];
      const item = document.createElement('div');
      item.className = 'attachment-preview-item';

      if (att.type === 'image') {
        item.innerHTML = `<img src="${att.data}" alt="${escapeHtml(att.name)}"><span>${escapeHtml(att.name)}</span>`;
      } else {
        item.innerHTML = `<span>📄</span><span>${escapeHtml(att.name)}</span>`;
      }

      const del = document.createElement('button');
      del.className   = 'attachment-remove';
      del.textContent = '×';
      del.addEventListener('click', () => {
        pendingAttachments.splice(i, 1);
        renderAttachmentsBar();
        updateSendBtn();
      });
      item.appendChild(del);
      attachmentsBar.appendChild(item);
    }
  }

  // ── Voix ──────────────────────────────────────
  function toggleVoice() {
    if (Speech.isListening) {
      Speech.stopListening();
      voiceBtn.classList.remove('listening');
      if (interimText) {
        promptInput.value = interimText;
        interimText = '';
        updateSendBtn();
        autoResizeTextarea();
      }
    } else {
      const started = Speech.startListening({
        onStart: () => voiceBtn.classList.add('listening'),
        onStop: () => {
          voiceBtn.classList.remove('listening');
          if (interimText) {
            promptInput.value = interimText;
            interimText = '';
            updateSendBtn();
            autoResizeTextarea();
          }
        },
        onResult: ({ interim, final, isFinal }) => {
          const base = promptInput.value;
          if (isFinal) {
            interimText      = '';
            promptInput.value = base + final;
          } else {
            interimText = base + interim;
            // Show interim visually but don't commit yet
          }
          updateSendBtn();
          autoResizeTextarea();
        },
      });

      if (!started) toast('Microphone indisponible.', 'error');
    }
  }

  function toggleTTS() {
    const enabled = !Speech.isTTSEnabled();
    Speech.setTTSEnabled(enabled);
    ttsToggle.classList.toggle('active', enabled);
    toast(enabled ? '🔊 Réponse vocale activée' : '🔇 Réponse vocale désactivée', 'info', 1500);
    if (!enabled) Speech.stopSpeaking();
  }

  // ── Emoji Picker ──────────────────────────────
  const EMOJI_CATS = [
    { icon: '😊', label: 'Smileys',    list: ['😀','😃','😄','😁','😆','🤣','😂','🙂','😉','😊','😇','🥰','😍','🤩','😘','😋','😛','😜','🤪','😎','🤓','🧐','😏','😤','😡','🤬','😈','👿','🤖','👻','👽','💀','🤡','🥳','🥸','🫠','🤫','🤔'] },
    { icon: '🐾', label: 'Animaux',    list: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙊','🐔','🐧','🦆','🦉','🦇','🐺','🐗','🦄','🦋','🐢','🐍','🦈','🐬','🐋','🦭','🦎','🦖','🐙','🦅','🐿','🦔','🦝','🦨'] },
    { icon: '🌿', label: 'Nature',     list: ['🌸','🌺','🌹','🌷','🌻','🌼','💐','🍀','🌿','🍃','🍂','🍁','🌾','🌵','🎄','🌲','🌴','🍄','🌱','🌙','⭐','🌟','✨','💫','🌈','☀️','🔥','💧','🌊','⛅','❄️','🌀','🌋','🏔','🏝','🌅','🎑'] },
    { icon: '🎮', label: 'Activités',  list: ['🎮','🎲','🎯','🎭','🎨','🖌️','🎸','🎤','🎧','🎬','⚽','🏀','🎾','🥊','🏆','⛳','🎿','🎻','🎹','🎺','🎷','🥁','🎳','🎰','🎪','🚀','✈️','🚗','⚓','🏄','🧗','🎣','🏇','🧘','🤸','🪂'] },
    { icon: '🍕', label: 'Nourriture', list: ['🍕','🍔','🌮','🌯','🍜','🍣','🍱','🍩','🍰','🎂','🍫','🍬','🍭','🍦','🧁','🥐','🥪','🍟','🌭','🍗','🥗','🍿','🍪','🧇','🥞','🍳','🧀','🍖','🥩','🥑','🍷','☕','🧃'] },
    { icon: '💎', label: 'Symboles',   list: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','💕','💯','✅','🔥','⚡','🎵','🎶','💎','💰','🔮','⚙️','🧲','🪄','👑','☯️','☮️','🔑','🛡️','⚔️','🏴‍☠️','🎭','🌐','🧿'] },
  ];

  let _emojiTarget   = null; // callback (emoji) => void
  let _emojiPicker   = null;

  function _getOrCreatePicker() {
    if (_emojiPicker) return _emojiPicker;

    const picker = document.createElement('div');
    picker.className = 'emoji-picker';
    picker.id = 'emojiPicker';

    // Category tabs
    const cats = document.createElement('div');
    cats.className = 'emoji-picker-cats';
    EMOJI_CATS.forEach((cat, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emoji-cat-btn' + (i === 0 ? ' active' : '');
      btn.textContent = cat.icon;
      btn.title = cat.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        picker.querySelectorAll('.emoji-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _renderEmojiGrid(i);
      });
      cats.appendChild(btn);
    });

    // Grid container
    const grid = document.createElement('div');
    grid.className = 'emoji-picker-grid';
    grid.id = 'emojiPickerGrid';

    picker.appendChild(cats);
    picker.appendChild(grid);
    document.body.appendChild(picker);

    // Fermer en cliquant en dehors
    document.addEventListener('click', (e) => {
      if (_emojiPicker && _emojiPicker.classList.contains('open')) {
        if (!_emojiPicker.contains(e.target) &&
            !e.target.classList.contains('avatar-picker-btn') &&
            !e.target.classList.contains('user-item-avatar')) {
          _closeEmojiPicker();
        }
      }
    });

    _emojiPicker = picker;
    return picker;
  }

  function _renderEmojiGrid(catIdx) {
    const grid = document.getElementById('emojiPickerGrid');
    if (!grid) return;
    grid.innerHTML = '';
    for (const emoji of EMOJI_CATS[catIdx].list) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emoji-btn';
      btn.textContent = emoji;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (_emojiTarget) _emojiTarget(emoji);
        _closeEmojiPicker();
      });
      grid.appendChild(btn);
    }
  }

  function openEmojiPicker(nearEl, onSelect) {
    const picker = _getOrCreatePicker();
    _emojiTarget = onSelect;

    // Reset catégorie
    picker.querySelectorAll('.emoji-cat-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
    _renderEmojiGrid(0);

    // Positionnement intelligent
    picker.style.display = 'block';
    picker.classList.add('open');

    const rect   = nearEl.getBoundingClientRect();
    const pw     = 282;
    const ph     = 270;
    let   top    = rect.bottom + 6;
    let   left   = rect.left;

    if (top + ph > window.innerHeight) top  = rect.top - ph - 6;
    if (left + pw > window.innerWidth)  left = window.innerWidth - pw - 8;
    if (top < 4)  top  = 4;
    if (left < 4) left = 4;

    picker.style.top  = top  + 'px';
    picker.style.left = left + 'px';
  }

  function _closeEmojiPicker() {
    if (_emojiPicker) {
      _emojiPicker.classList.remove('open');
      _emojiPicker.style.display = 'none';
    }
    _emojiTarget = null;
  }

  // ── Utilisateurs ─────────────────────────────
  function renderCurrentUser() {
    const user = Storage.getCurrentUser();
    if (!user) return;
    $('currentUserAvatar').textContent = user.avatar;
    $('currentUserName').textContent   = user.name;
  }

  // ── Skills ────────────────────────────────────
  function renderSkillsChips() {
    const cu       = Storage.getCurrentUser();
    const skills   = Storage.getSkills(cu?.id);
    const activeId = Storage.getActiveSkillId(cu?.id);
    const container = $('skillsChips');
    container.innerHTML = '';
    for (const skill of skills) {
      const btn = document.createElement('button');
      btn.className  = 'skill-chip' + (skill.id === activeId ? ' active' : '');
      btn.dataset.id = skill.id;
      btn.title      = skill.systemPrompt ? skill.systemPrompt.slice(0, 80) + '…' : skill.name;
      btn.innerHTML  = `<span>${skill.icon}</span><span>${escapeHtml(skill.name)}</span>`;
      btn.addEventListener('click', () => activateSkill(skill.id));
      container.appendChild(btn);
    }
  }

  function activateSkill(skillId) {
    const cu        = Storage.getCurrentUser();
    const currentId = Storage.getActiveSkillId(cu?.id);
    const skills    = Storage.getSkills(cu?.id);
    const skill     = skills.find(s => s.id === skillId);

    if (currentId === skillId) {
      Storage.setActiveSkillId(cu?.id, null);
      toast('Skill désactivé', 'info', 1500);
    } else {
      Storage.setActiveSkillId(cu?.id, skillId);
      if (skill?.modelId) selectModel(skill.modelId);
      if (skill?.name) toast(`Skill "${skill.name}" activé`, 'success', 1500);
    }
    renderSkillsChips();
  }

  function populateSkillModelSelect() {
    const sel    = $('skillModelSelect');
    const groups = getModelsByProvider();
    const labels = { gemini: 'Google Gemini', anthropic: 'Anthropic Claude', perplexity: 'Perplexity', deepseek: 'DeepSeek', qwen: 'Qwen (Alibaba)' };
    sel.innerHTML = '<option value="">Garder le modèle courant</option>';
    for (const [provider, models] of Object.entries(groups)) {
      const textModels = models.filter(m => m.type !== 'image');
      if (textModels.length === 0) continue;
      const grp   = document.createElement('optgroup');
      grp.label   = labels[provider] || provider;
      for (const m of textModels) {
        const opt   = document.createElement('option');
        opt.value   = m.id;
        opt.text    = m.name;
        grp.appendChild(opt);
      }
      sel.appendChild(grp);
    }
  }

  function resetSkillForm() {
    $('skillFormTitle').textContent = 'Nouveau skill';
    $('skillIconBtn').textContent   = '⭐';
    $('skillNameInput').value       = '';
    $('skillModelSelect').value     = '';
    $('skillTempInput').value       = '-1';
    $('skillTempValue').textContent = '—';
    $('skillPromptInput').value     = '';
    $('skillEditId').value          = '';
    $('skillForm').style.display    = '';
  }

  function openSkillEdit(skill) {
    $('skillFormTitle').textContent = 'Modifier le skill';
    $('skillIconBtn').textContent   = skill.icon || '⭐';
    $('skillNameInput').value       = skill.name;
    $('skillModelSelect').value     = skill.modelId || '';
    const temp = skill.temperature !== null && skill.temperature !== undefined ? skill.temperature : -1;
    $('skillTempInput').value       = temp;
    $('skillTempValue').textContent = temp === -1 ? '—' : temp;
    $('skillPromptInput').value     = skill.systemPrompt || '';
    $('skillEditId').value          = skill.id;
    $('skillForm').style.display    = '';
    $('skillForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderSkillsList() {
    const cu       = Storage.getCurrentUser();
    const skills   = Storage.getSkills(cu?.id);
    const list     = $('skillsList');
    list.innerHTML = '';

    for (const skill of skills) {
      const item = document.createElement('div');
      item.className = 'skill-list-item' + (skill.builtIn ? ' builtin' : '');
      item.innerHTML = `
        <span class="skill-list-icon">${skill.icon}</span>
        <span class="skill-list-name">${escapeHtml(skill.name)}</span>
        ${skill.modelId ? `<span class="skill-list-model">${getModelById(skill.modelId)?.name || skill.modelId}</span>` : ''}
        <div class="skill-list-btns">
          ${!skill.builtIn ? `<button class="btn-icon btn-icon-sm skill-edit-btn" data-id="${skill.id}" title="Modifier">✏️</button>` : ''}
          ${!skill.builtIn ? `<button class="btn-icon btn-icon-sm skill-delete-btn" data-id="${skill.id}" title="Supprimer">✕</button>` : '<span class="skill-builtin-badge">défaut</span>'}
        </div>`;

      if (!skill.builtIn) {
        item.querySelector('.skill-edit-btn').addEventListener('click', () => openSkillEdit(skill));
        item.querySelector('.skill-delete-btn').addEventListener('click', () => {
          Storage.deleteSkill(cu?.id, skill.id);
          // Si ce skill était actif, le désactiver
          if (Storage.getActiveSkillId(cu?.id) === skill.id) Storage.setActiveSkillId(cu?.id, null);
          renderSkillsList();
          renderSkillsChips();
        });
      }
      list.appendChild(item);
    }
  }

  function renderUsersList() {
    const users      = Storage.getUsers();
    const currentId  = Storage.getCurrentUser()?.id;
    const list       = $('usersList');
    list.innerHTML   = '';

    for (const user of users) {
      const item = document.createElement('div');
      item.className = 'user-item' + (user.id === currentId ? ' active' : '');
      item.innerHTML = `
        <span class="user-item-avatar" title="Changer l'emoji" data-uid="${user.id}">${user.avatar}</span>
        <span class="user-item-name">${escapeHtml(user.name)}</span>
        <button class="user-delete-btn" data-id="${user.id}">✕</button>`;

      // Clic sur l'avatar → ouvrir le picker
      item.querySelector('.user-item-avatar').addEventListener('click', (e) => {
        e.stopPropagation();
        openEmojiPicker(e.currentTarget, (emoji) => {
          Storage.updateUserAvatar(user.id, emoji);
          renderUsersList();
          if (Storage.getCurrentUser()?.id === user.id) renderCurrentUser();
        });
      });

      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('user-delete-btn')) return;
        if (e.target.classList.contains('user-item-avatar')) return;
        Storage.setCurrentUser(user.id);
        renderCurrentUser();
        renderSkillsChips();
        renderUsersList();
        // Recharger les conversations cloisonnées de cet utilisateur
        const lastId = Storage.getCurrentConvId();
        const convs  = Storage.getConversations();
        if (lastId && convs.find(c => c.id === lastId)) {
          loadConversation(lastId);
        } else if (convs.length > 0) {
          loadConversation(convs[0].id);
        } else {
          newConversation();
        }
        $('usersModal').classList.remove('open');
        toast(`Connecté en tant que ${user.name}`, 'info', 1500);
      });

      item.querySelector('.user-delete-btn').addEventListener('click', () => {
        if (!Storage.deleteUser(user.id)) {
          toast('Impossible de supprimer le seul utilisateur.', 'error');
          return;
        }
        renderCurrentUser();
        renderUsersList();
      });

      list.appendChild(item);
    }
  }

  // ── Paramètres ────────────────────────────────
  function openSettings() {
    const s = Storage.getSettings();
    $('geminiKeyInput').value       = s.geminiKey      || '';
    $('anthropicKeyInput').value    = s.anthropicKey   || '';
    $('perplexityKeyInput').value   = s.perplexityKey  || '';
    $('deepseekKeyInput').value     = s.deepseekKey    || '';
    $('qwenKeyInput').value         = s.qwenKey        || '';
    $('openrouterKeyInput') && ($('openrouterKeyInput').value = s.openrouterKey || '');
    $('mistralKeyInput') && ($('mistralKeyInput').value = s.mistralKey || '');
    $('tempInput').value         = s.temperature  ?? 0.7;
    $('tempValue').textContent   = s.temperature  ?? 0.7;
    $('maxTokensInput').value    = s.maxTokens    ?? 4096;
    $('systemPromptInput').value = s.systemPrompt || '';
    $('speechRate').value        = s.speechRate   ?? 1.0;
    $('speechRateValue').textContent = s.speechRate ?? 1.0;

    // Populate voice list
    populateVoiceSelect(s.ttsVoice || '');

    // Budget
    const budget = s.budget || { dailyLimit: 0, weeklyLimit: 0, monthlyLimit: 0, blockOnLimit: false };
    $('budgetDailyInput').value       = budget.dailyLimit   ?? 0;
    $('budgetWeeklyInput') && ($('budgetWeeklyInput').value = budget.weeklyLimit ?? 0);
    $('budgetMonthlyInput').value     = budget.monthlyLimit ?? 0;
    $('budgetBlockInput').checked     = budget.blockOnLimit ?? false;
    refreshBudgetBars();

    // Mémoire longue — charger la mémoire de l'utilisateur courant
    const cu = Storage.getCurrentUser();
    $('memoryUserLabel').textContent = cu?.name || 'Utilisateur';
    $('memoryInput').value = Storage.getMemory(cu?.id);
    updateMemoryCount();

    $('settingsModal').classList.add('open');
  }

  function updateMemoryCount() {
    const len = $('memoryInput').value.length;
    $('memoryCount').textContent = `${len} / 4000 caractères`;
    $('memoryCount').style.color = len > 3500 ? 'var(--accent)' : '';
  }

  async function populateVoiceSelect(currentVoice) {
    const sel    = $('voiceSelect');
    const voices = await Speech.getVoicesAsync();
    sel.innerHTML = '<option value="">Voix par défaut</option>';
    for (const v of voices) {
      const opt   = document.createElement('option');
      opt.value   = v.name;
      opt.text    = `${v.name} (${v.lang})`;
      opt.selected = v.name === currentVoice;
      sel.appendChild(opt);
    }
  }

  function closeSettings() { $('settingsModal').classList.remove('open'); }

  // ── Usage modal ───────────────────────────────
  let currentUsageDays = 1;

  function openUsage() {
    currentUsageDays = 1;
    document.querySelectorAll('.usage-tab').forEach(t => {
      t.classList.toggle('active', parseInt(t.dataset.days) === 1);
    });
    renderUsageContent();
    $('usageModal').classList.add('open');
  }

  function closeUsage() { $('usageModal').classList.remove('open'); }

  // ── Couleurs par modèle (graphiques) ─────────
  const MODEL_CHART_COLORS = {
    // Google Gemini — texte
    'gemini-3.1-pro-preview':              '#4285F4',
    'gemini-3-flash-preview':              '#70A9F6',
    'gemini-2.5-pro':                      '#2563EB',
    'gemini-2.5-flash':                    '#3B82F6',
    'gemini-2.0-flash':                    '#60A5FA',
    'gemini-2.0-flash-lite-001':           '#93C5FD',
    // Gemini Image — teintes violettes pour les distinguer
    'gemini-3-pro-image-preview':          '#6D28D9',
    'gemini-3.1-flash-image-preview':      '#7C3AED',
    'gemini-2.5-flash-image':              '#8B5CF6',
    // Perplexity
    'sonar-pro':                           '#0891B2',
    'sonar':                               '#06B6D4',
    'sonar-reasoning-pro':                 '#22D3EE',
    'sonar-reasoning':                     '#67E8F9',
    'r1-1776':                             '#A5F3FC',
    // DeepSeek — teintes orange
    'deepseek-chat':                       '#F97316',
    'deepseek-reasoner':                   '#FB923C',
    // Qwen — teintes vert émeraude
    'qwen-max':                            '#059669',
    'qwen-plus':                           '#10B981',
    'qwen-turbo':                          '#34D399',
    // Anthropic Claude
    'claude-opus-4-6':                     '#CC1B1B',
    'claude-sonnet-4-6':                   '#E52020',
    'claude-haiku-4-5-20251001':           '#FF6B6B',
    // Mistral — teintes orange/ambre
    'mistral-large-latest':               '#FF7000',
    'mistral-small-latest':               '#FF8C2A',
    'mistral-small-2503':                  '#FFAA55',
    'ministral-8b-latest':                '#FFC27A',
    // MiniMax — teintes teal
    'minimax/minimax-m2.7':               '#0D9488',
    'minimax/minimax-m2.5':               '#14B8A6',
    'minimax/minimax-m2.5:free':          '#5EEAD4',
    // DeepSeek via OpenRouter — teintes orange-brun (distincts du direct)
    'deepseek/deepseek-v3.2':             '#D97706',
    'deepseek/deepseek-r1':               '#F59E0B',
    // MiMo (Xiaomi) — teintes rose/fuchsia
    'xiaomi/mimo-v2-pro':                 '#BE185D',
    'xiaomi/mimo-v2-omni':                '#EC4899',
    'xiaomi/mimo-v2-flash':               '#F9A8D4',
    // OpenRouter image gen — teintes indigo
    'black-forest-labs/flux-1.1-pro':     '#4338CA',
    'black-forest-labs/flux-2-klein':     '#6366F1',
    'ideogram-ai/ideogram-v3':            '#818CF8',
    'recraft-ai/recraft-v4':              '#A5B4FC',
    'bytedance/seedream-4.5':             '#C7D2FE',
  };
  const CHART_FALLBACK = ['#4285F4','#06B6D4','#CC1B1B','#F59E0B','#8B5CF6','#10B981'];
  function modelColor(id, idx) {
    return MODEL_CHART_COLORS[id] || CHART_FALLBACK[idx % CHART_FALLBACK.length];
  }

  // ── Cartes résumé ─────────────────────────────
  function renderSummaryCards(data, totalCost) {
    const allIn  = Object.values(data).reduce((s, d) => s + d.input,  0);
    const allOut = Object.values(data).reduce((s, d) => s + d.output, 0);
    const top    = Object.entries(data).sort((a, b) =>
      (b[1].input + b[1].output) - (a[1].input + a[1].output))[0];
    const topName = top ? (getModelById(top[0])?.name || top[0]) : '—';
    return `<div class="usage-summary-cards">
      <div class="usage-card">
        <div class="usage-card-value">${fmtNum(allIn + allOut)}</div>
        <div class="usage-card-label">Tokens totaux</div>
      </div>
      <div class="usage-card">
        <div class="usage-card-value">${fmtNum(allIn)}</div>
        <div class="usage-card-label">Entrée</div>
      </div>
      <div class="usage-card">
        <div class="usage-card-value">${fmtNum(allOut)}</div>
        <div class="usage-card-label">Sortie</div>
      </div>
      <div class="usage-card usage-card-accent">
        <div class="usage-card-value">$${totalCost.toFixed(3)}</div>
        <div class="usage-card-label">Coût estimé</div>
      </div>
      <div class="usage-card">
        <div class="usage-card-value usage-card-model" title="${escapeHtml(topName)}">${escapeHtml(topName)}</div>
        <div class="usage-card-label">Modèle principal</div>
      </div>
    </div>`;
  }

  // ── Graphique camembert (donut) ───────────────
  function renderDonutChart(data) {
    const ids = Object.keys(data);
    const vals = {};
    let total = 0;
    ids.forEach(id => {
      const cfg = getModelById(id);
      const d   = data[id];
      const p   = cfg?.pricing;
      const v   = p
        ? cfg?.type === 'image'
          ? (d.images || 0) * (p.perImage || 0)
          : (d.input / 1e6) * (p.inputPer1M || 0) + (d.output / 1e6) * (p.outputPer1M || 0)
        : d.input + d.output;
      vals[id] = v;
      total   += v;
    });
    if (total === 0) return '';

    const r = 52, cx = 68, cy = 68;
    const circ = 2 * Math.PI * r;
    let slices = '', cumul = 0;
    const segs = [];

    ids.forEach((id, idx) => {
      const frac = vals[id] / total;
      if (frac < 0.005) return;
      const dLen = frac * circ;
      const dOff = circ * 0.25 - cumul * circ;
      const col  = modelColor(id, idx);
      slices += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="24" stroke-dasharray="${dLen.toFixed(2)} ${(circ - dLen).toFixed(2)}" stroke-dashoffset="${dOff.toFixed(2)}"/>`;
      segs.push({ id, frac, col });
      cumul += frac;
    });

    const useCost = ids.some(id => getModelById(id)?.pricing);
    const centerVal = useCost ? '$' + total.toFixed(2) : fmtNum(Math.round(total));

    const legend = segs.map(s => {
      const name = getModelById(s.id)?.name || s.id;
      return `<div class="chart-legend-item">
        <span class="chart-legend-dot" style="background:${s.col}"></span>
        <span class="chart-legend-name">${escapeHtml(name)}</span>
        <span class="chart-legend-pct">${Math.round(s.frac * 100)}%</span>
      </div>`;
    }).join('');

    return `<div class="chart-card">
      <div class="chart-title">Répartition des coûts</div>
      <div class="chart-donut-wrapper">
        <svg width="136" height="136" viewBox="0 0 136 136" class="chart-donut-svg">
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="24"/>
          ${slices}
          <text x="${cx}" y="${cy - 5}" text-anchor="middle" class="donut-center-label">${centerVal}</text>
          <text x="${cx}" y="${cy + 11}" text-anchor="middle" class="donut-center-sub">coût total</text>
        </svg>
        <div class="chart-legend">${legend}</div>
      </div>
    </div>`;
  }

  // ── Graphique barres (tokens/jour) ────────────
  function renderBarChart(days) {
    const usage   = Storage.getUsage();
    const now     = new Date();
    const numDays = days === 1 ? 7 : (days === 0 || days > 30) ? 30 : days;

    const daily = [];
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const day = usage[key] || {};
      let inp = 0, out = 0;
      for (const m of Object.values(day)) { inp += m.input || 0; out += m.output || 0; }
      daily.push({
        label: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        input: inp, output: out, total: inp + out,
      });
    }

    const maxT  = Math.max(...daily.map(d => d.total), 1);
    const svgW  = 360, svgH = 140;
    const pL = 36, pR = 8, pT = 8, pB = 28;
    const cW = svgW - pL - pR, cH = svgH - pT - pB;
    const gap  = cW / numDays;
    const barW = Math.max(3, Math.min(18, gap * 0.65));

    let bars = '', xlbls = '';
    daily.forEach((d, i) => {
      const x    = pL + gap * i + gap / 2;
      const yBot = pT + cH;
      const totH = (d.total / maxT) * cH;
      const inH  = (d.input  / maxT) * cH;
      const outH = totH - inH;
      if (d.total > 0) {
        bars += `<rect x="${(x-barW/2).toFixed(1)}" y="${(yBot-totH).toFixed(1)}" width="${barW}" height="${outH.toFixed(1)}" fill="var(--accent)" opacity="0.75" rx="2"/>`;
        bars += `<rect x="${(x-barW/2).toFixed(1)}" y="${(yBot-inH).toFixed(1)}"  width="${barW}" height="${inH.toFixed(1)}"  fill="var(--provider-gemini)" opacity="0.55" rx="2"/>`;
      }
      const show = numDays <= 10 || i % Math.ceil(numDays / 10) === 0 || i === numDays - 1;
      if (show) xlbls += `<text x="${x.toFixed(1)}" y="${svgH - 3}" text-anchor="middle" class="chart-axis-label">${d.label}</text>`;
    });

    let yaxis = '';
    for (let t = 0; t <= 3; t++) {
      const val = maxT * t / 3;
      const y   = pT + cH - (val / maxT) * cH;
      const lbl = val >= 1e6 ? (val/1e6).toFixed(1)+'M' : val >= 1e3 ? Math.round(val/1e3)+'k' : Math.round(val).toString();
      yaxis += `<text x="${pL-3}" y="${(y+4).toFixed(1)}" text-anchor="end" class="chart-axis-label">${lbl}</text>`;
      if (t > 0) yaxis += `<line x1="${pL}" y1="${y.toFixed(1)}" x2="${svgW-pR}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="0.8" opacity="0.6"/>`;
    }

    const subtitle = days === 1 ? '(7 derniers jours)' : '';
    return `<div class="chart-card">
      <div class="chart-title">Tokens par jour <span class="chart-subtitle">${subtitle}</span></div>
      <svg width="100%" viewBox="0 0 ${svgW} ${svgH}" class="chart-svg">${yaxis}${bars}${xlbls}</svg>
      <div class="chart-bar-legend">
        <span><span class="chart-legend-dot" style="background:var(--provider-gemini);opacity:.55;display:inline-block"></span> Entrée</span>
        <span><span class="chart-legend-dot" style="background:var(--accent);opacity:.75;display:inline-block"></span> Sortie</span>
      </div>
    </div>`;
  }

  // ── Rendu usage principal ─────────────────────
  function renderUsageContent() {
    const data   = Storage.getUsageForPeriod(currentUsageDays);
    const models = Object.keys(data);
    const el     = $('usageContent');

    if (models.length === 0) {
      el.innerHTML = '<p class="usage-empty">Aucune donnée pour cette période.</p>';
      return;
    }

    // Calcul des coûts par modèle
    let totalCost = 0;
    const modelCosts = {};
    for (const modelId of models) {
      const cfg     = getModelById(modelId);
      const d       = data[modelId];
      const price   = cfg?.pricing;
      const isImage = cfg?.type === 'image';
      const cost    = price
        ? isImage
          ? (d.images || 0) * (price.perImage || 0)
          : (d.input / 1e6) * (price.inputPer1M || 0) + (d.output / 1e6) * (price.outputPer1M || 0)
        : null;
      modelCosts[modelId] = { cost, isImage };
      if (cost !== null) totalCost += cost;
    }
    // Tri par coût décroissant
    const sortedModels = [...models].sort((a, b) => (modelCosts[b].cost ?? -1) - (modelCosts[a].cost ?? -1));
    let rows = '';
    for (const modelId of sortedModels) {
      const cfg = getModelById(modelId);
      const d   = data[modelId];
      const { cost, isImage } = modelCosts[modelId];

      const providerClass = cfg?.provider || '';
      const providerLabel = providerClass === 'imagen'     ? 'Gemini Image'
                          : providerClass === 'gemini'     ? 'Gemini'
                          : providerClass === 'perplexity' ? 'Perplexity'
                          : providerClass === 'deepseek'   ? 'DeepSeek'
                          : providerClass === 'qwen'       ? 'Qwen'
                          : 'Claude';
      const name    = cfg ? cfg.name : modelId;
      const pct     = totalCost > 0 && cost !== null ? (cost / totalCost * 100) : 0;
      const barPct  = Math.round(pct);
      const costStr = cost !== null ? '$' + cost.toFixed(4) : '—';
      const pctStr  = pct > 0 ? pct.toFixed(1) + '%' : '—';
      const inStr   = isImage ? (fmtNum(d.images || 0) + '\u00a0img') : fmtNum(d.input);
      const outStr  = isImage ? '—' : fmtNum(d.output);

      rows += '<tr>'
        + '<td>' + escapeHtml(name) + '<span class="usage-model-provider ' + providerClass + '">' + providerLabel + '</span></td>'
        + '<td class="usage-tokens">' + inStr + '</td>'
        + '<td class="usage-tokens">' + outStr + '</td>'
        + '<td class="usage-tokens">' + pctStr + '</td>'
        + '<td class="usage-cost"><div class="usage-cost-cell"><span>' + costStr + '</span>'
        + '<div class="usage-cost-bar-track"><div class="usage-cost-bar-fill" style="width:' + barPct + '%"></div></div>'
        + '</div></td>'
        + '</tr>';
    }

    el.innerHTML =
      renderSummaryCards(data, totalCost) +
      `<div class="charts-row">
        ${renderDonutChart(data)}
        ${renderBarChart(currentUsageDays)}
      </div>
      <table class="usage-table">
        <thead>
          <tr>
            <th>Modèle</th>
            <th>Tokens entrée</th>
            <th>Tokens sortie</th>
            <th>Part</th>
            <th>Coût estimé</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="usage-total">
            <td>Total</td>
            <td></td><td></td>
            <td>100%</td>
            <td>$${totalCost.toFixed(4)}</td>
          </tr>
        </tbody>
      </table>`;
  }

  function fmtNum(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    return String(n);
  }

  // ── Chargement clés depuis credentials.json ───
  async function loadDefaultKeys() {
    try {
      const res = await fetch('./credentials.json');
      if (!res.ok) return;
      const creds = await res.json();
      const s = Storage.getSettings();
      const updates = {};
      if (!s.geminiKey      && creds.gemini)      updates.geminiKey      = creds.gemini;
      if (!s.anthropicKey   && creds.anthropic)   updates.anthropicKey   = creds.anthropic;
      if (!s.perplexityKey  && creds.perplexity)  updates.perplexityKey  = creds.perplexity;
      if (!s.deepseekKey    && creds.deepseek)    updates.deepseekKey    = creds.deepseek;
      if (!s.qwenKey        && creds.qwen)        updates.qwenKey        = creds.qwen;
      if (!s.openrouterKey  && creds.openrouter)  updates.openrouterKey  = creds.openrouter;
      if (Object.keys(updates).length > 0) Storage.saveSettings(updates);
    } catch { /* credentials.json absent ou invalide — mode VPS normal */ }
  }

  // ── Modal Clés API ─────────────────────────────
  const API_PROVIDERS = [
    { id: 'gemini',      storageKey: 'geminiKey',      label: 'Google Gemini',    dot: 'var(--provider-gemini)',                placeholder: 'AIza…'    },
    { id: 'anthropic',   storageKey: 'anthropicKey',   label: 'Anthropic Claude', dot: 'var(--provider-anthropic)',             placeholder: 'sk-ant-…' },
    { id: 'perplexity',  storageKey: 'perplexityKey',  label: 'Perplexity',       dot: 'var(--provider-perplexity)',            placeholder: 'pplx-…'   },
    { id: 'deepseek',    storageKey: 'deepseekKey',    label: 'DeepSeek',         dot: 'var(--provider-deepseek)',              placeholder: 'sk-…'     },
    { id: 'qwen',        storageKey: 'qwenKey',        label: 'Qwen (Alibaba)',   dot: 'var(--provider-qwen)',                  placeholder: 'sk-mr-…'  },
    { id: 'mistral',     storageKey: 'mistralKey',     label: 'Mistral AI',       dot: 'var(--provider-mistral, #FF7000)',      placeholder: 'z9q6u…'   },
    { id: 'openrouter',  storageKey: 'openrouterKey',  label: 'OpenRouter',       dot: 'var(--provider-openrouter)',            placeholder: 'sk-or-…'  },
  ];

  // Statuts agrégés de chaque clé après validation (alimenté par testProviderKey)
  const apikeyStatuses = {};        // { providerId: 'valid' | 'invalid' | 'unknown' | 'testing' | 'format-error' | 'network-error' | 'unset' }
  const apikeyTestControllers = {}; // { providerId: AbortController } pour annuler les tests en vol

  // Libellés UI alignés sur Providers.STATUS
  const APIKEY_STATUS_LABELS = {
    unset:           '○ Non configurée',
    'format-error':  '⚠️ Format suspect',
    testing:         '⏳ Test en cours…',
    valid:           '✓ Valide',
    invalid:         '✗ Clé refusée',
    'network-error': '⚠️ Réseau / CORS',
    unknown:         '? Indéterminé',
  };

  function setApikeyStatusUI(providerId, statusKey, message) {
    const el = $('apikeyStatus_' + providerId);
    if (!el) return;
    el.textContent = APIKEY_STATUS_LABELS[statusKey] || statusKey;
    el.className   = 'apikey-status ' + statusKey;
    el.title       = message || '';
  }

  // Met à jour le dot global de la sidebar selon l'agrégat des statuts
  function refreshGlobalDot() {
    const btn = $('apikeysOpenBtn');
    if (!btn) return;
    const statuses = Object.values(apikeyStatuses);
    const anyValid   = statuses.includes('valid');
    const anyInvalid = statuses.includes('invalid') || statuses.includes('format-error');
    const anyWarn    = statuses.includes('network-error') || statuses.includes('unknown');
    const anyKey     = API_PROVIDERS.some(pr => !!Storage.getSettings()[pr.storageKey]);
    btn.classList.toggle('has-keys',    anyKey && (anyValid || !anyInvalid));
    btn.classList.toggle('has-invalid', anyInvalid && !anyValid);
    btn.classList.toggle('has-warning', !anyInvalid && anyWarn && !anyValid);
  }

  // Lance la validation live d'une clé pour un provider donné.
  // Si key omis → lit la valeur du champ input courant (permet de tester avant save).
  async function testProviderKey(providerId, key) {
    if (typeof Providers === 'undefined') return; // dépendance js/providers.js
    if (key === undefined) {
      const inp = $('apikeyInput_' + providerId);
      key = inp ? inp.value.trim() : '';
    }
    // Annule un test précédent en vol pour ce provider
    if (apikeyTestControllers[providerId]) {
      apikeyTestControllers[providerId].abort();
    }
    if (!key) {
      apikeyStatuses[providerId] = Providers.STATUS.unset;
      setApikeyStatusUI(providerId, 'unset');
      refreshGlobalDot();
      return;
    }
    const ctrl = new AbortController();
    apikeyTestControllers[providerId] = ctrl;
    apikeyStatuses[providerId] = Providers.STATUS.testing;
    setApikeyStatusUI(providerId, 'testing');

    const result = await Providers.validate(providerId, key, ctrl.signal);
    // Si un autre test a démarré entretemps, ignorer ce résultat
    if (apikeyTestControllers[providerId] !== ctrl) return;
    apikeyStatuses[providerId] = result.status;
    setApikeyStatusUI(providerId, result.status, result.message);
    refreshGlobalDot();
  }

  function refreshApikeysStatus() {
    const s = Storage.getSettings();
    for (const p of API_PROVIDERS) {
      const inp = $('apikeyInput_' + p.id);
      if (inp) inp.value = s[p.storageKey] || '';
      // Lance un test live pour chaque clé saisie (en arrière-plan)
      testProviderKey(p.id, s[p.storageKey] || '');
    }
    refreshGlobalDot();
  }

  function renderCustomProviders() {
    const container = $('customProvidersContainer');
    if (!container) return;
    const providers = Storage.getCustomProviders();
    if (providers.length === 0) {
      container.innerHTML = '<p class="apikeys-empty-custom">Aucun provider personnalisé pour l\'instant.</p>';
      return;
    }
    container.innerHTML = providers.map(p => `
      <div class="apikey-card apikey-card-custom" data-cpid="${escapeHtml(p.id)}">
        <div class="apikey-card-header">
          <span class="apikey-provider-dot" style="background:#6366f1"></span>
          <span class="apikey-provider-name">${escapeHtml(p.name)}</span>
          <span class="apikey-custom-modelid">${escapeHtml(p.modelId)}</span>
          <button class="btn-icon apikey-custom-delete" data-cpid="${escapeHtml(p.id)}" title="Supprimer ce provider">🗑</button>
        </div>
        <div class="apikey-input-row">
          <input type="password" class="apikey-card-input cprov-key-input" data-cpid="${escapeHtml(p.id)}"
            value="${escapeHtml(p.key)}" placeholder="Clé API" autocomplete="off">
          <button class="btn-icon cprov-toggle-vis" title="Voir / masquer">👁</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.cprov-toggle-vis').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = btn.previousElementSibling;
        if (!inp) return;
        inp.type = inp.type === 'password' ? 'text' : 'password';
        btn.textContent = inp.type === 'password' ? '👁' : '🙈';
      });
    });

    container.querySelectorAll('.apikey-custom-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        Storage.deleteCustomProvider(btn.dataset.cpid);
        syncCustomProvidersToConfig();
        buildModelDropdown();
        renderCustomProviders();
        toast('Provider supprimé', 'success');
      });
    });

    container.querySelectorAll('.cprov-key-input').forEach(inp => {
      inp.addEventListener('change', () => {
        Storage.updateCustomProviderKey(inp.dataset.cpid, inp.value.trim());
      });
    });
  }

  function openApikeysModal() {
    refreshApikeysStatus();
    renderCustomProviders();
    $('apikeysModal').classList.add('open');
  }

  function closeApikeysModal() {
    $('apikeysModal').classList.remove('open');
  }

  function initApiKeysModal() {
    // Alimenter les liens "🔗 Obtenir une clé" depuis le registre Providers
    if (typeof Providers !== 'undefined') {
      for (const p of API_PROVIDERS) {
        const link = $('apikeyGetlink_' + p.id);
        const meta = Providers.get(p.id);
        if (link && meta && meta.getKeyUrl) link.href = meta.getKeyUrl;
      }
    }

    // Ouvrir depuis le bouton sidebar
    const openBtn = $('apikeysOpenBtn');
    if (openBtn) openBtn.addEventListener('click', openApikeysModal);

    // Fermer
    const closeBtn = $('closeApikeys');
    if (closeBtn) closeBtn.addEventListener('click', closeApikeysModal);
    const overlay = $('apikeysModal');
    if (overlay) overlay.addEventListener('click', e => { if (e.target === overlay) closeApikeysModal(); });

    // Toggle visibilité par clé
    document.querySelectorAll('.apikey-toggle-vis').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = $(btn.dataset.target);
        if (!inp) return;
        inp.type        = inp.type === 'password' ? 'text' : 'password';
        btn.textContent = inp.type === 'password' ? '👁' : '🙈';
      });
    });

    // Boutons "Supprimer" par clé
    document.querySelectorAll('.apikey-clear-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const prov = btn.dataset.provider;
        const inp  = $('apikeyInput_' + prov);
        if (inp) inp.value = '';
        apikeyStatuses[prov] = (typeof Providers !== 'undefined') ? Providers.STATUS.unset : 'unset';
        setApikeyStatusUI(prov, 'unset');
        refreshGlobalDot();
      });
    });

    // Test live au blur de chaque input (avec petit debounce sur les frappes)
    for (const p of API_PROVIDERS) {
      const inp = $('apikeyInput_' + p.id);
      if (!inp) continue;
      let typingTimer = null;
      inp.addEventListener('input', () => {
        clearTimeout(typingTimer);
        // Marquer "testing" immédiatement pour signaler que ça va se passer
        if (inp.value.trim()) setApikeyStatusUI(p.id, 'testing');
        typingTimer = setTimeout(() => testProviderKey(p.id), 600);
      });
      inp.addEventListener('blur', () => {
        clearTimeout(typingTimer);
        testProviderKey(p.id);
      });
    }

    // Ajouter un provider personnalisé
    // Preset selector : auto-fill model + show/hide endpoint field
    const presetSelect = $('cprov_preset');
    if (presetSelect) {
      presetSelect.addEventListener('change', () => {
        const opt = presetSelect.options[presetSelect.selectedIndex];
        const defaultModel = opt.dataset.model || '';
        if ($('cprov_model') && defaultModel) $('cprov_model').value = defaultModel;
        const isCustom = opt.value === 'custom';
        const endpointRow = $('cprov_endpoint_row');
        if (endpointRow) endpointRow.style.display = isCustom ? '' : 'none';
        if (!isCustom && $('cprov_endpoint')) $('cprov_endpoint').value = opt.dataset.endpoint || '';
      });
    }

    const addCustomBtn = $('addCustomProviderBtn');
    if (addCustomBtn) {
      addCustomBtn.addEventListener('click', () => {
        const preset   = $('cprov_preset');
        const opt      = preset ? preset.options[preset.selectedIndex] : null;
        const name     = opt && opt.value && opt.value !== 'custom' ? opt.text : (opt?.value === 'custom' ? 'Custom' : '');
        const modelId  = $('cprov_model')?.value.trim();
        const endpoint = opt && opt.value !== 'custom'
          ? (opt.dataset.endpoint || '')
          : ($('cprov_endpoint')?.value.trim() || '');
        const key      = $('cprov_key')?.value.trim();
        if (!name || !modelId || !endpoint || !key) {
          toast('Choisissez un provider, un modèle et entrez votre clé API', 'error');
          return;
        }
        Storage.addCustomProvider(name, modelId, endpoint, key);
        if (preset) preset.value = '';
        ['cprov_model', 'cprov_endpoint', 'cprov_key'].forEach(id => { if ($(id)) $(id).value = ''; });
        const endpointRow = $('cprov_endpoint_row');
        if (endpointRow) endpointRow.style.display = 'none';
        syncCustomProvidersToConfig();
        buildModelDropdown();
        renderCustomProviders();
        toast('Provider "' + name + '" ajouté ✓', 'success');
      });
    }

    // Sauvegarder toutes les clés
    const saveBtn = $('saveApikeysModal');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const updates = {};
        for (const p of API_PROVIDERS) {
          const inp = $('apikeyInput_' + p.id);
          updates[p.storageKey] = inp ? inp.value.trim() : '';
        }
        Storage.saveSettings(updates);
        // Sync dans le modal Paramètres si ouvert
        if ($('geminiKeyInput'))      $('geminiKeyInput').value      = updates.geminiKey      || '';
        if ($('anthropicKeyInput'))   $('anthropicKeyInput').value   = updates.anthropicKey   || '';
        if ($('perplexityKeyInput'))  $('perplexityKeyInput').value  = updates.perplexityKey  || '';
        if ($('deepseekKeyInput'))    $('deepseekKeyInput').value    = updates.deepseekKey    || '';
        if ($('qwenKeyInput'))        $('qwenKeyInput').value        = updates.qwenKey        || '';
        if ($('mistralKeyInput'))     $('mistralKeyInput').value     = updates.mistralKey     || '';
        if ($('openrouterKeyInput'))  $('openrouterKeyInput').value  = updates.openrouterKey  || '';
        refreshApikeysStatus();
        toast('Clés API sauvegardées ✓', 'success');
        closeApikeysModal();
      });
    }
  }

  // ── Quick Folder Modal ────────────────────────
  const QUICK_FOLDER_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#ec4899','#8b5cf6','#06b6d4'];
  let   quickFolderTargetConvId = null;
  let   quickFolderSelectedColor = QUICK_FOLDER_COLORS[0];

  function openQuickFolderModal(convId) {
    quickFolderTargetConvId  = convId;
    quickFolderSelectedColor = QUICK_FOLDER_COLORS[0];
    const nameInp = $('quickFolderName');
    if (nameInp) nameInp.value = '';
    // Render color swatches
    const colorsEl = $('quickFolderColors');
    if (colorsEl) {
      colorsEl.innerHTML = QUICK_FOLDER_COLORS.map(c =>
        `<span class="qf-color-swatch${c === quickFolderSelectedColor ? ' selected' : ''}"
          data-color="${c}" style="background:${c}" title="${c}"></span>`
      ).join('');
      colorsEl.querySelectorAll('.qf-color-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
          quickFolderSelectedColor = sw.dataset.color;
          colorsEl.querySelectorAll('.qf-color-swatch').forEach(s => s.classList.remove('selected'));
          sw.classList.add('selected');
        });
      });
    }
    $('quickFolderModal').classList.add('open');
    setTimeout(() => nameInp && nameInp.focus(), 60);
  }

  function closeQuickFolderModal() {
    $('quickFolderModal').classList.remove('open');
    quickFolderTargetConvId = null;
  }

  function initQuickFolderModal() {
    const closeBtn = $('closeQuickFolderModal');
    if (closeBtn) closeBtn.addEventListener('click', closeQuickFolderModal);
    const overlay = $('quickFolderModal');
    if (overlay) overlay.addEventListener('click', e => { if (e.target === overlay) closeQuickFolderModal(); });

    const confirmBtn = $('quickFolderConfirm');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        const name = $('quickFolderName')?.value.trim();
        if (!name) { toast('Donnez un nom au dossier', 'error'); return; }
        const cu = Storage.getCurrentUser();
        const folderId = Storage.addFolder(cu?.id, name, quickFolderSelectedColor);
        const shouldMove = $('quickFolderMove')?.checked !== false;
        if (shouldMove && quickFolderTargetConvId) {
          Storage.setConvFolder(quickFolderTargetConvId, folderId);
        }
        renderConvList();
        closeQuickFolderModal();
        toast('Dossier "' + name + '" créé ✓', 'success');
      });
    }

    // Enter key shortcut
    const nameInp = $('quickFolderName');
    if (nameInp) {
      nameInp.addEventListener('keydown', e => {
        if (e.key === 'Enter') confirmBtn && confirmBtn.click();
      });
    }
  }

  // ── Initialisation ────────────────────────────
  function init() {
    // Storage
    Storage.init();

    // Pré-charger les clés depuis credentials.json (fire & forget — aucune clé n'est exposée dans le code)
    loadDefaultKeys();

    // Thème
    applyTheme(Storage.getTheme());

    // Taille de texte
    applyFontSize(Storage.getFontSize());

    // Modèle
    buildModelDropdown();
    updateModelDisplay(Storage.getModel());

    // Utilisateur
    renderCurrentUser();

    // Skills
    renderSkillsChips();

    // Conversations
    const lastId = Storage.getCurrentConvId();
    const convs  = Storage.getConversations();

    if (lastId && convs.find(c => c.id === lastId)) {
      currentConvId = lastId;
      loadConversation(lastId);
    } else if (convs.length > 0) {
      currentConvId = convs[0].id;
      loadConversation(convs[0].id);
    } else {
      newConversation();
    }

    // ── Event listeners ──

    // Nouvelle conversation
    $('newChatBtn').addEventListener('click', newConversation);

    // Envoi
    sendBtn.addEventListener('click', sendMessage);

    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) sendMessage();
      }
    });

    promptInput.addEventListener('input', () => {
      updateSendBtn();
      autoResizeTextarea();
    });

    // Voix
    voiceBtn.addEventListener('click', toggleVoice);
    ttsToggle.addEventListener('click', toggleTTS);

    // Fichiers
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        handleFiles(Array.from(fileInput.files));
        fileInput.value = '';
      }
    });

    // Drag & drop sur la zone principale
    $('mainContent').addEventListener('dragover', (e) => { e.preventDefault(); });
    $('mainContent').addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer.files.length > 0) {
        handleFiles(Array.from(e.dataTransfer.files));
      }
    });

    // Thèmes
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
    });

    // Taille de texte
    document.querySelectorAll('.fontsize-btn').forEach(btn => {
      btn.addEventListener('click', () => applyFontSize(btn.dataset.size));
    });

    // Copier code — délégation globale
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.code-copy-btn');
      if (!btn) return;
      const code = btn.closest('.code-block').querySelector('code').innerText;
      const apply = () => { btn.classList.add('copied'); setTimeout(() => btn.classList.remove('copied'), 2000); };
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(apply).catch(() => fallbackCopy(code, apply));
      } else {
        fallbackCopy(code, apply);
      }
    });

    function fallbackCopy(text, cb) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      try { document.execCommand('copy'); cb(); } catch {}
      document.body.removeChild(ta);
    }

    // Modèle dropdown
    modelSelectorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleModelDropdown();
    });

    document.addEventListener('click', (e) => {
      if (!modelSelector.contains(e.target)) closeModelDropdown();
    });

    // Providers personnalisés → sync dans MUNNIN_CONFIG dès le démarrage
    syncCustomProvidersToConfig();

    // Modal Clés API
    initApiKeysModal();
    refreshApikeysStatus(); // initialise l'état visuel du bouton sidebar

    // Lightbox
    const lbOverlay = $('lightboxOverlay');
    const lbClose   = $('lightboxClose');
    if (lbOverlay) lbOverlay.addEventListener('click', e => { if (e.target === lbOverlay) closeLightbox(); });
    if (lbClose)   lbClose.addEventListener('click', closeLightbox);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('lightboxOverlay')?.classList.contains('open')) closeLightbox(); });

    // Quick folder modal
    initQuickFolderModal();

    // Guide modal
    $('guideBtn').addEventListener('click', () => $('guideModal').classList.add('open'));
    $('closeGuide').addEventListener('click', () => $('guideModal').classList.remove('open'));
    $('guideModal').addEventListener('click', (e) => {
      if (e.target === $('guideModal')) $('guideModal').classList.remove('open');
    });

    // Usage modal
    $('usageBtn').addEventListener('click', openUsage);
    $('closeUsage').addEventListener('click', closeUsage);
    $('usageModal').addEventListener('click', (e) => {
      if (e.target === $('usageModal')) closeUsage();
    });

    document.querySelectorAll('.usage-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        currentUsageDays = parseInt(tab.dataset.days);
        document.querySelectorAll('.usage-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderUsageContent();
      });
    });

    $('clearUsageBtn').addEventListener('click', () => {
      if (!confirm('Effacer toutes les données d\'utilisation ?')) return;
      Storage.clearUsage();
      renderUsageContent();
    });

    // Paramètres
    $('settingsBtn').addEventListener('click', openSettings);
    $('closeSettings').addEventListener('click', closeSettings);

    $('settingsModal').addEventListener('click', (e) => {
      if (e.target === $('settingsModal')) closeSettings();
    });

    $('saveApiKeys').addEventListener('click', () => {
      Storage.saveSettings({
        geminiKey:      $('geminiKeyInput').value.trim(),
        anthropicKey:   $('anthropicKeyInput').value.trim(),
        perplexityKey:  $('perplexityKeyInput').value.trim(),
        deepseekKey:    $('deepseekKeyInput').value.trim(),
        qwenKey:        $('qwenKeyInput').value.trim(),
        openrouterKey:  $('apikeyInput_openrouter') ? $('apikeyInput_openrouter').value.trim() : (Storage.getSettings().openrouterKey || ''),
        mistralKey:     $('mistralKeyInput') ? $('mistralKeyInput').value.trim() : '',
      });
      toast('Clés API sauvegardées ✓', 'success');
    });

    $('saveGenSettings').addEventListener('click', () => {
      Storage.saveSettings({
        temperature:  parseFloat($('tempInput').value),
        maxTokens:    parseInt($('maxTokensInput').value),
        systemPrompt: $('systemPromptInput').value,
        speechRate:   parseFloat($('speechRate').value),
        ttsVoice:     $('voiceSelect').value,
      });
      toast('Paramètres sauvegardés ✓', 'success');
    });

    $('tempInput').addEventListener('input', () => {
      $('tempValue').textContent = $('tempInput').value;
    });

    $('speechRate').addEventListener('input', () => {
      $('speechRateValue').textContent = parseFloat($('speechRate').value).toFixed(1);
    });

    // Mémoire longue
    $('memoryInput').addEventListener('input', updateMemoryCount);

    $('saveMemory').addEventListener('click', () => {
      const cu = Storage.getCurrentUser();
      Storage.setMemory(cu?.id, $('memoryInput').value);
      toast('Mémoire sauvegardée ✓', 'success');
    });

    $('extractMemoryBtn').addEventListener('click', async () => {
      const convId = Storage.getCurrentConvId();
      const conv   = convId ? Storage.getConversation(convId) : null;
      if (!conv || conv.messages.length < 2) {
        toast('Pas de conversation active à analyser', 'error');
        return;
      }

      const btn = $('extractMemoryBtn');
      btn.disabled    = true;
      btn.textContent = 'Extraction en cours…';

      const modelId  = Storage.getModel();
      const settings = Storage.getSettings();
      const extractionMessages = [
        ...conv.messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: "Extrais les informations importantes sur l'utilisateur de cette conversation (préférences, faits personnels, compétences, contexte, sujets d'intérêt). Réponds uniquement avec 3-7 bullet points concis en français, chaque point commençant par \"- \". Aucune introduction, aucune conclusion." },
      ];

      let extracted = '';
      try {
        await new Promise((resolve, reject) => {
          API.stream({
            modelId,
            messages: extractionMessages,
            settings: { ...settings, userMemory: '' },
            onChunk: (_chunk, full) => { extracted = full; },
            onDone:  resolve,
            onError: reject,
          });
        });

        const cu       = Storage.getCurrentUser();
        const existing = $('memoryInput').value.trim();
        const dateTag  = `\n\n<!-- Extrait le ${new Date().toLocaleDateString('fr-FR')} -->\n`;
        $('memoryInput').value = (existing ? existing + dateTag : '') + extracted.trim();
        updateMemoryCount();
        Storage.setMemory(cu?.id, $('memoryInput').value);
        toast('Mémoire mise à jour ✓', 'success');
      } catch {
        toast('Erreur lors de l\'extraction', 'error');
      } finally {
        btn.disabled    = false;
        btn.textContent = '⟳ Extraire de la conversation en cours';
      }
    });

    // Visibilité clés API
    document.querySelectorAll('.toggle-visibility').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp  = $(btn.dataset.target);
        inp.type   = inp.type === 'password' ? 'text' : 'password';
        btn.textContent = inp.type === 'password' ? '👁' : '🙈';
      });
    });

    // Utilisateurs
    $('manageUsersBtn').addEventListener('click', () => {
      renderUsersList();
      $('usersModal').classList.add('open');
    });
    $('sidebarUser').addEventListener('click', (e) => {
      if (e.target.closest('#manageUsersBtn')) return;
      renderUsersList();
      $('usersModal').classList.add('open');
    });

    $('closeUsers').addEventListener('click', () => $('usersModal').classList.remove('open'));
    $('usersModal').addEventListener('click', (e) => {
      if (e.target === $('usersModal')) $('usersModal').classList.remove('open');
    });

    // Picker emoji pour nouvel utilisateur
    $('newUserAvatarBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      openEmojiPicker($('newUserAvatarBtn'), (emoji) => {
        $('newUserAvatarBtn').textContent = emoji;
      });
    });

    $('addUserBtn').addEventListener('click', () => {
      const name   = $('newUserName').value.trim();
      const avatar = $('newUserAvatarBtn').textContent.trim() || '🐺';
      if (!name) { toast('Entrez un nom d\'utilisateur', 'error'); return; }
      Storage.addUser(name, avatar);
      $('newUserName').value        = '';
      $('newUserAvatarBtn').textContent = '🐺';
      renderUsersList();
    });

    // Skills
    populateSkillModelSelect();

    $('manageSkillsBtn').addEventListener('click', () => {
      renderSkillsList();
      resetSkillForm();
      $('skillsModal').classList.add('open');
    });

    $('closeSkills').addEventListener('click', () => $('skillsModal').classList.remove('open'));
    $('skillsModal').addEventListener('click', (e) => {
      if (e.target === $('skillsModal')) $('skillsModal').classList.remove('open');
    });

    $('skillIconBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      openEmojiPicker($('skillIconBtn'), (emoji) => {
        $('skillIconBtn').textContent = emoji;
      });
    });

    $('skillTempInput').addEventListener('input', () => {
      const val = parseFloat($('skillTempInput').value);
      $('skillTempValue').textContent = val === -1 ? '—' : val.toFixed(2);
    });

    $('skillFormCancel').addEventListener('click', resetSkillForm);

    $('skillFormSave').addEventListener('click', () => {
      const name = $('skillNameInput').value.trim();
      if (!name) { toast('Entrez un nom pour le skill', 'error'); return; }
      const cu      = Storage.getCurrentUser();
      const editId  = $('skillEditId').value;
      const tempVal = parseFloat($('skillTempInput').value);
      const skillData = {
        name,
        icon:         $('skillIconBtn').textContent.trim() || '⭐',
        modelId:      $('skillModelSelect').value || null,
        temperature:  tempVal === -1 ? null : tempVal,
        maxTokens:    null,
        systemPrompt: $('skillPromptInput').value.trim(),
      };

      if (editId) {
        Storage.updateSkill(cu?.id, editId, skillData);
        toast('Skill mis à jour ✓', 'success');
      } else {
        Storage.addSkill(cu?.id, skillData);
        toast('Skill créé ✓', 'success');
      }
      renderSkillsList();
      renderSkillsChips();
      resetSkillForm();
    });

    // ── Snippets ──────────────────────────────────
    $('snippetsBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      const dd = $('snippetsDropdown');
      const isOpen = dd.classList.contains('open');
      closeSnippetsDropdown();
      if (!isOpen) {
        // position: fixed → calculer depuis le bouton pour échapper au overflow parent
        const rect = $('snippetsBtn').getBoundingClientRect();
        dd.style.left      = rect.left + 'px';
        dd.style.top       = (rect.top - 8) + 'px';
        dd.style.transform = 'translateY(-100%)';
        renderSnippetsDropdown();
        dd.classList.add('open');
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.snippets-wrap') && !e.target.closest('#snippetsDropdown')) closeSnippetsDropdown();
    });

    // Ouvrir la bibliothèque depuis le dropdown
    $('manageSnippetsBtn').addEventListener('click', () => {
      closeSnippetsDropdown();
      renderSnippetsList();
      resetSnippetForm();
      $('snippetsModal').classList.add('open');
    });

    // Bouton "+ Créer" dans le dropdown → ouvre le modal direct sur le formulaire
    $('snippetsDdAddBtn').addEventListener('click', () => {
      closeSnippetsDropdown();
      renderSnippetsList();
      resetSnippetForm();
      $('snippetsModal').classList.add('open');
      setTimeout(() => openNewSnippetForm(), 60);
    });

    // Bouton "+ Nouveau prompt" dans le header du modal
    $('newSnippetBtn').addEventListener('click', openNewSnippetForm);

    $('closeSnippets').addEventListener('click', () => $('snippetsModal').classList.remove('open'));
    $('snippetsModal').addEventListener('click', (e) => {
      if (e.target === $('snippetsModal')) $('snippetsModal').classList.remove('open');
    });

    $('snippetFormCancel').addEventListener('click', resetSnippetForm);

    $('snippetFormSave').addEventListener('click', () => {
      const title   = $('snippetTitleInput').value.trim();
      const content = $('snippetContentInput').value.trim();
      if (!title)   { toast('Entrez un titre pour le prompt', 'error'); return; }
      if (!content) { toast('Entrez le contenu du prompt', 'error'); return; }
      const cu     = Storage.getCurrentUser();
      const editId = $('snippetEditId').value;
      if (editId) {
        Storage.updateSnippet(cu?.id, editId, { title, content });
        toast('Prompt mis à jour ✓', 'success');
      } else {
        Storage.addSnippet(cu?.id, title, content);
        toast('Prompt enregistré ✓', 'success');
      }
      renderSnippetsList();
      resetSnippetForm();
    });

    // ── Skills export / import ────────────────────
    $('exportSkillsBtn').addEventListener('click', exportSkills);

    $('importSkillsInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importSkills(file);
      e.target.value = '';
    });

    // ── Hamburger mobile ─────────────────────────
    const sidebarEl      = $('sidebar');
    const sidebarOverlay = $('sidebarOverlay');

    function openSidebar() {
      sidebarEl.classList.add('open');
      sidebarOverlay.classList.add('visible');
    }
    function closeSidebarMobile() {
      sidebarEl.classList.remove('open');
      sidebarOverlay.classList.remove('visible');
    }

    $('sidebarToggleBtn')?.addEventListener('click', () => {
      sidebarEl.classList.contains('open') ? closeSidebarMobile() : openSidebar();
    });
    sidebarOverlay?.addEventListener('click', closeSidebarMobile);

    // Fermer la sidebar mobile quand on sélectionne une conversation
    document.addEventListener('convSelected', closeSidebarMobile);

    // ── Scroll-to-bottom button ───────────────────
    const scrollBtn  = $('scrollToBottomBtn');
    const convArea   = $('conversationArea');

    updateScrollBtn = function() {
      if (!scrollBtn || !convArea) return;
      const fromBottom = convArea.scrollHeight - convArea.scrollTop - convArea.clientHeight;
      scrollBtn.style.display = fromBottom > 150 ? '' : 'none';
    };

    convArea?.addEventListener('scroll', updateScrollBtn, { passive: true });

    scrollBtn?.addEventListener('click', () => {
      convArea?.scrollTo({ top: convArea.scrollHeight, behavior: 'smooth' });
    });

    // ── Token counter ────────────────────────────
    const tokenCounter = $('tokenCounter');
    const tokenVal     = $('tokenCountVal');

    function getConvTokenEstimate() {
      if (!currentConvId) return 0;
      const msgs = Storage.getMessages(currentConvId);
      const total = msgs.reduce((acc, m) => acc + Math.ceil((m.content || '').length / 4), 0);
      return total;
    }

    updateTokenCounter = function() {
      if (!tokenCounter || !tokenVal) return;
      const inputTokens = Math.ceil((promptInput.value.length) / 4);
      const convTokens  = getConvTokenEstimate();
      const total       = convTokens + inputTokens;
      if (total < 100) { tokenCounter.style.display = 'none'; return; }
      tokenCounter.style.display = '';
      tokenVal.textContent = total > 999 ? (total / 1000).toFixed(0) + 'k' : total;
      tokenCounter.className = 'token-counter';
      if (total > 800000) tokenCounter.classList.add('danger');
      else if (total > 400000) tokenCounter.classList.add('warn');
    };

    promptInput.addEventListener('input', updateTokenCounter);

    // ── Raccourcis clavier ────────────────────────
    document.addEventListener('keydown', (e) => {
      const ctrlOrCmd = e.ctrlKey || e.metaKey;

      // Ctrl/Cmd+N → nouvelle conversation
      if (ctrlOrCmd && !e.shiftKey && e.key === 'n') {
        const tag = document.activeElement?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          e.preventDefault();
          newConversation();
          toast('Nouvelle conversation', 'success', 1500);
          return;
        }
      }

      // Ctrl/Cmd+K → focus recherche conversations
      if (ctrlOrCmd && e.key === 'k') {
        e.preventDefault();
        const cs = $('convSearch');
        if (cs) { cs.focus(); cs.select(); }
        return;
      }

      // Escape → fermer le modal ouvert, la sidebar mobile, ou le dropdown modèle
      if (e.key === 'Escape') {
        if (sidebarEl.classList.contains('open') && window.innerWidth <= 768) {
          closeSidebarMobile();
          return;
        }
        const modals = ['skillsModal', 'snippetsModal', 'settingsModal', 'usageModal', 'guideModal', 'usersModal', 'apikeysModal', 'foldersModal', 'quickFolderModal'];
        for (const id of modals) {
          const el = $(id);
          if (el && el.classList.contains('open')) { el.classList.remove('open'); return; }
        }
        if (modelDropdown.classList.contains('open')) closeModelDropdown();
      }
    });

    // ── Budget ───────────────────────────────────
    $('saveBudget').addEventListener('click', () => {
      Storage.saveSettings({
        budget: {
          dailyLimit:   parseFloat($('budgetDailyInput').value)   || 0,
          weeklyLimit:  parseFloat($('budgetWeeklyInput')?.value  || '0') || 0,
          monthlyLimit: parseFloat($('budgetMonthlyInput').value) || 0,
          blockOnLimit: $('budgetBlockInput').checked,
        },
      });
      _budgetWarnedDaily   = false;
      _budgetWarnedMonthly = false;
      refreshBudgetBars();
      toast('Budget sauvegardé ✓', 'success');
    });

    // ── Recherche conversations ───────────────────
    const convSearch      = $('convSearch');
    const convSearchClear = $('convSearchClear');
    if (convSearch) {
      convSearch.addEventListener('input', () => {
        const q = convSearch.value.trim();
        convSearchClear.style.display = q ? '' : 'none';
        renderConvList(q);
      });
      convSearchClear.addEventListener('click', () => {
        convSearch.value              = '';
        convSearchClear.style.display = 'none';
        renderConvList('');
      });
    }

    // ── Dossiers & Tags ───────────────────────────
    $('newFolderBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      renderFoldersList();
      renderTagsList();
      $('foldersModal').classList.add('open');
    });
    $('closeFolders').addEventListener('click', () => $('foldersModal').classList.remove('open'));
    $('foldersModal').addEventListener('click', (e) => {
      if (e.target === $('foldersModal')) $('foldersModal').classList.remove('open');
    });
    $('addFolderBtn').addEventListener('click', () => {
      const name  = $('newFolderName').value.trim();
      const color = $('newFolderColor').value;
      if (!name) { toast('Entrez un nom de dossier', 'error'); return; }
      const cu = Storage.getCurrentUser();
      Storage.addFolder(cu?.id, name, color);
      $('newFolderName').value = '';
      renderFoldersList();
      renderConvList();
      toast('Dossier créé ✓', 'success', 1500);
    });
    $('addTagBtn').addEventListener('click', () => {
      const name  = $('newTagName').value.trim();
      const color = $('newTagColor').value;
      if (!name) { toast('Entrez un nom d\'étiquette', 'error'); return; }
      const cu = Storage.getCurrentUser();
      Storage.addTag(cu?.id, name, color);
      $('newTagName').value = '';
      renderTagsList();
      renderConvList();
      toast('Étiquette créée ✓', 'success', 1500);
    });

    // Fermer menus export au clic dehors
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.conv-export-wrap')) {
        document.querySelectorAll('.conv-export-menu.open').forEach(m => m.classList.remove('open'));
      }
    });

    // ── Format image buttons ──────────────────────
    document.querySelectorAll('.image-format-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        imageAspectRatio = btn.dataset.ratio;
        document.querySelectorAll('.image-format-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // ── Optimize prompt button ────────────────────
    if (optimizeBtn) optimizeBtn.addEventListener('click', optimizePrompt);

    if (webSearchBtn) {
      webSearchBtn.addEventListener('click', () => {
        webSearchEnabled = !webSearchEnabled;
        webSearchBtn.classList.toggle('active', webSearchEnabled);
        webSearchBtn.title = webSearchEnabled ? 'Recherche web activée (cliquer pour désactiver)' : 'Activer la recherche web';
        toast(webSearchEnabled ? '🔍 Recherche web activée' : '🔍 Recherche web désactivée', 'info', 1500);
      });
    }

    // Focus initial
    promptInput.focus();
  }

  // ── Gestion dossiers & tags ───────────────────
  function renderFoldersList() {
    const cu      = Storage.getCurrentUser();
    const folders = Storage.getFolders(cu?.id);
    const list    = $('foldersList');
    if (!list) return;
    list.innerHTML = '';
    if (folders.length === 0) {
      list.innerHTML = '<div class="folders-empty">Aucun dossier</div>';
      return;
    }
    for (const f of folders) {
      const row = document.createElement('div');
      row.className = 'folder-item';
      row.innerHTML = '<span class="folder-item-dot" style="background:' + f.color + '"></span>'
        + '<span class="folder-item-name">' + escapeHtml(f.name) + '</span>'
        + '<button class="folder-item-del" data-id="' + f.id + '" title="Supprimer">✕</button>';
      row.querySelector('.folder-item-del').addEventListener('click', () => {
        if (!confirm('Supprimer le dossier "' + f.name + '" ? Les conversations seront déplacées vers "Sans dossier".')) return;
        Storage.deleteFolder(cu?.id, f.id);
        renderFoldersList();
        renderConvList();
      });
      list.appendChild(row);
    }
  }

  function renderTagsList() {
    const cu   = Storage.getCurrentUser();
    const tags = Storage.getTags(cu?.id);
    const list = $('tagsList');
    if (!list) return;
    list.innerHTML = '';
    if (tags.length === 0) {
      list.innerHTML = '<div class="folders-empty">Aucune étiquette</div>';
      return;
    }
    for (const t of tags) {
      const row = document.createElement('div');
      row.className = 'folder-item';
      row.innerHTML = '<span class="folder-item-dot" style="background:' + t.color + '"></span>'
        + '<span class="folder-item-name">' + escapeHtml(t.name) + '</span>'
        + '<button class="folder-item-del" data-id="' + t.id + '" title="Supprimer">✕</button>';
      row.querySelector('.folder-item-del').addEventListener('click', () => {
        Storage.deleteTag(cu?.id, t.id);
        renderTagsList();
        renderConvList();
      });
      list.appendChild(row);
    }
  }

  // ── Prompts prédéfinis (modèles) ──────────────
  const PROMPT_TEMPLATES = [
    // Écriture
    { category: 'Écriture', icon: '✍️', title: 'Améliorer le style',
      content: 'Réécris ce texte en améliorant le style et la clarté, tout en conservant fidèlement le sens original :\n\n[colle ton texte ici]' },
    { category: 'Écriture', icon: '✍️', title: 'Email professionnel',
      content: 'Rédige un email professionnel, courtois et concis sur le sujet suivant :\n\n[décris le sujet et le contexte]' },
    { category: 'Écriture', icon: '✍️', title: 'Résumé en 3 points',
      content: 'Résume le texte suivant en exactement 3 points clés, chacun formulé en une seule phrase percutante :\n\n[colle ton texte ici]' },
    { category: 'Écriture', icon: '✍️', title: 'Correction orthographe',
      content: 'Corrige toutes les fautes d\'orthographe, de grammaire et de ponctuation dans ce texte. Retourne uniquement le texte corrigé, sans commentaires :\n\n[colle ton texte ici]' },
    // Analyse
    { category: 'Analyse', icon: '🔍', title: 'Analyser un texte',
      content: 'Analyse ce texte en identifiant : les arguments principaux, les points forts, les points faibles, et la conclusion générale :\n\n[colle ton texte ici]' },
    { category: 'Analyse', icon: '🔍', title: 'Pour / Contre',
      content: 'Liste de façon structurée les avantages et les inconvénients pour :\n\n[décris le sujet]' },
    { category: 'Analyse', icon: '🔍', title: 'Décomposer un problème',
      content: 'Décompose ce problème en étapes simples et logiques, puis propose une solution concrète et réaliste :\n\n[décris ton problème]' },
    // Code
    { category: 'Code', icon: '💻', title: 'Expliquer du code',
      content: 'Explique ce code de façon claire et pédagogique : ce qu\'il fait, comment il fonctionne, et ses éventuels points d\'attention :\n\n```\n[colle ton code ici]\n```' },
    { category: 'Code', icon: '💻', title: 'Révision de code',
      content: 'Révise ce code et identifie : les bugs potentiels, les problèmes de performance, les mauvaises pratiques, et les failles de sécurité éventuelles :\n\n```\n[colle ton code ici]\n```' },
    { category: 'Code', icon: '💻', title: 'Écrire des tests',
      content: 'Écris des tests unitaires complets pour la fonction suivante. Couvre les cas normaux, les cas limites et les cas d\'erreur :\n\n```\n[colle ta fonction ici]\n```' },
    { category: 'Code', icon: '💻', title: 'Documenter le code',
      content: 'Ajoute une documentation complète et claire (JSDoc / docstrings selon le langage) à ce code :\n\n```\n[colle ton code ici]\n```' },
    // Productivité
    { category: 'Productivité', icon: '⚡', title: 'Plan d\'action',
      content: 'Crée un plan d\'action détaillé et réaliste pour atteindre l\'objectif suivant. Inclus les étapes concrètes, les délais suggérés et les ressources nécessaires :\n\n[décris ton objectif]' },
    { category: 'Productivité', icon: '⚡', title: 'Brainstorming',
      content: 'Génère 10 idées créatives et originales sur le sujet suivant. Sois varié, surprenant, et concis pour chaque idée :\n\n[décris ton sujet]' },
    { category: 'Productivité', icon: '⚡', title: 'Expliquer simplement',
      content: 'Explique ce concept de manière simple et accessible, comme si tu parlais à quelqu\'un sans connaissances techniques :\n\n[décris le concept]' },
    { category: 'Productivité', icon: '⚡', title: 'Compte-rendu de réunion',
      content: 'Rédige un compte-rendu structuré à partir de ces notes de réunion. Inclus : contexte, décisions prises, actions à suivre avec responsables :\n\n[colle tes notes]' },
    // Créatif
    { category: 'Créatif', icon: '🎨', title: 'Idées de contenu',
      content: 'Propose 5 idées de contenu originales et engageantes sur le thème suivant, en précisant le format et l\'angle pour chacune :\n\n[décris ton thème et ta cible]' },
    { category: 'Créatif', icon: '🎨', title: 'Prompt d\'image',
      content: 'Génère un prompt détaillé pour créer une image IA sur le thème suivant. Inclus : style artistique, composition, palette de couleurs, ambiance, éclairage :\n\n[décris ton idée]' },
  ];

  const PROMPT_TEMPLATE_CATEGORIES = ['Écriture', 'Analyse', 'Code', 'Productivité', 'Créatif'];
  const PROMPT_CAT_COLORS = { 'Écriture': '#6366f1', 'Analyse': '#3b82f6', 'Code': '#10b981', 'Productivité': '#f59e0b', 'Créatif': '#ec4899' };

  // ── Snippets de prompts ───────────────────────
  function renderSnippetsList() {
    const cu       = Storage.getCurrentUser();
    const snippets = Storage.getSnippets(cu?.id);
    const list     = $('snippetsList');
    list.innerHTML = '';

    if (snippets.length === 0) {
      const empty = document.createElement('div');
      empty.className   = 'folders-empty';
      empty.textContent = 'Aucun prompt enregistré — ajoutez-en un ou choisissez un modèle ci-dessous.';
      list.appendChild(empty);
      // Ne pas retourner : afficher quand même la galerie
    }

    for (const snip of snippets) {
      const item = document.createElement('div');
      item.className = 'skill-list-item';

      const icon = document.createElement('span');
      icon.className = 'skill-list-icon';
      icon.textContent = '📝';

      const name = document.createElement('span');
      name.className   = 'skill-list-name';
      name.textContent = snip.title;

      const btns = document.createElement('div');
      btns.className = 'skill-list-btns';

      const editBtn = document.createElement('button');
      editBtn.className   = 'btn-icon btn-icon-sm';
      editBtn.title       = 'Modifier';
      editBtn.textContent = '✏️';
      editBtn.addEventListener('click', () => openSnippetEdit(snip));

      const delBtn = document.createElement('button');
      delBtn.className   = 'btn-icon btn-icon-sm';
      delBtn.title       = 'Supprimer';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => {
        Storage.deleteSnippet(cu?.id, snip.id);
        renderSnippetsList();
        renderSnippetsDropdown();
      });

      btns.appendChild(editBtn);
      btns.appendChild(delBtn);
      item.appendChild(icon);
      item.appendChild(name);
      item.appendChild(btns);
      list.appendChild(item);
    }

    // ── Galerie de modèles ──────────────────────
    const existingTitles = new Set(snippets.map(s => s.title));
    const availableTemplates = PROMPT_TEMPLATES.filter(t => !existingTitles.has(t.title));
    if (availableTemplates.length === 0) return;

    const gallerySep = document.createElement('div');
    gallerySep.className = 'snippets-gallery-sep';
    gallerySep.innerHTML = '<span>📚 Modèles à ajouter</span><small>' + availableTemplates.length + ' disponibles</small>';
    list.appendChild(gallerySep);

    // Filtres par catégorie
    const filterRow = document.createElement('div');
    filterRow.className = 'snippets-cat-filter';
    let activeCat = null;

    const renderGallery = (cat) => {
      const old = list.querySelector('.snippets-gallery');
      if (old) old.remove();

      const gallery = document.createElement('div');
      gallery.className = 'snippets-gallery';

      const filtered = cat ? availableTemplates.filter(t => t.category === cat) : availableTemplates;

      for (const tpl of filtered) {
        const card = document.createElement('div');
        card.className = 'snippet-tpl-card';

        const cardTop = document.createElement('div');
        cardTop.className = 'snippet-tpl-card-top';

        const catTag = document.createElement('span');
        catTag.className = 'snippet-tpl-cat';
        catTag.textContent = tpl.category;
        catTag.style.setProperty('--cat-color', PROMPT_CAT_COLORS[tpl.category] || 'var(--accent)');

        const titleEl = document.createElement('div');
        titleEl.className   = 'snippet-tpl-title';
        titleEl.textContent = tpl.icon + ' ' + tpl.title;

        const preview = document.createElement('div');
        preview.className   = 'snippet-tpl-preview';
        preview.textContent = tpl.content.replace(/\n+/g, ' ').slice(0, 80) + '…';

        const addBtn = document.createElement('button');
        addBtn.className   = 'snippet-tpl-add';
        addBtn.title       = 'Ajouter à mes prompts';
        addBtn.textContent = '+ Ajouter';
        addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          Storage.addSnippet(cu?.id, tpl.title, tpl.content);
          renderSnippetsList();
          renderSnippetsDropdown();
          toast('Prompt "' + tpl.title + '" ajouté ✓', 'success');
        });

        cardTop.appendChild(catTag);
        card.appendChild(cardTop);
        card.appendChild(titleEl);
        card.appendChild(preview);
        card.appendChild(addBtn);
        gallery.appendChild(card);
      }
      list.appendChild(gallery);
    };

    // Chips de catégories
    filterRow.innerHTML = '<button class="snippet-cat-chip active" data-cat="">Tout</button>'
      + PROMPT_TEMPLATE_CATEGORIES.map(c =>
        '<button class="snippet-cat-chip" data-cat="' + c + '" style="--chip-color:' + (PROMPT_CAT_COLORS[c] || '#888') + '">' + c + '</button>'
      ).join('');

    filterRow.querySelectorAll('.snippet-cat-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        filterRow.querySelectorAll('.snippet-cat-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        renderGallery(chip.dataset.cat || null);
      });
    });

    list.appendChild(filterRow);
    renderGallery(null);
  }

  function highlightSnippetForm() {
    const panel = $('snippetForm');
    panel.classList.remove('snippet-form-active');
    // force reflow pour relancer l'animation même si déjà active
    void panel.offsetWidth;
    panel.classList.add('snippet-form-active');
  }

  function openSnippetEdit(snip) {
    $('snippetFormTitle').textContent = '✏️ Modifier le prompt';
    $('snippetTitleInput').value      = snip.title;
    $('snippetContentInput').value    = snip.content;
    $('snippetEditId').value          = snip.id;
    highlightSnippetForm();
    setTimeout(() => $('snippetTitleInput').focus(), 50);
  }

  function openNewSnippetForm() {
    $('snippetFormTitle').textContent = '✨ Nouveau prompt';
    $('snippetTitleInput').value      = '';
    $('snippetContentInput').value    = '';
    $('snippetEditId').value          = '';
    highlightSnippetForm();
    setTimeout(() => $('snippetTitleInput').focus(), 50);
  }

  function resetSnippetForm() {
    $('snippetFormTitle').textContent = '✏️ Nouveau prompt';
    $('snippetTitleInput').value      = '';
    $('snippetContentInput').value    = '';
    $('snippetEditId').value          = '';
    $('snippetForm').classList.remove('snippet-form-active');
  }

  function renderSnippetsDropdown() {
    const cu       = Storage.getCurrentUser();
    const snippets = Storage.getSnippets(cu?.id);
    const list     = $('snippetsDdList');
    const empty    = $('snippetsDdEmpty');
    list.innerHTML = '';
    list.style.display  = '';
    empty.style.display = 'none';

    // ── Prompts sauvegardés par l'utilisateur ──
    for (const snip of snippets) {
      const btn = document.createElement('button');
      btn.className = 'snippet-dd-item';

      const titleEl = document.createElement('span');
      titleEl.className   = 'snippet-dd-title';
      titleEl.textContent = snip.title;

      const previewEl = document.createElement('span');
      previewEl.className   = 'snippet-dd-preview';
      previewEl.textContent = snip.content.length > 60
        ? snip.content.slice(0, 60) + '…'
        : snip.content;

      btn.appendChild(titleEl);
      btn.appendChild(previewEl);
      btn.addEventListener('click', () => {
        const current = promptInput.value;
        promptInput.value = current ? current + '\n\n' + snip.content : snip.content;
        updateSendBtn();
        autoResizeTextarea();
        promptInput.focus();
        closeSnippetsDropdown();
        toast('Prompt inséré ✓', 'success', 1500);
      });
      list.appendChild(btn);
    }

    // ── Modèles prédéfinis ──
    const existingTitles    = new Set(snippets.map(s => s.title));
    const availableTemplates = PROMPT_TEMPLATES.filter(t => !existingTitles.has(t.title));

    if (availableTemplates.length > 0) {
      const sep = document.createElement('div');
      sep.className   = 'snippets-dd-tpl-sep';
      sep.textContent = snippets.length > 0 ? '📚 Modèles' : '📚 Prompts par défaut';
      list.appendChild(sep);

      const toShow = availableTemplates.slice(0, 8);
      for (const tpl of toShow) {
        const btn = document.createElement('button');
        btn.className = 'snippet-dd-item';

        const titleEl = document.createElement('span');
        titleEl.className   = 'snippet-dd-title';
        titleEl.textContent = tpl.icon + ' ' + tpl.title;

        const catEl = document.createElement('span');
        catEl.className   = 'snippet-dd-cat';
        catEl.textContent = tpl.category;
        catEl.style.setProperty('--cat-color', PROMPT_CAT_COLORS[tpl.category] || '#888');

        btn.appendChild(titleEl);
        btn.appendChild(catEl);
        btn.addEventListener('click', () => {
          const current = promptInput.value;
          promptInput.value = current ? current + '\n\n' + tpl.content : tpl.content;
          updateSendBtn();
          autoResizeTextarea();
          promptInput.focus();
          closeSnippetsDropdown();
          toast('Prompt "' + tpl.title + '" inséré ✓', 'success', 1500);
        });
        list.appendChild(btn);
      }

      if (availableTemplates.length > 8) {
        const more = document.createElement('div');
        more.className   = 'snippets-dd-tpl-more';
        more.textContent = '+ ' + (availableTemplates.length - 8) + ' autres dans la bibliothèque';
        list.appendChild(more);
      }
    }
  }

  function closeSnippetsDropdown() {
    $('snippetsDropdown').classList.remove('open');
  }

  // ── Skills export / import ────────────────────
  function exportSkills() {
    const cu      = Storage.getCurrentUser();
    const skills  = Storage.getSkills(cu?.id).filter(s => !s.builtIn);
    if (skills.length === 0) { toast('Aucun skill personnalisé à exporter', 'error'); return; }
    const blob = new Blob([JSON.stringify(skills, null, 2)], { type: 'application/json;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'munnin-skills.json';
    a.click();
    URL.revokeObjectURL(url);
    toast(skills.length + ' skill(s) exporté(s) ✓', 'success', 2000);
  }

  function importSkills(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data)) throw new Error('Format invalide');
        const cu      = Storage.getCurrentUser();
        const current = Storage.getSkills(cu?.id).filter(s => !s.builtIn);
        let   added   = 0;
        for (const s of data) {
          if (!s.name) continue;
          if (current.some(ex => ex.name === s.name)) continue;
          Storage.addSkill(cu?.id, {
            name:         s.name,
            icon:         s.icon || '⭐',
            modelId:      s.modelId || null,
            temperature:  s.temperature ?? null,
            maxTokens:    s.maxTokens   ?? null,
            systemPrompt: s.systemPrompt || '',
          });
          added++;
        }
        renderSkillsList();
        renderSkillsChips();
        toast(added > 0 ? added + ' skill(s) importé(s) ✓' : 'Aucun nouveau skill (doublons ignorés)',
          added > 0 ? 'success' : 'info', 3000);
      } catch {
        toast('Fichier invalide — JSON de skills attendu', 'error');
      }
    };
    reader.readAsText(file);
  }

  // ── Budget ────────────────────────────────────
  let _budgetWarnedDaily   = false;
  let _budgetWarnedWeekly  = false;
  let _budgetWarnedMonthly = false;

  function refreshBudgetBars() {
    const budget = Storage.getSettings().budget || {};
    const { dailyCost, weeklyCost, monthlyCost } = Storage.getCurrentCosts();
    const dLimit = budget.dailyLimit   || 0;
    const wLimit = budget.weeklyLimit  || 0;
    const mLimit = budget.monthlyLimit || 0;

    const dBar   = $('budgetDailyBar');
    const wBar   = $('budgetWeeklyBar');
    const mBar   = $('budgetMonthlyBar');
    const dLabel = $('budgetDailyUsageLabel');
    const wLabel = $('budgetWeeklyUsageLabel');
    const mLabel = $('budgetMonthlyUsageLabel');

    if (dBar && dLabel) {
      const pct = dLimit > 0 ? Math.min((dailyCost / dLimit) * 100, 100) : 0;
      dBar.style.width = pct + '%';
      dBar.className   = 'budget-progress-bar-fill' + (pct >= 100 ? ' budget-bar-over' : pct >= 80 ? ' budget-bar-warn' : '');
      dLabel.textContent = '$' + dailyCost.toFixed(4) + (dLimit > 0 ? ' / $' + dLimit.toFixed(2) : ' / —');
    }
    if (wBar && wLabel) {
      const pct = wLimit > 0 ? Math.min((weeklyCost / wLimit) * 100, 100) : 0;
      wBar.style.width = pct + '%';
      wBar.className   = 'budget-progress-bar-fill' + (pct >= 100 ? ' budget-bar-over' : pct >= 80 ? ' budget-bar-warn' : '');
      wLabel.textContent = '$' + weeklyCost.toFixed(4) + (wLimit > 0 ? ' / $' + wLimit.toFixed(2) : ' / —');
    }
    if (mBar && mLabel) {
      const pct = mLimit > 0 ? Math.min((monthlyCost / mLimit) * 100, 100) : 0;
      mBar.style.width = pct + '%';
      mBar.className   = 'budget-progress-bar-fill' + (pct >= 100 ? ' budget-bar-over' : pct >= 80 ? ' budget-bar-warn' : '');
      mLabel.textContent = '$' + monthlyCost.toFixed(4) + (mLimit > 0 ? ' / $' + mLimit.toFixed(2) : ' / —');
    }
  }

  function isBudgetExceeded() {
    const budget = Storage.getSettings().budget || {};
    if (!budget.blockOnLimit) return false;
    const { dailyCost, weeklyCost, monthlyCost } = Storage.getCurrentCosts();
    if (budget.dailyLimit   > 0 && dailyCost   >= budget.dailyLimit)   return 'journalier';
    if (budget.weeklyLimit  > 0 && weeklyCost  >= budget.weeklyLimit)  return 'hebdomadaire';
    if (budget.monthlyLimit > 0 && monthlyCost >= budget.monthlyLimit) return 'mensuel';
    return false;
  }

  function checkBudgetAlerts(dailyCost, weeklyCost, monthlyCost) {
    refreshBudgetBars();
    const budget = Storage.getSettings().budget || {};
    if (budget.dailyLimit > 0 && dailyCost >= budget.dailyLimit && !_budgetWarnedDaily) {
      _budgetWarnedDaily = true;
      toast('⚠ Limite journalière de $' + budget.dailyLimit.toFixed(2) + ' atteinte !', 'error', 6000);
    }
    if (budget.weeklyLimit > 0 && weeklyCost >= budget.weeklyLimit && !_budgetWarnedWeekly) {
      _budgetWarnedWeekly = true;
      toast('⚠ Limite hebdomadaire de $' + budget.weeklyLimit.toFixed(2) + ' atteinte !', 'error', 6000);
    }
    if (budget.monthlyLimit > 0 && monthlyCost >= budget.monthlyLimit && !_budgetWarnedMonthly) {
      _budgetWarnedMonthly = true;
      toast('⚠ Limite mensuelle de $' + budget.monthlyLimit.toFixed(2) + ' atteinte !', 'error', 6000);
    }
  }

  // ── Lightbox ──────────────────────────────────
  function openLightbox(src) {
    const overlay = $('lightboxOverlay');
    const img     = $('lightboxImg');
    if (!overlay || !img) return;
    img.src = src;
    overlay.classList.add('open');
  }

  function closeLightbox() {
    const overlay = $('lightboxOverlay');
    const img     = $('lightboxImg');
    if (overlay) overlay.classList.remove('open');
    if (img)     img.src = '';
  }

  // ── Optimisation de prompt ────────────────────
  async function optimizePrompt() {
    const text = promptInput.value.trim();
    if (!text || isGenerating) return;
    const settings  = Storage.getSettings();
    const hasGemini = !!settings.geminiKey;
    const hasClaude = !!settings.anthropicKey;
    if (!hasGemini && !hasClaude) {
      toast('Clé API Gemini ou Anthropic requise', 'error'); return;
    }
    optimizeBtn.disabled    = true;
    const origContent       = optimizeBtn.textContent;
    optimizeBtn.textContent = '…';
    const sysMsg = 'Tu es un expert prompt engineer. Améliore ce prompt : plus précis, clair, efficace. Réponds UNIQUEMENT avec le prompt amélioré, sans commentaire ni introduction.';
    try {
      let improved = '';
      if (hasGemini) {
        const url = MUNNIN_CONFIG.endpoints.gemini + '/gemini-2.5-flash:generateContent?key=' + settings.geminiKey;
        const res  = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: sysMsg }] },
            contents: [{ role: 'user', parts: [{ text: text }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
          }),
        });
        const data = await res.json();
        improved   = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else {
        const res  = await fetch(MUNNIN_CONFIG.endpoints.anthropic, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': settings.anthropicKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            system: sysMsg,
            messages: [{ role: 'user', content: text }],
          }),
        });
        const data = await res.json();
        improved   = data.content?.[0]?.text || '';
      }
      if (improved.trim()) {
        promptInput.value = improved.trim();
        updateSendBtn();
        autoResizeTextarea();
        promptInput.focus();
        toast('Prompt optimisé ✨', 'success', 2000);
      } else {
        toast('Aucune amélioration retournée', 'error');
      }
    } catch {
      toast('Erreur lors de l\'optimisation', 'error');
    } finally {
      optimizeBtn.disabled    = false;
      optimizeBtn.textContent = origContent;
    }
  }

  // ── Lancement ─────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

})();
