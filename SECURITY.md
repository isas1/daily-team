# Security

Report a vulnerability through GitHub's private reporting: the Security tab, then "Report a vulnerability". Do not open a public issue.

In scope: the scripts, the workflows, how the API key is handled, and how generated HTML is contained.

You get a reply within 7 days. Confirmed problems are fixed within 30 days.

## Code scanning review, 2026-10-27

The 23 open findings were reviewed against main at `87c52e5`.

- #1: the goal tracker interpolated stored version fields into HTML. Version history now uses DOM nodes and `textContent`, including fields previously assumed numeric.
- #2–3: script assertions now match mixed case and attributes.
- #4–6: text extraction drops remaining angle brackets after removing markup. These helpers count words or prepare plain-text headlines; they are not HTML sanitizers. Generated scripts remain confined by the existing CSP and sandboxed frames.
- #7–10: Markdown table cells now escape backslashes, pipes, and HTML characters together and collapse whitespace.
- #23: malformed-credential messages now use fixed text without token lengths. Known provider credentials are also redacted from provider error messages before logging or saving failed records.

### Vendored Three.js findings #11–22

Each reported call invokes the bundled UUID generator (`gn`) for graphics identity:

| Alerts | Object |
|---|---|
| #11–12 | Texture source and texture |
| #13–14 | Object3D and buffer geometry |
| #15–17 | Interleaved buffer and array-buffer serialization/copy IDs |
| #18–20 | Material, skeleton, and shape |
| #21–22 | Animation clip and animation object group |

These IDs identify graphics objects; they are not passwords, sessions, authorization tokens, or capability URLs in this application. Cryptographic unpredictability is not required for these uses. Recommended disposition: dismiss these individual alerts as false positives with this rationale after review. Keep the vendored bundle and its manifest hash intact, and keep CodeQL enabled. Reassess if an application starts using graphics UUIDs as a security boundary.

Source fixes require a new CodeQL analysis before claiming the corresponding findings closed. This review does not itself dismiss any alerts.
