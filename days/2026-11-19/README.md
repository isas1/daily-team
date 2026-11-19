# 2026-11-19: Pattern Scale

[Today](../../README.md) · [Archive](../../ARCHIVE.md)

<img src="team.png" alt="Team for 2026-11-19: Furniture designer · Architectural model maker · Color grading specialist · Orbital mechanic" width="100%">

**Task:** Find a documented problem and build one offline tool that completes the real task. Use a reviewed brief if live leads lack a concrete problem.

**Run result:** Cannot find package 'playwright' imported from /home/runner/work/daily-team/daily-team/solution-check.mjs

**Constraint:** An open overlay closes with the escape key.

**Season:** 2026-11-09

**Decision:** Type how big your printed test square came out, and get the exact printer scale to use next.

## Feed evidence

- github-trending: fetched (15 items)
- smashing: fetched (12 items)
- hacker-news: fetched (20 items)
- Problem source: Calibrate printed sewing patterns — https://www.reddit.com/r/SewingForBeginners/comments/1wn8svu/

[Saved planning input](planning-input.json)

## Asset

artifact-1.html: no asset. Cannot find package 'playwright' imported from /home/runner/work/daily-team/daily-team/solution-check.mjs

## The session

### Pitch

### Clash

**3 · Color grading specialist:** Quick test. 10 cm square, printed at 97%, measured 10.3. I get 94.2%.

**2 · Architectural model maker:** I'd have said 97.1%. Show me.

**3 · Color grading specialist:** 100 times 10 over 10.3 is 97.1. That assumes the last print was at 100. It was at 97. Multiply 97 instead and you get 94.2.

**2 · Architectural model maker:** Fine, I'm convinced. The last-scale field stays. I wanted to cut it.

**4 · Orbital mechanic:** Unresolved. Someone measures in millimetres and types 103 into a centimetre form. Your tool says print at 9.4% and they waste a sheet.

**1 · Furniture designer:** Back to the goal. One good sheet. A wild ratio has to stop before Print.

**4 · Orbital mechanic:** Then refuse anything outside 0.75 to 1.33 times. Name the ratio. Say "check the unit."

**3 · Color grading specialist:** I tried it. 103 over 10 reads as 10.3 times. That message is clear enough to act on.

### Decision

Type how big your printed test square came out, and get the exact printer scale to use next.

Concept: Pattern Scale

Contributions:
- **Architectural model maker:** The compounding rule, where the new scale equals the last scale times intended over measured. Also the cut down to three inputs.
- **Color grading specialist:** The cutting-mat surface. A test of ease-out against linear at 160 ms; ease-out was chosen because the ghost square settles without overshoot.
- **Orbital mechanic:** The ratio guard from 0.75 to 1.33 with a named-unit error. A fixed-height diagram so the inputs never shift while the square animates.
- **Furniture designer:** A reduced-motion check, where the ghost square jumps with no tween. The printable calibration sheet as the thing the session leaves behind.

The square diagram shows its active state without relying on color. The measured square is dashed and the intended square is solid.

On screen there are about 20 words: title, four labels, Calculate, the result line and Print test page. The work surface is the cutting-mat panel. It holds an intended square in solid ink and a dashed square for the measured size, drawn in proportion.

On a phone the order is:
1. Result line.
2. Inputs.
3. Mat diagram.
4. A sticky Print test page button.

The test page opens in a native `<dialog>` that closes with Escape and returns focus to the Print test page button.

### Build notes

1. **Form and logic.**
   - Build one HTML page with these controls: `solution-intended` (text, decimal), `solution-unit` (select: `in`, `cm`), `solution-measured`, `solution-last` (percent, default 100), and the `solution-calc` button.
   - Show output in `solution-result` and errors in `solution-error`. Use `aria-live` on both.
   - Compute `last × intended ÷ measured`, rounded to 0.1, and show it as "Print at N%".
   - If measured ÷ intended falls outside 0.75 to 1.33, clear the result. Show the ratio to one decimal with an instruction to check the unit.
   - Reject empty or non-positive numbers with an inline error.
   - First case: intended `2`, unit `in`, measured `2.08`, last `100`, then click Calculate. Expect `solution-result` to read "Print at 96.2%".
2. **Mat diagram.**
   - Use an SVG at a fixed 220 px height. The background is cutting-mat green #2f5d50 with a #e8efe9 1 cm grid.
   - Draw the solid ink intended square and the dashed measured square, scaled by the ratio.
   - On Calculate, tween the dashed square onto the solid one over 160 ms with ease-out. Under `prefers-reduced-motion`, jump with no tween.
   - Use mono type for numbers and sans for labels. Paper is #f7f4ec and ink is #1b1b1b.
3. **Calibration sheet.**
   - `solution-print` opens the `<dialog id="solution-sheet">`. It shows the square at true physical size using CSS `in` or `cm`, the line "Set printer scale N%", and a `solution-sheet-print` button that calls `window.print()`.
   - Add `@media print` rules so only the sheet prints.
   - Escape and `solution-sheet-close` both close the dialog. Focus returns to `solution-print`.
   - Store the last computed scale in `localStorage` as a suggestion. A filled value always overrides it.

