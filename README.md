# Muninn

Application web statique multi-modèles LLM (chat, génération d'images, voix),
100 % côté navigateur — pas de serveur, pas de build.

> Muninn (« Mémoire »), l'un des deux corbeaux d'Odin avec Huginn. Cette app
> garde vos conversations et préférences en mémoire locale, et fait le pont
> avec une vingtaine de modèles d'IA.

## Fonctionnalités

- **Multi-provider** : Google Gemini, Anthropic Claude, Mistral, DeepSeek,
  Qwen, Perplexity (Sonar), OpenRouter (MiniMax, MiMo, FLUX, Ideogram,
  Recraft, Seedream).
- **Streaming SSE natif** depuis le navigateur, sans backend.
- **Génération d'images** (Imagen, FLUX, Ideogram, Recraft, Seedream).
- **Voix** : reconnaissance vocale (STT) et synthèse (TTS) via Web Speech API
  (fr-FR).
- **Recherche web** intégrée via les modèles Sonar de Perplexity.
- **Pièces jointes** : images et fichiers selon les capacités du modèle.
- **Multi-utilisateurs** locaux, dossiers de conversations, skills
  configurables (Code, Rédaction, Recherche, Analyse).
- **Suivi du budget** (limites quotidienne / hebdo / mensuelle).
- **Auto-troncation** du contexte en cas de dépassement, retry exponentiel
  sur 429, extraction des blocs `<think>`.
- **4 thèmes** : Dark Scarlet, Dark Bronze, Daltonien (accessible), Clair.

## Démarrage

```bash
# Servir les fichiers via n'importe quel serveur HTTP statique :
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Au premier lancement, ouvrir les paramètres (icône engrenage) et renseigner
les clés API des fournisseurs que vous souhaitez utiliser.

## Sécurité — à lire

Les clés API sont stockées en **clair dans `localStorage`** du navigateur.
C'est un choix d'architecture (app perso, sans serveur). Conséquences :

- N'utilisez Muninn **que sur un appareil de confiance**.
- Les requêtes partent **directement** de votre navigateur vers les APIs des
  fournisseurs (CORS doit être autorisé — c'est le cas pour tous les
  endpoints listés).
- Ne déployez pas cette app publiquement avec vos clés dedans.

## Structure

```
.
├── index.html          # Shell UI complet
├── css/
│   ├── themes.css      # Variables des 4 thèmes
│   └── app.css         # Styles application
├── js/
│   ├── config.js       # Catalogue modèles + endpoints
│   ├── storage.js      # Persistance localStorage
│   ├── api.js          # Couche multi-provider + streaming
│   ├── speech.js       # STT/TTS Web Speech API
│   └── app.js          # Contrôleur UI principal
└── assets/             # Logos et images
```

## Dépendances externes (CDN)

- [marked](https://github.com/markedjs/marked) — rendu Markdown
- [highlight.js](https://highlightjs.org/) — coloration syntaxique

## Licence

Tous droits réservés — projet personnel non-distribué.
