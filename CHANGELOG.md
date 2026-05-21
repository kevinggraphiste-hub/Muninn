# Changelog

Toutes les évolutions notables de ce projet sont consignées ici.
Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le
versionnement [SemVer](https://semver.org/lang/fr/).

## [Unreleased]

## [2.6.0] - 2026-05-21

### Added

- **Photo de profil par URL** : un avatar utilisateur peut être une URL
  d'image (http/https ou data:image) en plus d'un emoji. Bouton 🔗 dans le
  modal Utilisateurs pour coller ou retirer une URL. La photo s'affiche
  ronde dans la topbar, la liste des utilisateurs et les bulles de message.

### Security

- L'URL d'avatar est strictement validée (pas d'espaces/guillemets/chevrons,
  schémas http/https/data:image uniquement) et échappée dans l'attribut
  `src`, empêchant toute injection HTML via une URL forgée.

## [2.5.1] - 2026-05-21

### Changed

- **Correction d'orthographe dans tout le code** : `MUNNIN`/`munnin`
  (lettres N/I inversées) → `MUNINN`/`muninn`, conforme au nom du projet
  Muninn. Touche la constante `MUNINN_CONFIG`, les clés localStorage
  (`muninn_*`) et les assets (`Muninn.png/.svg/.svgz`).
- Migration localStorage transparente au démarrage : les anciennes clés
  `munnin_*` sont automatiquement recopiées vers `muninn_*` puis
  supprimées — **aucune perte de données** (settings, clés API,
  conversations, thème, favoris, caches).

## [2.5.0] - 2026-05-21

### Fixed

- **Favoris scopés par utilisateur** : la liste de favoris vivait dans une
  clé localStorage globale, donc partagée entre profils. Elle est désormais
  suffixée par l'id utilisateur (comme les conversations), avec migration
  automatique de l'ancienne clé au premier lancement.

### Added

- Indicateur **"⚠ catalogue live indisponible"** dans le Guide des modèles
  quand le fetch OpenRouter échoue (hors-ligne / CORS / service down).
  L'app reste fonctionnelle avec les modèles intégrés.
- Tooltip (nom — description — contexte) au survol des options du sélecteur
  de modèles, dont les descriptions sont tronquées.
- **Tests automatisés** sans dépendance (`npm test`) : 28 assertions sur la
  logique du catalogue (tiers, conversion de prix, prix variables,
  déduplication, mapping OpenRouter).

## [2.4.1] - 2026-05-21

### Fixed

- Le dropdown de sélection des modèles s'étirait jusqu'au bord droit de
  l'écran (régression v2.4.0 : flex-row + description sans wrap). Largeur
  fixée à 360px avec troncature ellipsis des descriptions.

## [2.4.0] - 2026-05-21

### Added

- Accès rapide aux **modèles favoris** côté chat (porté de Gungnir) : le
  sélecteur de modèles affiche une section "★ Favoris" en tête, et chaque
  option porte une étoile pour ajouter/retirer un favori directement.
- Synchronisation bidirectionnelle des favoris entre le Guide des modèles
  et le sélecteur du chat (même stockage localStorage, max 5, ordre
  d'ajout préservé).

## [2.3.1] - 2026-05-21

### Changed

- Le Guide des modèles passe des cards à un **listing tabulaire à colonnes
  alignées** (⭐ · Modèle · Description · Ctx · Vis. · In/1M · Out/1M · Prix),
  fidèle au plugin model_guide de Gungnir — bien plus lisible sur ~390
  modèles.

### Added

- Favoris dans le guide : étoile cliquable (max 5, persistés en
  localStorage), les modèles favoris remontent en tête du listing.

## [2.3.0] - 2026-05-21

### Added

- Refonte complète du **Guide des modèles** en version dynamique inspirée
  du plugin model_guide de Gungnir. Remplace ~445 lignes de HTML statique
  par un moteur qui lit le catalogue complet (~390 modèles) :
  - recherche plein-texte (nom / id / description)
  - filtres multi-select : provider, tier, capabilities (vision / outils /
    fichiers / image-gen)
  - tri par prix, contexte ou nom
  - "Choix rapide" calculé dynamiquement selon le catalogue courant
  - grid de cards responsive ; clic sur une card = sélection du modèle
  - compteur de résultats et légende des tiers
  - rebuild automatique à l'arrivée du catalogue live (`catalog:updated`)

### Fixed

- Les routeurs auto d'OpenRouter (prix `-1` = tarif variable) ne polluent
  plus le tri "moins cher" ni les quickpicks : ils sont marqués
  `pricing.variable` / `tier: unknown` et affichés "Variable".
- Suppression d'une double définition CSS `.modal-guide`.

## [2.2.0] - 2026-05-20

### Added

- Module `js/catalog.js` qui synchronise dynamiquement le catalogue des
  modèles avec l'API publique OpenRouter (`GET /api/v1/models`, sans clé,
  CORS `*`). Fetch au boot puis toutes les 15 min en arrière-plan, cache
  localStorage avec TTL de 5 min.
- ~350 modèles OpenRouter supplémentaires fusionnés automatiquement dans
  `MUNNIN_CONFIG.models` (avec dédup par id — les modèles hardcodés
  priment). Total : ~390 modèles disponibles dans le sélecteur.
- Métadonnées calquées sur Gungnir/model_guide : `tier` (free/cheap/
  budget/mid/premium/flagship/image), `contextTokens` (int), `supportsTools`
  (heuristique pour les hardcodés, détecté via `supported_parameters` pour
  les live).
- Badges tier `∅ ¢ $ $$ $$$ $$$$ 🖼️` dans le dropdown des modèles avec
  tooltip explicatif et couleurs sémantiques.
- Helpers catalogue : `parseContextString()`, `computeTier()`,
  `getModelsByTier()`.
- CustomEvent `catalog:updated` que les composants UI peuvent écouter
  pour se rebuilder à chaque rafraîchissement live.

### Changed

- Chaque entrée hardcodée de `MUNNIN_CONFIG.models` est désormais
  augmentée à la définition avec son `tier`, son `contextTokens` et son
  `supportsTools` dérivés — pas de modification manuelle requise sur les
  40 entrées existantes.

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
