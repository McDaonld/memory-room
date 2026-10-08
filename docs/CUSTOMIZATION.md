# Customizing the room

The web root is `dist/`. All dependencies are bundled under `dist/vendor/`; app data and models are under `dist/assets/`.

## Text and book content

- `memoir-chapter-one.json`: main example reader, title and subtitle.
- `shelf-books.json`, `textbook-content.json`, `book-content-refined.json`: example shelf and study content.
- `book-identities.json`: visible covers, titles and metadata, keyed by scene object root.
- `yongwai/manifest.json` and `yongwai-scanned/public-transcripts.json`: sample document pages and corresponding text views. These legacy directory names are compatibility paths.
- `resume-document.json`: points to a generic project information sheet, not a person's résumé.

Keep the existing data shape and object root identifiers while replacing content. Change one entry first, run the checks, and confirm that it renders before replacing a whole book. Text pagination uses local fonts and canvas measurement, so long content can affect memory and performance.

## Models and artwork

The scene loads 20 GLB assets. Interaction code refers to node names for object roots and hinges. A model with a different hierarchy can look correct but fail to open, rotate or return to its original pose. Retain the relevant nodes or update their consumers together.

The bundled public models contain no embedded image textures. Original neutral illustrations are supplied separately as sample artwork. When adding your own material, inspect both external files and images embedded in GLB buffers before publishing.

## Static hosting

Publish the contents of `dist/` unchanged, including `assets/` and `vendor/`. Relative paths support deployment under a subdirectory. Serve JavaScript as JavaScript and JSON as JSON. A missing asset should return 404; avoid rewriting all missing asset requests to `index.html`.

Do not publish private editions of your room by accidentally copying an old assets folder over this public example.
