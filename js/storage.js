/* ═══════════════════════════════════════════════
   MUNINN — Gestion du stockage (localStorage)
═══════════════════════════════════════════════ */

const Storage = (() => {

  const KEYS = {
    settings:       'munnin_settings',
    users:          'munnin_users',
    currentUserId:  'munnin_current_user',
    theme:          'munnin_theme',
    model:          'munnin_model',
    usage:          'munnin_usage',
    fontSize:       'munnin_fontsize',
  };

  // ── Clés dynamiques par utilisateur ───────────
  function conversationsKey() {
    const userId = localStorage.getItem('munnin_current_user');
    const parsed = userId ? JSON.parse(userId) : null;
    return parsed ? `munnin_conversations_${parsed}` : 'munnin_conversations_default';
  }

  function currentConvKey() {
    const userId = localStorage.getItem('munnin_current_user');
    const parsed = userId ? JSON.parse(userId) : null;
    return parsed ? `munnin_current_conv_${parsed}` : 'munnin_current_conv_default';
  }

  // ── Helpers JSON ──────────────────────────────
  function get(key, fallback = null) {
    try {
      const val = localStorage.getItem(key);
      return val !== null ? JSON.parse(val) : fallback;
    } catch { return fallback; }
  }

  function set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { console.error('Storage write error:', e); }
  }

  // ── Initialisation ────────────────────────────
  function init() {
    // Clés API pré-renseignées si absentes (premier lancement)
    const settings = get(KEYS.settings) || {};
    if (!settings.geminiKey)      settings.geminiKey      = '';
    if (!settings.anthropicKey)   settings.anthropicKey   = '';
    if (!settings.perplexityKey)  settings.perplexityKey  = '';
    if (!settings.deepseekKey)    settings.deepseekKey    = '';
    if (!settings.qwenKey)        settings.qwenKey        = '';
    if (!settings.openrouterKey)  settings.openrouterKey  = '';
    if (!settings.mistralKey)     settings.mistralKey     = '';
    if (!settings.temperature)  settings.temperature  = MUNNIN_CONFIG.defaultGenSettings.temperature;
    if (!settings.maxTokens)    settings.maxTokens    = MUNNIN_CONFIG.defaultGenSettings.maxTokens;
    if (!settings.systemPrompt) settings.systemPrompt = '';
    if (!settings.speechRate)   settings.speechRate   = MUNNIN_CONFIG.defaultSpeechRate;
    if (!settings.ttsVoice)     settings.ttsVoice     = '';
    if (!settings.budget) {
      settings.budget = { dailyLimit: 0, weeklyLimit: 0, monthlyLimit: 0, blockOnLimit: false };
    } else {
      if (settings.budget.blockOnLimit === undefined) settings.budget.blockOnLimit = false;
      if (settings.budget.weeklyLimit  === undefined) settings.budget.weeklyLimit  = 0;
    }
    set(KEYS.settings, settings);

    // Utilisateur par défaut
    const users = get(KEYS.users);
    if (!users || users.length === 0) {
      const defaultUser = { id: 'user_default', name: 'Utilisateur', avatar: '🐺' };
      set(KEYS.users, [defaultUser]);
      set(KEYS.currentUserId, defaultUser.id);
    }

    // Thème par défaut
    if (!get(KEYS.theme)) set(KEYS.theme, MUNNIN_CONFIG.defaultTheme);

    // Modèle par défaut
    if (!get(KEYS.model)) set(KEYS.model, MUNNIN_CONFIG.defaultModel);
  }

  // ── Paramètres ────────────────────────────────
  function getSettings() {
    return get(KEYS.settings, {});
  }

  function saveSettings(partial) {
    const current = getSettings();
    set(KEYS.settings, { ...current, ...partial });
  }

  // ── Thème ─────────────────────────────────────
  function getTheme() { return get(KEYS.theme, MUNNIN_CONFIG.defaultTheme); }
  function setTheme(theme) { set(KEYS.theme, theme); }

  // ── Taille de texte ───────────────────────────
  function getFontSize() { return get(KEYS.fontSize, 'md'); }
  function setFontSize(size) { set(KEYS.fontSize, size); }

  // ── Modèle courant ────────────────────────────
  function getModel() { return get(KEYS.model, MUNNIN_CONFIG.defaultModel); }
  function setModel(modelId) { set(KEYS.model, modelId); }

  // ── Utilisateurs ─────────────────────────────
  function getUsers() { return get(KEYS.users, []); }

  function getCurrentUser() {
    const users = getUsers();
    const id    = get(KEYS.currentUserId);
    return users.find(u => u.id === id) || users[0] || null;
  }

  function setCurrentUser(userId) { set(KEYS.currentUserId, userId); }

  function addUser(name, avatar = '🐺') {
    const users = getUsers();
    const id    = 'user_' + Date.now();
    users.push({ id, name: name.trim(), avatar });
    set(KEYS.users, users);
    return id;
  }

  function updateUserAvatar(userId, avatar) {
    const users = getUsers();
    const idx   = users.findIndex(u => u.id === userId);
    if (idx !== -1) {
      users[idx].avatar = avatar;
      set(KEYS.users, users);
      return true;
    }
    return false;
  }

  // ── Mémoire longue par utilisateur ───────────
  function getMemory(userId) {
    if (!userId) return '';
    return get(`munnin_memory_${userId}`, '');
  }

  function setMemory(userId, text) {
    if (!userId) return;
    set(`munnin_memory_${userId}`, text || '');
  }

  // ── Skills ────────────────────────────────────
  function getSkills(userId) {
    const builtIn = [...MUNNIN_CONFIG.defaultSkills];
    if (!userId) return builtIn;
    const custom = get(`munnin_skills_${userId}`, []).filter(s => !s.builtIn);
    return [...builtIn, ...custom];
  }

  function saveCustomSkills(userId, skills) {
    if (!userId) return;
    set(`munnin_skills_${userId}`, skills.filter(s => !s.builtIn));
  }

  function addSkill(userId, skill) {
    const skills   = getSkills(userId);
    const id       = 'skill_' + Date.now();
    const newSkill = { ...skill, id, builtIn: false };
    skills.push(newSkill);
    saveCustomSkills(userId, skills);
    return newSkill;
  }

  function updateSkill(userId, skillId, data) {
    const skills = getSkills(userId);
    const idx    = skills.findIndex(s => s.id === skillId && !s.builtIn);
    if (idx === -1) return false;
    skills[idx] = { ...skills[idx], ...data };
    saveCustomSkills(userId, skills);
    return true;
  }

  function deleteSkill(userId, skillId) {
    const skills = getSkills(userId);
    const skill  = skills.find(s => s.id === skillId);
    if (!skill || skill.builtIn) return false;
    saveCustomSkills(userId, skills.filter(s => s.id !== skillId));
    return true;
  }

  function getActiveSkillId(userId) {
    if (!userId) return null;
    return get(`munnin_active_skill_${userId}`, null);
  }

  function setActiveSkillId(userId, skillId) {
    if (!userId) return;
    set(`munnin_active_skill_${userId}`, skillId);
  }

  function deleteUser(userId) {
    let users = getUsers();
    if (users.length <= 1) return false; // garder au moins un user
    users = users.filter(u => u.id !== userId);
    set(KEYS.users, users);
    // Nettoyer les conversations, mémoire et skills de cet utilisateur
    localStorage.removeItem(`munnin_conversations_${userId}`);
    localStorage.removeItem(`munnin_current_conv_${userId}`);
    localStorage.removeItem(`munnin_memory_${userId}`);
    localStorage.removeItem(`munnin_skills_${userId}`);
    localStorage.removeItem(`munnin_active_skill_${userId}`);
    localStorage.removeItem(`munnin_folders_${userId}`);
    localStorage.removeItem(`munnin_tags_${userId}`);
    localStorage.removeItem(`munnin_snippets_${userId}`);
    // Si c'était l'utilisateur courant, passer au premier
    if (get(KEYS.currentUserId) === userId) {
      set(KEYS.currentUserId, users[0].id);
    }
    return true;
  }

  // ── Conversations ─────────────────────────────
  function getConversations() {
    return get(conversationsKey(), []);
  }

  function getCurrentConvId() {
    return get(currentConvKey(), null);
  }

  function setCurrentConvId(id) {
    set(currentConvKey(), id);
  }

  function getConversation(id) {
    return getConversations().find(c => c.id === id) || null;
  }

  function createConversation(modelId) {
    const id   = 'conv_' + Date.now();
    const conv = {
      id,
      title:     'Nouvelle conversation',
      modelId:   modelId || getModel(),
      messages:  [],
      pinned:    false,
      folderId:  null,
      tags:      [],
      totalCost: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const convs = getConversations();
    convs.unshift(conv);
    set(conversationsKey(), convs);
    set(currentConvKey(), id);
    return conv;
  }

  function updateConversationModel(id, modelId) {
    const convs = getConversations();
    const idx   = convs.findIndex(c => c.id === id);
    if (idx !== -1) {
      convs[idx].modelId   = modelId;
      convs[idx].updatedAt = Date.now();
      set(conversationsKey(), convs);
    }
  }

  function updateConversationTitle(id, title) {
    const convs = getConversations();
    const idx   = convs.findIndex(c => c.id === id);
    if (idx !== -1) {
      convs[idx].title     = title.slice(0, 60);
      convs[idx].updatedAt = Date.now();
      set(conversationsKey(), convs);
    }
  }

  function togglePin(id) {
    const convs = getConversations();
    const idx   = convs.findIndex(c => c.id === id);
    if (idx === -1) return;
    convs[idx].pinned    = !convs[idx].pinned;
    convs[idx].updatedAt = Date.now();
    set(conversationsKey(), convs);
  }

  function addMessage(convId, role, content, attachments = [], modelId = null) {
    const convs = getConversations();
    const idx   = convs.findIndex(c => c.id === convId);
    if (idx === -1) return null;

    const msg = {
      id:          'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      role,
      content,
      attachments, // [{ type, name, data }]
      timestamp:   Date.now(),
    };
    if (modelId) msg.modelId = modelId;

    convs[idx].messages.push(msg);
    convs[idx].updatedAt = Date.now();

    // Auto-titre depuis le premier message utilisateur
    if (convs[idx].messages.filter(m => m.role === 'user').length === 1 && role === 'user') {
      convs[idx].title = content.slice(0, 50) + (content.length > 50 ? '…' : '');
    }

    set(conversationsKey(), convs);
    return msg;
  }

  // Tronque les messages à partir de l'index donné (inclus) — pour l'édition de message
  function truncateMessagesAfter(convId, fromIndex) {
    const convs = getConversations();
    const idx   = convs.findIndex(c => c.id === convId);
    if (idx === -1) return;
    convs[idx].messages = convs[idx].messages.slice(0, fromIndex);
    convs[idx].updatedAt = Date.now();
    set(conversationsKey(), convs);
  }

  // Met à jour le contenu d'un message utilisateur
  function updateUserMessage(convId, msgIndex, newContent) {
    const convs = getConversations();
    const idx   = convs.findIndex(c => c.id === convId);
    if (idx === -1) return;
    if (!convs[idx].messages[msgIndex]) return;
    convs[idx].messages[msgIndex].content = newContent;
    convs[idx].updatedAt = Date.now();
    set(conversationsKey(), convs);
  }

  function updateLastAssistantMessage(convId, content) {
    const convs = getConversations();
    const idx   = convs.findIndex(c => c.id === convId);
    if (idx === -1) return;

    const msgs    = convs[idx].messages;
    const lastIdx = msgs.length - 1;
    if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
      msgs[lastIdx].content  = content;
      convs[idx].updatedAt   = Date.now();
      set(conversationsKey(), convs);
    }
  }

  function deleteConversation(id) {
    let convs = getConversations();
    convs     = convs.filter(c => c.id !== id);
    set(conversationsKey(), convs);

    // Si c'était la conv courante, basculer sur la première restante
    if (get(currentConvKey()) === id) {
      set(currentConvKey(), convs.length > 0 ? convs[0].id : null);
    }
  }

  // ── Suivi d'utilisation (tokens / coût) ───────
  // Structure : { 'YYYY-MM-DD': { 'modelId': { input: N, output: N } } }

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function _computeBudgetTotals(usage) {
    const now = new Date();
    let dailyCost = 0, weeklyCost = 0, monthlyCost = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      if (!usage[dateKey]) continue;
      let dayCost = 0;
      for (const [mId, data] of Object.entries(usage[dateKey])) {
        const model = getModelById(mId);
        if (!model) continue;
        if (model.pricing.perImage) {
          dayCost += (data.images || 0) * model.pricing.perImage;
        } else {
          dayCost += ((data.input  || 0) / 1_000_000) * (model.pricing.inputPer1M  || 0);
          dayCost += ((data.output || 0) / 1_000_000) * (model.pricing.outputPer1M || 0);
        }
      }
      if (i === 0) dailyCost = dayCost;
      if (i < 7)   weeklyCost  += dayCost;
      monthlyCost += dayCost;
    }
    return { dailyCost, weeklyCost, monthlyCost };
  }

  function getCurrentCosts() {
    return _computeBudgetTotals(get(KEYS.usage, {}));
  }

  function trackUsage(modelId, inputTokens, outputTokens) {
    if (!modelId || (!inputTokens && !outputTokens)) return { dailyCost: 0, weeklyCost: 0, monthlyCost: 0 };
    const today = todayKey();
    const usage = get(KEYS.usage, {});
    if (!usage[today]) usage[today] = {};
    if (!usage[today][modelId]) usage[today][modelId] = { input: 0, output: 0, images: 0 };
    usage[today][modelId].input  += inputTokens  || 0;
    usage[today][modelId].output += outputTokens || 0;
    set(KEYS.usage, usage);
    return _computeBudgetTotals(usage);
  }

  function trackImageUsage(modelId, count = 1) {
    if (!modelId || !count) return { dailyCost: 0, weeklyCost: 0, monthlyCost: 0 };
    const today = todayKey();
    const usage = get(KEYS.usage, {});
    if (!usage[today]) usage[today] = {};
    if (!usage[today][modelId]) usage[today][modelId] = { input: 0, output: 0, images: 0 };
    usage[today][modelId].images = (usage[today][modelId].images || 0) + count;
    set(KEYS.usage, usage);
    return _computeBudgetTotals(usage);
  }

  function addConvCost(convId, cost) {
    if (!convId || !cost) return;
    const convs = getConversations();
    const idx   = convs.findIndex(c => c.id === convId);
    if (idx === -1) return;
    convs[idx].totalCost = (convs[idx].totalCost || 0) + cost;
    set(conversationsKey(), convs);
  }

  function getUsage() {
    return get(KEYS.usage, {});
  }

  // Agrège l'usage sur les N derniers jours (0 = tout)
  function getUsageForPeriod(days) {
    const usage  = getUsage();
    const result = {}; // { modelId: { input, output } }
    const now    = new Date();

    const dates = days === 0
      ? Object.keys(usage)
      : Array.from({ length: days }, (_, i) => {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          return d.toISOString().slice(0, 10);
        });

    for (const date of dates) {
      if (!usage[date]) continue;
      for (const [modelId, data] of Object.entries(usage[date])) {
        if (!result[modelId]) result[modelId] = { input: 0, output: 0, images: 0 };
        result[modelId].input  += data.input  || 0;
        result[modelId].output += data.output || 0;
        result[modelId].images += data.images || 0;
      }
    }
    return result;
  }

  function clearUsage() {
    set(KEYS.usage, {});
  }

  // ── Dossiers ──────────────────────────────────
  function getFolders(userId) {
    if (!userId) return [];
    return get(`munnin_folders_${userId}`, []);
  }

  function addFolder(userId, name, color) {
    if (!userId) return null;
    const folders = getFolders(userId);
    const id      = 'folder_' + Date.now();
    folders.push({ id, name: name.trim(), color: color || '#6366f1', collapsed: false });
    set(`munnin_folders_${userId}`, folders);
    return id;
  }

  function updateFolder(userId, folderId, data) {
    if (!userId) return false;
    const folders = getFolders(userId);
    const idx     = folders.findIndex(f => f.id === folderId);
    if (idx === -1) return false;
    folders[idx]  = { ...folders[idx], ...data };
    set(`munnin_folders_${userId}`, folders);
    return true;
  }

  function deleteFolder(userId, folderId) {
    if (!userId) return;
    const folders = getFolders(userId).filter(f => f.id !== folderId);
    set(`munnin_folders_${userId}`, folders);
    // Libérer les conversations de ce dossier
    const convs   = getConversations();
    let changed   = false;
    for (const c of convs) {
      if (c.folderId === folderId) { c.folderId = null; changed = true; }
    }
    if (changed) set(conversationsKey(), convs);
  }

  function setConvFolder(convId, folderId) {
    const convs = getConversations();
    const idx   = convs.findIndex(c => c.id === convId);
    if (idx === -1) return;
    convs[idx].folderId  = folderId;
    convs[idx].updatedAt = Date.now();
    set(conversationsKey(), convs);
  }

  // ── Tags ──────────────────────────────────────
  function getTags(userId) {
    if (!userId) return [];
    return get(`munnin_tags_${userId}`, []);
  }

  function addTag(userId, name, color) {
    if (!userId) return null;
    const tags = getTags(userId);
    const id   = 'tag_' + Date.now();
    tags.push({ id, name: name.trim(), color: color || '#f59e0b' });
    set(`munnin_tags_${userId}`, tags);
    return id;
  }

  function deleteTag(userId, tagId) {
    if (!userId) return;
    const tags = getTags(userId).filter(t => t.id !== tagId);
    set(`munnin_tags_${userId}`, tags);
    // Retirer le tag des conversations
    const convs = getConversations();
    let changed = false;
    for (const c of convs) {
      if (c.tags && c.tags.includes(tagId)) {
        c.tags  = c.tags.filter(t => t !== tagId);
        changed = true;
      }
    }
    if (changed) set(conversationsKey(), convs);
  }

  function setConvTags(convId, tags) {
    const convs = getConversations();
    const idx   = convs.findIndex(c => c.id === convId);
    if (idx === -1) return;
    convs[idx].tags      = tags;
    convs[idx].updatedAt = Date.now();
    set(conversationsKey(), convs);
  }

  // ── Snippets de prompts ───────────────────────
  function getSnippets(userId) {
    if (!userId) return [];
    return get(`munnin_snippets_${userId}`, []);
  }

  function addSnippet(userId, title, content) {
    if (!userId || !title || !content) return null;
    const snippets = getSnippets(userId);
    const id = 'snip_' + Date.now();
    snippets.push({ id, title: title.trim(), content: content.trim() });
    set(`munnin_snippets_${userId}`, snippets);
    return id;
  }

  function updateSnippet(userId, snippetId, data) {
    if (!userId) return false;
    const snippets = getSnippets(userId);
    const idx = snippets.findIndex(s => s.id === snippetId);
    if (idx === -1) return false;
    snippets[idx] = { ...snippets[idx], ...data };
    set(`munnin_snippets_${userId}`, snippets);
    return true;
  }

  function deleteSnippet(userId, snippetId) {
    if (!userId) return false;
    set(`munnin_snippets_${userId}`, getSnippets(userId).filter(s => s.id !== snippetId));
    return true;
  }

  // ── Providers personnalisés (OpenAI-compatible) ─
  function getCustomProviders() {
    return get('munnin_custom_providers', []);
  }

  function saveCustomProviders(providers) {
    set('munnin_custom_providers', providers);
  }

  function addCustomProvider(name, modelId, endpoint, key) {
    const providers = getCustomProviders();
    const id = 'custom_' + Date.now();
    providers.push({ id, name: name.trim(), modelId: modelId.trim(), endpoint: endpoint.trim(), key: key.trim() });
    set('munnin_custom_providers', providers);
    return id;
  }

  function deleteCustomProvider(id) {
    set('munnin_custom_providers', getCustomProviders().filter(p => p.id !== id));
  }

  function updateCustomProviderKey(id, key) {
    const providers = getCustomProviders();
    const idx = providers.findIndex(p => p.id === id);
    if (idx !== -1) { providers[idx].key = key.trim(); set('munnin_custom_providers', providers); }
  }

  function clearAll() {
    // Supprimer toutes les clés munnin_ (incluant les clés par utilisateur)
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('munnin_')) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  }

  return {
    init,
    getSettings, saveSettings,
    getTheme, setTheme,
    getFontSize, setFontSize,
    getModel, setModel,
    getUsers, getCurrentUser, setCurrentUser, addUser, updateUserAvatar, deleteUser,
    getMemory, setMemory,
    getSkills, addSkill, updateSkill, deleteSkill, getActiveSkillId, setActiveSkillId,
    getConversations, getCurrentConvId, setCurrentConvId,
    getConversation, createConversation,
    updateConversationModel, updateConversationTitle, togglePin,
    addMessage, updateLastAssistantMessage, truncateMessagesAfter, updateUserMessage,
    deleteConversation, clearAll,
    trackUsage, trackImageUsage, getUsage, getUsageForPeriod, getCurrentCosts, clearUsage, addConvCost,
    getFolders, addFolder, updateFolder, deleteFolder, setConvFolder,
    getTags, addTag, deleteTag, setConvTags,
    getSnippets, addSnippet, updateSnippet, deleteSnippet,
    getCustomProviders, saveCustomProviders, addCustomProvider, deleteCustomProvider, updateCustomProviderKey,
  };

})();