```json
{"schemaVersion":1,"name":"Pattern Scale","audience":"Home sewers printing PDF sewing patterns on a home printer","problem":"A printed test square measures larger than intended, and guessing a new printer percent wastes paper and risks a wrong-size garment","interaction":"Type intended side, unit, measured side and last print scale, press Calculate, then print the one-page calibration sheet","outcome":"One exact scale percent to type into the print dialog, plus a printable sheet with a true-size square and that percent","recovery":"A measured/intended ratio outside 0.75 to 1.33 clears the result and names the ratio with a unit check; correcting the field and recalculating restores a valid percent","mechanism":"New scale = last scale x intended / measured; ratio guard blocks unit mix-ups; dashed measured square tweens onto the solid intended square on a cutting-mat grid","difference":"Usual approach: print at actual size, measure, guess a new percent, reprint. Pattern Scale computes the percent from the last scale, so the sewer reprints one test page with a computed value instead of a guessed one, and a unit mix-up is flagged before printing","whyNow":"Saved reviewed brief reddit-1wn8svu, reviewed 2026-11-19, documents the problem and workaround; no live feed item supports it; no demand figures claimed","sourceIds":["reddit-1wn8svu"],"evidenceStatus":"sourced","proof":{"workaround":"Print at actual size, check the test square with a ruler, then adjust printer scale and print again if needed.","gap":"No exact scale is calculated from the measured and intended lengths, and there is no single calibration page to print before the full pattern.","improvement":"Replaces a guessed reprint percent with one computed value based on the last scale used, and stops unit mix-ups before a sheet is printed; a reviewer can check the percent by hand"},"cases":[{"phase":"primary","steps":[{"action":"fill","target":"solution-intended","value":"2"},{"action":"select","target":"solution-unit","value":"in"},{"action":"fill","target":"solution-measured","value":"2.08"},{"action":"fill","target":"solution-last","value":"100"},{"action":"click","target":"solution-calc"}],"expect":{"target":"solution-result","text":"Print at 96.2%"}},{"phase":"alternate","steps":[{"action":"fill","target":"solution-intended","value":"10"},{"action":"select","target":"solution-unit","value":"cm"},{"action":"fill","target":"solution-measured","value":"10.3"},{"action":"fill","target":"solution-last","value":"97"},{"action":"click","target":"solution-calc"}],"expect":{"target":"solution-result","text":"Print at 94.2%"}},{"phase":"mistake","steps":[{"action":"fill","target":"solution-intended","value":"2"},{"action":"select","target":"solution-unit","value":"in"},{"action":"fill","target":"solution-measured","value":"5.2"},{"action":"fill","target":"solution-last","value":"100"},{"action":"click","target":"solution-calc"}],"expect":{"target":"solution-error","text":"Measured is 2.6 times the intended size. Check the unit."}},{"phase":"recovery","steps":[{"action":"fill","target":"solution-measured","value":"2.06"},{"action":"click","target":"solution-calc"}],"expect":{"target":"solution-result","text":"Print at 97.1%"}}],"craft":{"rule":"Architectural model maker's rescale rule: a model is rescaled from its current ratio, not from life. New scale = last scale x intended / measured, so a 97% print measuring 10.3 cm on a 10 cm square gives 94.2%, not the 97.1% you get from 100%.","design":"Surface: cutting-mat panel, green #2f5d50 with a 1 cm grid, solid intended square, dashed measured square. Phone: result, inputs, mat, sticky Print test page. Mono numbers, sans labels, ink on paper #f7f4ec. Sparse, about 20 words. 160ms ease-out snap; no tween with reduced motion.","trial":{"start":"10 cm test square, unit cm, last print scale 97, fresh page","action":"Fill intended 10, measured 10.3, last 97, press Calculate","result":"Result reads Print at 94.2%; dashed square snaps onto the solid square","mistake":"Measured in millimetres and typed 103 while unit is cm","recovery":"Error names a 10.3 times ratio and asks for a unit check; retype 10.3, press Calculate, Print at 94.2% returns"}},"alternatives":[{"name":"Pattern Scale","need":"Exact printer scale after a test square prints wrong","mechanism":"Compounds correction on the last scale used, guards the ratio, prints a true-size calibration sheet","action":"Type intended, measured and last scale, press Calculate","result":"One percent for the print dialog and a printable one-page sheet","rejection":"Selected: matches the reviewed brief directly and fits three inputs and one output"},{"name":"Tile Map","need":"Tiled pattern pages drift at the joins","mechanism":"Per-edge overlap errors mapped onto a page grid to locate the shifted sheet","action":"Enter overlap error at each page edge","result":"Grid marks which page shifted and by how much","rejection":"Rejected: the brief documents overall size error, not tile alignment"},{"name":"Vernier Strip","need":"Read scale error without a fine ruler","mechanism":"Printed vernier strip whose aligned tick converts to a percent","action":"Print the strip and enter the aligned tick number","result":"Scale percent read from the tick","rejection":"Rejected: the reference comes from the same faulty printer and still needs a ruler to verify"}]}
```

**Guest:** Orbital mechanic (future; invented). The method is drawn from public-domain history, myth, or literature, or invented. The guest speaks in character in original words, never quoting the source, and nothing here is endorsed by anyone.

## Team

```text
Team for 2026-11-19
Season: 2026-11-09

1. Furniture designer
   Method: Check the control with motion turned off.
   Stance: Guards the feeling it leaves behind.
   Temperament: Restates the goal whenever the talk drifts.
2. Architectural model maker
   Method: Make the active state clear without relying on color.
   Stance: Cuts until only the core is left.
   Temperament: Changes their mind after a useful demonstration.
3. Color grading specialist
   Method: Compare two easing curves at the same duration.
   Stance: Defends the material.
   Temperament: Answers a question with a quick experiment.
4. Orbital mechanic (future; invented) [guest]
   Method: Keep controls clear while the whole frame moves.
   Stance: Pushes toward the strange.
   Temperament: Tracks the unresolved point until someone answers.

Constraint: An open overlay closes with the escape key.
Task: Folder trail: breadcrumbs for a file browser that show the current folder and let someone return to a parent.
```

Provider: claude. Model: claude-opus-5-5.
