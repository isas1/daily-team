# Vendored files for the studio tier

`run.mjs` inlines these into studio-day pages when the page asks for them with
`<script data-lib="name"></script>` or `<style data-font="name"></style>`. Each file's SHA-256
is in `manifest.json`; `inlineVendor` refuses a file that does not match.

| Name | File | Source | License |
|---|---|---|---|
| three | three.js | npm three@0.186.1 + addons, bundled from `three-entry.js` with esbuild 0.25.10: `esbuild three-entry.js --bundle --format=iife --global-name=THREE --minify --legal-comments=none` | MIT |
| anime | anime.js | cdnjs animejs/4.5.0/anime.umd.min.js (cdnjs SRI checked) | MIT |
| regl | regl.js | cdnjs regl/2.1.1/regl.min.js (cdnjs SRI checked) | MIT |
| tone | tone.js | cdnjs tone/15.1.22/Tone.min.js (cdnjs SRI checked) | MIT |
| matter | matter.js | cdnjs matter-js/0.20.0/matter.min.js (cdnjs SRI checked) | MIT |
| fraunces | fraunces.woff2 | @fontsource/fraunces 5.3.0, latin 700 | OFL-1.1 |
| bricolage | bricolage.woff2 | @fontsource/bricolage-grotesque 5.3.0, latin 400 | OFL-1.1 |
| plex-mono | plex-mono.woff2 | @fontsource/ibm-plex-mono 5.3.0, latin 400 | OFL-1.1 |

To add or update a file: replace it, update `manifest.json` (version and sha256), and run the tests.
