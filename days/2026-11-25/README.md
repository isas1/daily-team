# 2026-11-25: Station Merge

[Today](../../README.md) · [Archive](../../ARCHIVE.md)

<img src="team.png" alt="Team for 2026-11-25: Seismologist · Science demonstrator · Haptic interaction designer · Deep space dispatcher" width="100%">

**Task:** Find a documented problem and build one offline tool that completes the real task. Use a reviewed brief if live leads lack a concrete problem.

**Run result:** browser mistake failed: solution-error did not show the expected visible result after the saved steps

**Constraint:** Space and enter trigger focused buttons.

**Season:** 2026-11-09

**Decision:** Paste your master list and new rows, press Compare, decide each unsure pair, then download one clean list.

## Feed evidence

- github-trending: fetched (14 items)
- smashing: fetched (12 items)
- hacker-news: fetched (20 items)
- Problem source: Review possible duplicates before merging two lists — https://www.reddit.com/r/excel/comments/1xxlhji/

[Saved planning input](planning-input.json)

## Asset

artifact-1.html: no asset. browser mistake failed: solution-error did not show the expected visible result after the saved steps

## The session

### Pitch

### Clash

**2 · Science demonstrator:** Trying it. Master has 101 John Smith, 104 Ana Ruiz. Import has a blank-ID "Jon Smith" with John's email, 233 Ana Ruiz, and Li Wei. Compare.

**1 · Seismologist:** Jon shares one station, the email. Queue. Ana 233 versus 104, the IDs differ. Veto. She gets added. Li matches nothing. Added.

**4 · Deep space dispatcher:** A stranger expects two Anas to merge. They'll ask why there are two now.

**1 · Seismologist:** Then the summary says it. Two added, one to review. The veto is the answer. Same name, different employee.

**3 · Haptic interaction designer:** Here's the mistake. Someone copies the data rows and skips the header. The first row is "Li Wei, li@...". Now Li Wei becomes a column name.

**2 · Science demonstrator:** Quick check. Nothing in that row says Name. We stop at Compare, and nothing gets written.

**3 · Haptic interaction designer:** And the error names the column it couldn't find, and which box. Then they paste the header and press Compare again. Nothing else is lost.

**4 · Deep space dispatcher:** The download stays disabled and shows the pending count. One pending is honest.

### Decision

Paste your master list and new rows, press Compare, decide each unsure pair, then download one clean list.

Concept: Station Merge

**Seismologist:** The station rule.
- ID, Name and Email each count as one station.
- Different non-blank IDs veto any match.
- A matching ID merges.
- If an ID is blank, two agreeing stations merge and one agreeing station goes to review.

**Science demonstrator:** The sample that defines the primary case, and the requirement that rows stay on screen as monospaced text.

**Haptic interaction designer:** The header check that catches pasted rows without a header, and the cut caption, which leaves the first screen with four labels.

**Deep space dispatcher:** The disabled download that carries the pending count, and the one-pair-at-a-time review card with station marks.

**Rule effect.** The veto changes a state transition. A pair with an identical name and different IDs moves from "review" to "added" before any name comparison runs. The surprise is two Ana Ruiz rows in the output. The user can explain it from the ID station mark.

**Visual direction.**
- **Work surface:** Two monospaced lists face each other: Master on the left, Import on the right. A narrow station strip between them holds three marks: ID, Name and Email.
- **Review card:** The review card spans the strip. Agreeing marks are filled. An ID veto is marked in red.
- **Phone:** The order is Master, Import, Compare, the summary and review card pinned below, then Download.
- **Type and color:** Monospace with tabular figures for rows, sans-serif for labels. Ink on paper. Green marks agreement, red marks a veto or an error, and one blue focus ring.
- **Density and motion:** About 8 visible words at rest and about 30 with a review card showing. No motion.
- **Comparison with past projects:** Chained Scale used one equation line and Countermand used fixed rows. This project uses balance: two sides facing across a shared seam.

### Build notes

1. **Page structure.** Build one offline HTML page with these native controls:
   - textareas `solution-master` and `solution-import`
   - button `solution-compare`
   - output `solution-summary` and error region `solution-error`
   - review card `solution-review` with buttons `solution-same` and `solution-different`
   - button `solution-download`

   Native buttons handle Space and Enter. Parsing works as follows:
   - Accept CSV or tab-separated input, including quoted fields.
   - Row 1 is the header. ID and Email columns are optional.
   - Each box requires a Name column. If it is missing, show the missing column and box in `solution-error` and change no state.

