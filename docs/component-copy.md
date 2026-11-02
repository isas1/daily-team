# Minimum interface copy

Owner direction, 2 November 2026: reduce visible text to the absolute minimum.

- A component starts with at most 12 visible words. Necessary data-heavy panels may use up to 24. Ceilings are not quotas; use fewer when possible.
- Count the rendered initial state, including JavaScript-generated text, field values, labels, sample rows and status. The source validator cannot establish this browser count.
- Keep only labels, task data, the current action and current feedback. Most labels need 1–3 words. Show one short error line when an error occurs.
- Remove introductions, subtitles, explanatory paragraphs, repeated headings/readouts, persistent keyboard tutorials, credits and demo/test controls. Start with 2–3 short sample rows; reveal more task data only when requested.
- Keep visible labels and accessible names. Do not hide essential meaning in ARIA, invent mystery icons, shrink type or clip required data to meet a budget.
- The primary action and result must fit a 252px content square with 44px tap targets. Use scrolling for genuine lists, not to rescue unnecessary copy.
- Connected projects keep full behavior, but use compact controls and contextual feedback. Label sample data once as “Demo”. Put credits, sources and optional help in a collapsed Details area.

Planning metadata may remain detailed. Do not copy purpose, mechanism, input instructions or recovery descriptions into the rendered tile.

Examples: “Card title” → “Title”; “Clipped after ‘new’ at phone width” → “Clipped”; “11 of 12 in bundle” → “11 / 12” with an accessible full count. Keep the hidden words themselves when the task is to reveal truncation.

The legacy 80-word markup gate remains a source ceiling for archive compatibility, not a design allowance. Browser review checks the stricter rendered budgets in normal, focus, active, empty and error states, in both themes and small/large frames. Necessary extra error/context text must remain concise and appear only while relevant.
