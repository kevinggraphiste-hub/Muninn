# Changelog

Toutes les évolutions notables de ce projet sont consignées ici.
Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le
versionnement [SemVer](https://semver.org/lang/fr/).

## [Unreleased]

## [2.1.0] - 2026-05-20

### Added

- Registre central `Providers` (`js/providers.js`) calqué sur l'architecture
  Gungnir : chaque provider expose `keyFormat`, `getKeyUrl`, `storageKey` et
  une fonction `test(key)` qui probe l'API du fournisseur pour valider la clé.
- Validation **live** des clés API dans la modal "Clés API" :
  ✓ valide / ✗ refusée / ⏳ en cours / ⚠️ format suspect / ⚠️ réseau-CORS.
- Test au save, au blur, et debounce 600 ms pendant la saisie.
- Lien direct "🔗 Obtenir une clé" sur chaque card pointant vers la console
  du fournisseur (AI Studio, Anthropic Console, Mistral Console, etc.).
- Indicateur global dans la sidebar : dot vert si ≥1 clé valide, rouge si
  ≥1 invalide, jaune si seulement des incertitudes (CORS/5xx).
- Messages d'erreur typés côté chat : 401/403 (clé), 402 (crédits),
  404 (modèle), 5xx (serveur), au lieu du générique "Provider erreur N".

### Changed

- L'utilisateur peut maintenant configurer ses clés en autonomie complète
  sans devoir consulter une doc externe.

## [2.0.0] - 2026-05-20

### Initial

- Import de la base Muninn V2 existante.
- Application web statique multi-provider (Gemini, Claude, Mistral, DeepSeek,
  Qwen, Perplexity, OpenRouter) avec streaming SSE côté navigateur.
- Génération d'images (Imagen, FLUX, Ideogram, Recraft, Seedream).
- Voix STT/TTS Web Speech API, recherche web, pièces jointes.
- Persistance `localStorage` multi-utilisateurs, dossiers, skills, budget.
- 4 thèmes : Dark Scarlet, Dark Bronze, Daltonien, Clair.
