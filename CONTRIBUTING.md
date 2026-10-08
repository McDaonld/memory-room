# Contributing

Thank you for improving Memory Room. Small reproducible changes are welcome.

1. Run the current version and describe the problem or desired behavior.
2. For a bug, include browser/version, viewport size, steps, expected/actual results and whether WebGL is available. Remove private content from screenshots and console logs.
3. Keep each pull request focused. Explain what changed and how it was checked.
4. Run `node scripts/verify.mjs` and `node --test tests/*.test.mjs`.
5. For scene, camera or reading changes, also test a desktop and a narrow viewport. Check startup, opening a book, turning pages, returning home, object inspection and resizing during reading. State anything you could not test.

Do not submit personal photographs, identity documents, copied game models, commercial artwork, credentials or content without redistribution permission. Describe the license and source of any new dependency or asset. New example content should be original, generic and replaceable.

Preserve public module interfaces or document breaking changes. The old brand-like node and asset names are compatibility identifiers; prefer neutral names for new interfaces.

The maintainer reviews issues and pull requests as capacity permits. There is no guaranteed response time or support contract. AI-assisted contributions are accepted; contributors remain responsible for the accuracy and licensing of their changes.