2. **Station rule.** Apply these steps in order:
   - Normalize names and emails: lowercase, trim and collapse spaces.
   - Different non-blank IDs: add the row as new.
   - Same ID: merge. Import values overwrite master values, and blank fields are filled.
   - Any ID blank: two agreeing stations merge, one queues the pair and none adds the row.

   Write `solution-summary` as "A added, M merged, R to review". Same merges the current pair. Different adds it. The summary updates after each decision.

3. **Download and first case.** `solution-download` stays disabled and reads "Download CSV (R pending)" while R > 0. When R is 0, it writes `merged.csv` in the master header order.

   First case:
   - Master:
     ```
     ID,Name,Email
     101,John Smith,john@acme.com
     104,Ana Ruiz,ana@acme.com
     ```
   - Import:
     ```
     ID,Name,Email
     ,Jon Smith,john@acme.com
     233,Ana Ruiz,ana.r@acme.com
     ,Li Wei,li@acme.com
     ```
   - Press Compare, then Same. `solution-summary` must read "2 added, 1 merged, 0 to review".

```json
{"schemaVersion":1,"name":"Station Merge","audience":"Spreadsheet beginners who fold recurring imports of hundreds of rows into a master list","problem":"Screening an import against a master list for duplicates needs a macro or Power Query, plus a manual review of possible matches before writing the master","interaction":"Paste master and import rows, press Compare, decide each queued pair with Same or Different, press Download CSV","outcome":"A summary of added, merged and pending rows, one near-match pair at a time with station marks, and a downloadable merged.csv once the queue is empty","recovery":"A missing Name header blocks Compare and names the box; pasting the header and pressing Compare again runs the merge with nothing lost","mechanism":"ID, Name and Email act as stations. Different non-blank IDs veto a match, the same ID merges, and with an ID blank two agreeing stations merge while one agreeing station queues the pair for review","difference":"Baseline is Excel Power Query fuzzy merge or a macro, which need setup and merge on name similarity. Here there is no setup, only one-station pairs are queued, and different IDs never merge","whyNow":"Reviewed brief reddit-1xxlhji (2026-11-19) states the workaround and gap. Today's live feeds list incidents and repositories with no stated user problem. No demand data beyond the brief","sourceIds":["reddit-1xxlhji"],"evidenceStatus":"sourced","proof":{"workaround":"Maintain a workbook macro or set up Power Query, then review potential matches before writing them to the master list","gap":"No reusable offline review step that takes pasted rows, queues near matches, keeps IDs and same-name records distinct until the user decides, and downloads the merged result","improvement":"No macro or query setup: paste, Compare, decide queued pairs, download. Same-name rows with different IDs are added as new rows, never merged, which a reviewer can check with two Ana Ruiz rows"},"craft":{"rule":"Seismologist's station agreement: a location needs agreeing stations. ID, Name and Email are stations; different IDs veto the pair before names are compared, two agreeing stations merge, one queues. Same-name rows 104 and 233 become two rows","design":"Work surface: Master and Import lists facing across a station strip of three marks. Phone: Master, Import, Compare, pinned summary and review card, then Download. Mono rows, sans labels, ink on paper, green agree, red veto and error, blue focus. About 8 words at rest. No motion","trial":{"start":"Fresh page. Master: 101 John Smith john@acme.com, 104 Ana Ruiz ana@acme.com. Import: blank-ID Jon Smith john@acme.com, 233 Ana Ruiz ana.r@acme.com, blank-ID Li Wei li@acme.com, all with an ID,Name,Email header","action":"Press Compare, check the review card shows Jon Smith against 101 with only Email filled, then press Same","result":"Summary reads 2 added, 1 merged, 0 to review. Download CSV enables, and merged.csv holds 101, 104, 233 Ana Ruiz and Li Wei","mistake":"User pastes import data rows without the header, so row 1 is Li Wei,li@acme.com and has no Name column","recovery":"Error names the missing Name column in the Import box. User pastes Name,Email above the row and presses Compare. Error clears, the summary shows the added row, and the master text is unchanged"}},"alternatives":[{"name":"Station Merge","need":"Merge a recurring import into a master list without merging distinct people","mechanism":"Station agreement over ID, Name and Email with an ID veto, a one-pair review queue and a download disabled while any pair is pending","action":"Paste master and import rows and press Compare","result":"A summary of added, merged and to-review rows, one review card with filled station marks, and merged.csv after the queue empties","rejection":"Selected: no setup, only ambiguous pairs need a decision, and different IDs never merge"},{"name":"Threshold Slide","need":"Merge fast with a single tolerance setting","mechanism":"Name similarity score with a slider; rows above the threshold merge automatically","action":"Drag the similarity slider from 60 to 95","result":"A merged count that changes with the slider position","rejection":"Rejected: it matches the usual fuzzy merge, merges same-name rows with different IDs, and hides which field caused each merge"},{"name":"Call It First","need":"Learn the master list by judging rows before the tool does","mechanism":"User tags each import row New or Duplicate; the tool then reveals its own call and counts disagreements","action":"Tag every import row New or Duplicate before pressing Reveal","result":"A disagreement score with the disputed rows listed","rejection":"Rejected: one decision per row is slow for hundreds of rows and produces no merged list"}],"cases":[{"phase":"primary","steps":[{"action":"fill","target":"solution-master","value":"ID,Name,Email\n101,John Smith,john@acme.com\n104,Ana Ruiz,ana@acme.com"},{"action":"fill","target":"solution-import","value":"ID,Name,Email\n,Jon Smith,john@acme.com\n233,Ana Ruiz,ana.r@acme.com\n,Li Wei,li@acme.com"},{"action":"click","target":"solution-compare"},{"action":"click","target":"solution-same"}],"expect":{"target":"solution-summary","text":"2 added, 1 merged, 0 to review"}},{"phase":"alternate","steps":[{"action":"fill","target":"solution-master","value":"ID,Name,Email\n101,John Smith,john@acme.com\n104,Ana Ruiz,ana@acme.com"},{"action":"fill","target":"solution-import","value":"ID,Name,Email\n101,John Smith,john.smith@acme.com\n,Ana Ruiz,ana@acme.com"},{"action":"click","target":"solution-compare"}],"expect":{"target":"solution-summary","text":"0 added, 2 merged, 0 to review"}},{"phase":"mistake","steps":[{"action":"fill","target":"solution-master","value":"ID,Name,Email\n101,John Smith,john@acme.com\n104,Ana Ruiz,ana@acme.com"},{"action":"fill","target":"solution-import","value":"Li Wei,li@acme.com"},{"action":"click","target":"solution-compare"}],"expect":{"target":"solution-error","text":"Import row 1 has no Name column."}},{"phase":"recovery","steps":[{"action":"fill","target":"solution-import","value":"Name,Email\nLi Wei,li@acme.com"},{"action":"click","target":"solution-compare"}],"expect":{"target":"solution-summary","text":"1 added, 0 merged, 0 to review"}}]}
```

