/* ═══════════════════════════════════════════════
   MUNINN — Configuration & liste des modèles
═══════════════════════════════════════════════ */

const MUNNIN_CONFIG = {

  // ── Modèles disponibles ──────────────────────
  models: [
    // ── Google Gemini ──
    {
      id: 'gemini-3.1-pro-preview',
      name: 'Gemini 3.1 Pro',
      description: 'Dernier modèle Google — raisonnement avancé',
      provider: 'gemini',
      supportsImages: true,
      supportsFiles: true,
      contextWindow: '1M tokens',
      pricing: { inputPer1M: 3.50, outputPer1M: 10.50 },
    },
    {
      id: 'gemini-3-flash-preview',
      name: 'Gemini 3 Flash',
      description: 'Génération 3 — rapide et efficace',
      provider: 'gemini',
      supportsImages: true,
      supportsFiles: true,
      contextWindow: '1M tokens',
      pricing: { inputPer1M: 0.15, outputPer1M: 0.60 },
    },
    {
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      description: 'Stable et performant — usage intensif',
      provider: 'gemini',
      supportsImages: true,
      supportsFiles: true,
      contextWindow: '1M tokens',
      pricing: { inputPer1M: 1.25, outputPer1M: 10.00 },
    },
    {
      id: 'gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      description: 'Rapide, bon rapport qualité / vitesse',
      provider: 'gemini',
      supportsImages: true,
      supportsFiles: true,
      contextWindow: '1M tokens',
      pricing: { inputPer1M: 0.075, outputPer1M: 0.30 },
    },
    {
      id: 'gemini-2.0-flash',
      name: 'Gemini 2.0 Flash',
      description: 'Référence polyvalente du quotidien',
      provider: 'gemini',
      supportsImages: true,
      supportsFiles: true,
      contextWindow: '1M tokens',
      pricing: { inputPer1M: 0.10, outputPer1M: 0.40 },
    },
    {
      id: 'gemini-2.0-flash-lite-001',
      name: 'Gemini 2.0 Flash Lite',
      description: 'Ultra-léger pour tâches simples',
      provider: 'gemini',
      supportsImages: true,
      supportsFiles: false,
      contextWindow: '1M tokens',
      pricing: { inputPer1M: 0.075, outputPer1M: 0.30 },
    },

    // ── Perplexity ──
    {
      id: 'sonar-pro',
      name: 'Sonar Pro',
      description: 'Perplexity — le plus puissant, recherche web',
      provider: 'perplexity',
      supportsImages: false,
      supportsFiles: false,
      contextWindow: '200K tokens',
      pricing: { inputPer1M: 3.00, outputPer1M: 15.00 },
    },
    {
      id: 'sonar',
      name: 'Sonar',
      description: 'Perplexity — standard, recherche web rapide',
      provider: 'perplexity',
      supportsImages: false,
      supportsFiles: false,
      contextWindow: '127K tokens',
      pricing: { inputPer1M: 1.00, outputPer1M: 1.00 },
    },
    {
      id: 'sonar-reasoning-pro',
      name: 'Sonar Reasoning Pro',
      description: 'Raisonnement avancé + recherche web',
      provider: 'perplexity',
      supportsImages: false,
      supportsFiles: false,
      contextWindow: '127K tokens',
      pricing: { inputPer1M: 2.00, outputPer1M: 8.00 },
    },
    {
      id: 'sonar-reasoning',
      name: 'Sonar Reasoning',
      description: 'Raisonnement rapide + recherche web',
      provider: 'perplexity',
      supportsImages: false,
      supportsFiles: false,
      contextWindow: '127K tokens',
      pricing: { inputPer1M: 1.00, outputPer1M: 5.00 },
    },
    {
      id: 'r1-1776',
      name: 'R1-1776',
      description: 'Raisonnement offline — sans recherche web',
      provider: 'perplexity',
      supportsImages: false,
      supportsFiles: false,
      contextWindow: '128K tokens',
      pricing: { inputPer1M: 2.00, outputPer1M: 8.00 },
    },

    // ── DeepSeek ──
    {
      id: 'deepseek-chat',
      name: 'DeepSeek V3.2',
      description: 'Attention sparse DSA — raisonnement agentic, IMO/IOI gold, économique',
      provider: 'deepseek',
      supportsImages: false,
      supportsFiles: false,
      contextWindow: '64K tokens',
      pricing: { inputPer1M: 0.27, outputPer1M: 1.10 },
    },
    {
      id: 'deepseek-reasoner',
      name: 'DeepSeek R1',
      description: 'Raisonnement avancé — concurrent de o1',
      provider: 'deepseek',
      supportsImages: false,
      supportsFiles: false,
      contextWindow: '64K tokens',
      pricing: { inputPer1M: 0.55, outputPer1M: 2.19 },
    },

    // ── Qwen (Alibaba / DashScope) ──
    {
      id: 'qwen-max',
      name: 'Qwen Max',
      description: 'Le plus puissant de Qwen — raisonnement avancé',
      provider: 'qwen',
      supportsImages: false,
      supportsFiles: false,
      contextWindow: '32K tokens',
      pricing: { inputPer1M: 1.60, outputPer1M: 6.40 },
    },
    {
      id: 'qwen-plus',
      name: 'Qwen Plus',
      description: 'Équilibre performance / contexte long',
      provider: 'qwen',
      supportsImages: false,
      supportsFiles: false,
      contextWindow: '131K tokens',
      pricing: { inputPer1M: 0.80, outputPer1M: 3.20 },
    },
    {
      id: 'qwen-turbo',
      name: 'Qwen Turbo',
      description: 'Ultra-rapide et très économique',
      provider: 'qwen',
      supportsImages: false,
      supportsFiles: false,
      contextWindow: '1M tokens',
      pricing: { inputPer1M: 0.05, outputPer1M: 0.20 },
    },

    // ── Génération d'images — Google Imagen ──
    {
      id: 'gemini-3.1-flash-image-preview',
      name: 'Gemini Image Pro',
      description: 'Gemini 3.1 Flash — génération d\'images haute qualité, styles complexes',
      provider: 'imagen',
      type: 'image',
      supportsImages: false,
      supportsFiles: false,
      pricing: { perImage: 0.04 },
    },
    {
      id: 'gemini-2.5-flash-image',
      name: 'Gemini Image',
      description: 'Gemini 2.5 Flash — génération rapide, bon rapport qualité/vitesse',
      provider: 'imagen',
      type: 'image',
      supportsImages: false,
      supportsFiles: false,
      pricing: { perImage: 0.04 },
    },
    {
      id: 'gemini-3-pro-image-preview',
      name: 'Gemini Image Ultra',
      description: 'Gemini 3 Pro — fidélité maximale, texte lisible, jusqu\'à 14 références',
      provider: 'imagen',
      type: 'image',
      supportsImages: false,
      supportsFiles: false,
      pricing: { perImage: 0.04 },
    },

    // ── Génération d'images — OpenRouter ──
    {
      id: 'black-forest-labs/flux-1.1-pro',
      name: 'FLUX 1.1 Pro',
      description: 'Black Forest Labs — meilleure qualité technique 2026, réalisme, génération en ~4s',
      provider: 'openrouter',
      type: 'image',
      supportsImages: false,
      supportsFiles: false,
      pricing: { perImage: 0.04 },
    },
    {
      id: 'black-forest-labs/flux-2-klein',
      name: 'FLUX 2 Klein',
      description: 'Black Forest Labs — ultra-rapide et économique, parfait pour les aperçus',
      provider: 'openrouter',
      type: 'image',
      supportsImages: false,
      supportsFiles: false,
      pricing: { perImage: 0.014 },
    },
    {
      id: 'ideogram-ai/ideogram-v3',
      name: 'Ideogram v3',
      description: 'Ideogram — spécialiste texte lisible, logos, posters, graphisme et branding',
      provider: 'openrouter',
      type: 'image',
      supportsImages: false,
      supportsFiles: false,
      pricing: { perImage: 0.06 },
    },
    {
      id: 'recraft-ai/recraft-v4',
      name: 'Recraft V4',
      description: 'Recraft — approche design pro, brand assets, compositions maîtrisées et print',
      provider: 'openrouter',
      type: 'image',
      supportsImages: false,
      supportsFiles: false,
      pricing: { perImage: 0.04 },
    },
    {
      id: 'bytedance/seedream-4.5',
      name: 'Seedream 4.5',
      description: 'ByteDance — portraits fins, détails précis, couleurs, textes et cohérence sujets',
      provider: 'openrouter',
      type: 'image',
      supportsImages: false,
      supportsFiles: false,
      pricing: { perImage: 0.03 },
    },

    // ── Mistral ──
    {
      id: 'mistral-large-latest',
      name: 'Mistral Large 3',
      description: 'Modèle phare de Mistral — puissant et polyvalent',
      provider: 'mistral',
      supportsImages: false,
      supportsFiles: false,
      contextWindow: '128K tokens',
      pricing: { inputPer1M: 2.00, outputPer1M: 6.00 },
    },
    {
      id: 'mistral-small-latest',
      name: 'Mistral Small 3.2',
      description: 'Rapide et très économique — tâches simples',
      provider: 'mistral',
      supportsImages: false,
      supportsFiles: false,
      contextWindow: '32K tokens',
      pricing: { inputPer1M: 0.10, outputPer1M: 0.30 },
    },
    {
      id: 'mistral-small-2503',
      name: 'Mistral Small Creative',
      description: 'Réglé pour l\'écriture créative et les jeux de rôle',
      provider: 'mistral',
      supportsImages: false,
      supportsFiles: false,
      contextWindow: '32K tokens',
      pricing: { inputPer1M: 0.10, outputPer1M: 0.30 },
    },
    {
      id: 'ministral-8b-latest',
      name: 'Ministral 8B',
      description: 'Compact 8B — ultra-rapide et léger',
      provider: 'mistral',
      supportsImages: false,
      supportsFiles: false,
      contextWindow: '128K tokens',
      pricing: { inputPer1M: 0.15, outputPer1M: 0.15 },
    },

    // ── OpenRouter — MiniMax ──
    {
      id: 'minimax/minimax-m2.7',
      name: 'MiniMax M2.7',
      description: 'MiniMax — auto-évolutif, 200K contexte, 30-50% du workflow RL autonome — productivité réelle',
      provider: 'openrouter',
      supportsImages: false,
      supportsFiles: false,
      contextWindow: '200K tokens',
      pricing: { inputPer1M: 0.30, outputPer1M: 1.20 },
    },
    {
      id: 'minimax/minimax-m2.5',
      name: 'MiniMax M2.5',
      description: 'MiniMax — SOTA productivité réelle, 196K contexte, coding & agents',
      provider: 'openrouter',
      supportsImages: false,
      supportsFiles: false,
      contextWindow: '196K tokens',
      pricing: { inputPer1M: 0.20, outputPer1M: 1.17 },
    },
    {
      id: 'minimax/minimax-m2.5:free',
      name: 'MiniMax M2.5 (Gratuit)',
      description: 'MiniMax M2.5 — accès gratuit, idéal pour tester ou les tâches à faible volume',
      provider: 'openrouter',
      supportsImages: false,
      supportsFiles: false,
      contextWindow: '196K tokens',
      pricing: { inputPer1M: 0, outputPer1M: 0 },
    },

    // ── OpenRouter — DeepSeek (via clé OpenRouter) ──
    {
      id: 'deepseek/deepseek-v3.2',
      name: 'DeepSeek V3.2 (OpenRouter)',
      description: 'DeepSeek V3.2 via OpenRouter — secours si l\'API directe est indisponible, même modèle',
      provider: 'openrouter',
      supportsImages: false,
      supportsFiles: false,
      contextWindow: '64K tokens',
      pricing: { inputPer1M: 0.28, outputPer1M: 1.15 },
    },
    {
      id: 'deepseek/deepseek-r1',
      name: 'DeepSeek R1 (OpenRouter)',
      description: 'DeepSeek R1 via OpenRouter — raisonnement avancé sans clé DeepSeek séparée',
      provider: 'openrouter',
      supportsImages: false,
      supportsFiles: false,
      contextWindow: '64K tokens',
      pricing: { inputPer1M: 0.55, outputPer1M: 2.19 },
    },

    // ── OpenRouter — Xiaomi MiMo ──
    {
      id: 'xiaomi/mimo-v2-pro',
      name: 'MiMo V2 Pro',
      description: 'Xiaomi — flagship 1T+ params, 1M contexte, optimisé agents et raisonnement avancé',
      provider: 'openrouter',
      supportsImages: false,
      supportsFiles: false,
      contextWindow: '1M tokens',
      pricing: { inputPer1M: 1.00, outputPer1M: 3.00 },
    },
    {
      id: 'xiaomi/mimo-v2-omni',
      name: 'MiMo V2 Omni',
      description: 'Xiaomi — modèle omnimodal natif : texte, images, vidéo et audio en architecture unifiée',
      provider: 'openrouter',
      supportsImages: true,
      supportsFiles: false,
      contextWindow: '256K tokens',
      pricing: { inputPer1M: 0.40, outputPer1M: 2.00 },
    },
    {
      id: 'xiaomi/mimo-v2-flash',
      name: 'MiMo V2 Flash',
      description: 'Xiaomi — version rapide et économique, excellent rapport qualité/prix',
      provider: 'openrouter',
      supportsImages: false,
      supportsFiles: false,
      contextWindow: '128K tokens',
      pricing: { inputPer1M: 0.09, outputPer1M: 0.29 },
    },

    // ── Anthropic Claude ──
    {
      id: 'claude-opus-4-6',
      name: 'Claude Opus 4.6',
      description: 'Le plus puissant d\'Anthropic',
      provider: 'anthropic',
      supportsImages: true,
      supportsFiles: false,
      contextWindow: '200K tokens',
      pricing: { inputPer1M: 15, outputPer1M: 75 },
    },
    {
      id: 'claude-sonnet-4-6',
      name: 'Claude Sonnet 4.6',
      description: 'Équilibre performance / rapidité',
      provider: 'anthropic',
      supportsImages: true,
      supportsFiles: false,
      contextWindow: '200K tokens',
      pricing: { inputPer1M: 3, outputPer1M: 15 },
    },
    {
      id: 'claude-haiku-4-5-20251001',
      name: 'Claude Haiku 4.5',
      description: 'Compact et ultra-rapide',
      provider: 'anthropic',
      supportsImages: true,
      supportsFiles: false,
      contextWindow: '200K tokens',
      pricing: { inputPer1M: 0.80, outputPer1M: 4 },
    },
  ],

  // ── Modèle par défaut ────────────────────────
  defaultModel: 'gemini-2.5-flash',

  // ── Paramètres de génération ─────────────────
  defaultGenSettings: {
    temperature: 0.7,
    maxTokens: 4096,
    systemPrompt: '',
  },

  // ── API endpoints ────────────────────────────
  endpoints: {
    gemini:      'https://generativelanguage.googleapis.com/v1beta/models',
    anthropic:   'https://api.anthropic.com/v1/messages',
    perplexity:  'https://api.perplexity.ai/chat/completions',
    deepseek:    'https://api.deepseek.com/chat/completions',
    qwen:        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    imagen:           'https://generativelanguage.googleapis.com/v1beta/models',
    mistral:          'https://api.mistral.ai/v1/chat/completions',
    openrouter:       'https://openrouter.ai/api/v1/chat/completions',
    openrouterImages: 'https://openrouter.ai/api/v1/images/generations',
  },

  // ── Voix par défaut ──────────────────────────
  defaultSpeechRate: 1.0,

  // ── Thème par défaut ─────────────────────────
  defaultTheme: 'dark-scarlet',

  // ── Skills par défaut ────────────────────────
  defaultSkills: [
    {
      id: 'skill_general',
      name: 'Général',
      icon: '💬',
      modelId: null,
      temperature: null,
      maxTokens: null,
      systemPrompt: '',
      builtIn: true,
    },
    {
      id: 'skill_code',
      name: 'Code',
      icon: '💻',
      modelId: 'claude-sonnet-4-6',
      temperature: 0.2,
      maxTokens: 8192,
      systemPrompt: 'Tu es un expert développeur. Fournis du code précis, commenté et testé. Préfère des exemples concrets et explique les choix techniques.',
      builtIn: true,
    },
    {
      id: 'skill_writing',
      name: 'Rédaction',
      icon: '✍️',
      modelId: 'gemini-2.5-pro',
      temperature: 0.8,
      maxTokens: 4096,
      systemPrompt: 'Tu es un expert en rédaction et communication. Aide à structurer, améliorer et reformuler les textes avec clarté, style et précision.',
      builtIn: true,
    },
    {
      id: 'skill_search',
      name: 'Recherche',
      icon: '🔍',
      modelId: 'sonar-pro',
      temperature: 0.5,
      maxTokens: 2048,
      systemPrompt: 'Tu es un assistant de recherche. Fournis des informations précises, actuelles et sourcées. Structure tes réponses avec des titres clairs.',
      builtIn: true,
    },
    {
      id: 'skill_analysis',
      name: 'Analyse',
      icon: '🧮',
      modelId: 'gemini-2.5-pro',
      temperature: 0.1,
      maxTokens: 8192,
      systemPrompt: 'Tu es un expert en analyse et raisonnement structuré. Décompose les problèmes méthodiquement, identifie les patterns et présente des conclusions argumentées.',
      builtIn: true,
    },
  ],
};

// Récupère un modèle par son ID
function getModelById(id) {
  return MUNNIN_CONFIG.models.find(m => m.id === id) || null;
}

// Récupère les modèles groupés par provider
function getModelsByProvider() {
  const groups = {};
  for (const model of MUNNIN_CONFIG.models) {
    if (!groups[model.provider]) groups[model.provider] = [];
    groups[model.provider].push(model);
  }
  return groups;
}
