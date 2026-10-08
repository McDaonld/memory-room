# Verification record — 2026-10-08

This record describes checks performed while preparing version 0.1.0. It is not a claim of complete browser, accessibility, legal or security certification.

## Local checks

Environment: Windows, Node.js 24.19.0. The public distribution has 119 files, including 20 GLB models and 23 JSON files.

- JavaScript syntax checks and 98 relative module imports passed.
- All 23 JSON files parsed.
- All 20 GLBs passed structure, buffer-range and image/texture absence checks.
- The actual bundled Three.js GLTFLoader parsed every GLB; each scene had nonempty finite bounds.
- All 15 generated sample images decoded; the 12 document page references resolved.
- Six regression tests passed: contact versus penetration; transformed bounds without source mutation; collision along a path between clear endpoints; explicit sampling-budget failure; deferred phone layout changes; and the local server's HTTP behavior/path containment.

## Browser checks

Tested in the Codex in-app browser against the local static server at 1280 × 720 and a temporary 390 × 844 viewport.

- Room finished loading and displayed the desk, shelves, books, computer and example artwork.
- Main example book could be selected and opened; the next-page control advanced from page 1 to pages 2–3.
- Narrow layout switched to single-page reading. Next-page control and table-of-contents toggle responded.
- The book could be put back, the computer view opened and the camera returned to the room.
- No warning or error was captured in the browser log during this smoke check.
- A duplicate title overlay on the public book cover was found during visual inspection, removed and reloaded before further checks.

Screenshots in `docs/images/` are actual local browser captures. These checks do not cover every object, phone hardware, pointer gesture, operating system or GPU.

## Public model preparation

The original private prototype is outside this repository. The public model set totals 24,910,944 bytes. Thirty-eight embedded source-image entries were removed, and binary buffers were rebuilt from reachable retained geometry. No complete source-image payload or tested 256-byte interior sample was found in any output. Removed character/game meshes were not retained as unreachable binary data.

The neutral folding object was rebuilt from three primitive meshes, without source-game geometry, skin or animation. Its displayed movement bounds were measured from the new vertices. Public models have zero skins and zero native animation clips; procedural app interactions remain available where implemented.

Separate numerical checks exercised the folding object's and cup's show/rotate/return behavior, the abstract toy's full rotation and reset, the computer screen's retained UV interface and the pendant attachment root. These are interface tests, not full visual tests.

## Remaining limits

- Real mobile hardware, Safari and Firefox were not tested in this preparation session.
- Performance numbers and adoption metrics have not been collected.
- The font files and accompanying licenses were retained byte-for-byte; font internal name tables were not independently audited.
- The public scene still has legacy internal asset/node identifiers. They preserve code compatibility and do not represent included licensed game artwork.
- Automated privacy scans detect known classes of paths/identifiers, not every possible personal fact.
- The checked-in CI workflow runs package/core checks on future changes; hosted CI status must be checked independently on GitHub.