**Guest:** Deep space dispatcher (future; invented). The method is drawn from public-domain history, myth, or literature, or invented. The guest speaks in character in original words, never quoting the source, and nothing here is endorsed by anyone.

## Team

```text
Team for 2026-11-25
Season: 2026-11-09

1. Seismologist [new]
   Method: Ask a visitor to predict the outcome before showing it, then compare the two. [new]
   Stance: Guards the feeling it leaves behind.
   Temperament: Tracks the unresolved point until someone answers.
2. Science demonstrator [new]
   Method: Use the last pass to remove visual and code clutter.
   Stance: Defends the material.
   Temperament: Answers a question with a quick experiment.
3. Haptic interaction designer [new]
   Method: Explain the project in three captions, then cut the one nobody needs. [new]
   Stance: Cuts until only the core is left.
   Temperament: Holds back until everyone has given a number.
4. Deep space dispatcher (future; invented) [guest]
   Method: Show pending work honestly when replies take a long time.
   Stance: Pushes toward the strange.
   Temperament: Asks what a stranger would expect next.

Constraint: Space and enter trigger focused buttons.
Task: Fieldnote sorter: a local tool for birdwatching clubs that tags sightings by time and place and shows which hours of the day bring the most variety.
```

Provider: claude. Model: claude-opus-5-5.
