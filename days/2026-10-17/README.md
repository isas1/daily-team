# 2026-10-17: Put It in the Room

[Today](../../README.md) · [Archive](../../ARCHIVE.md)

<img src="team.png" alt="Team for 2026-10-17: Florist · Teacher · Calligrapher · Daedalus" width="100%">

**Task:** Mod workshop: a place to build a Claude Code mod from parts.

**Constraint:** Hides one thing for the curious to find.

**Season:** 2026-10-12

**Decision:** The page is a florist's bench where the visitor stands mod parts as stems in a vase that is a working terminal window, sets it on a desk to watch a scripted Claude Code session run through it, and must give every stem a way out before th...

## Asset

<a href="artifact-1.html"><img src="artifact-1.png" alt="Screenshot of artifact-1.html" width="100%"></a>

[Use it](https://isas1.github.io/daily-team/2026-10-17/) · [artifact-1.html](artifact-1.html), led by Florist. Model: claude-opus-5-5.

## The session

### Pitch

**1 · Florist: Put It in the Room**\
A bench, a bucket of cut parts. Hooks, slash commands, subagents, an MCP server, a status line.\
You pick stems and stand them in a vase. The vase is the terminal window.\
Then you set it on the desk and watch a real session run through it.\
A stem that clashes with its neighbour browns at the tip while the session plays.\
I don't trust a bouquet in the shop light. Show me it on the table it's going to.\
Hidden: one stem in the bucket has no label. It only opens in water.

**2 · Teacher: A Primer for Ines**\
One reader. Ines, who reviews pull requests alone at six in the morning before her kid wakes.\
A hand-bound picture book, twelve pages, each page one part of a mod, painted.\
Turn a page and the part is added to her setup, drawn into the margin of her desk.\
It has to be lovely or she won't open it at that hour.\
The last page is blank for her own part.\
Hidden: the endpaper has her coffee ring. Press it and it shows the whole file.

**3 · Calligrapher: The Unfinished Scroll**\
You never start a mod. You inherit one.\
The page opens on a scroll left by the last visitor, half-inked: two parts, a gap, a stroke stopped mid-line.\
You finish their line. You leave your own half-line for whoever comes after.\
The scroll is kept. It grows down the page for as long as the page exists.\
I'd want to see forty hands on it before I'd call it good.\
Hidden: the first stroke on the scroll is mine, under all the others.

**4 · Daedalus: The Workshop Has a Door**\
Every part you set down is a wall. A hook is a wall. A server is a wall that hums.\
Build, and the plan of your labyrinth rises around a small figure: the one who will run your mod someday.\
You are not done when it is full. You are done when that figure can walk out.\
Each wall needs its own gap: the off-switch, the uninstall, the line that undoes it.\
I wager you build a prison on the first try. Most do. I did.\
Hidden: a thread on the floor. Pull it and the maze comes apart into plain text.

### Clash

**1 · Florist:** Daedalus, show me a wall. A maze drawn on a screen is a picture of a maze. Where does the visitor stand when it runs?

**4 · Daedalus:** In your vase, Florist, and they will never leave it. A feather says so. Pretty things keep people. Give every stem a door or I take the feather back.

**2 · Teacher:** Florist, let me take the other side. Ines never sees a vase. Her screen is grey text. Why dress the terminal up at all? Make it as ugly as the place it lives.

**1 · Florist:** Because that is where it lives. I'll paint nothing that isn't there. The window stays a window. The stems stand in it. If it can't survive the real desk it goes in the compost.

**3 · Calligrapher:** Daedalus. I have kept three cases. A hook that fired twice on every save. A server that never closed its port. A command nobody remembered was installed. None had a way out. You are right, and I say it only because I have three.

**3 · Calligrapher:** Teacher, your book is for one reader, once. Ink for one person fades with her. Leave the finished arrangement on the bench for the next visitor.

**2 · Teacher:** Then the next visitor inherits a stranger's ugly thing and has to finish it. Who decides it's beautiful? I'll argue it straight: keeping things is how bad things survive.

**4 · Daedalus:** Teacher, a wager. The next one finds it, finishes it, pulls the thread, and walks out. If they get stuck in it, your Ines wins and the bench gets swept every night.

**1 · Florist:** Calligrapher, leave one on the bench tonight. I'll come back in the morning and see if it wilted.

### Decision

The page is a florist's bench where the visitor stands mod parts as stems in a vase that is a working terminal window, sets it on a desk to watch a scripted Claude Code session run through it, and must give every stem a way out before the arrangement holds.

Concept: Put It in the Room

- Florist: the bench, the bucket of six stems, the terminal-as-vase, and the session that plays on the desk with wilting at the point of clash.
- Teacher: the desk belongs to Ines. Her mug, her 6:04 clock, her one open PR. The session is hers, and the stems are drawn with care.
- Calligrapher: the last visitor's arrangement waits on the bench, half-pressed, and the new visitor finishes it before starting their own.
- Daedalus: each stem needs a cut at its base, its off-switch, or it browns after the run. The thread in the water is the hidden way out: pull it and the arrangement unravels into the plain config text the visitor built.
- Teacher lost the picture book. A book is read in a chair. A mod is used at the desk, and the Florist wanted it tested there. The question of whether keeping strangers' arrangements keeps ugly ones stays open between Teacher and Calligrapher. Daedalus lost the maze as the whole page, because the Florist asked where the visitor stands and the maze had no desk.

### Build notes

1. Build `index.html` with six SVG stems in a bucket: hook, slash command, subagent, MCP server, output style, status line. Dragging a stem into the 640×360 terminal vase adds its line to an in-memory config. Each stem has a small cut marker at the base. Clicking it attaches that part's off-switch, which removes it cleanly.
2. "Put it on the desk" plays a 14-second scripted session in the vase, with Ines's mug and 6:04 clock behind it. Two hooks on the same event make both stems brown at the tip mid-run. Any stem without a cut wilts at the end. The visitor can still press the arrangement with wilted stems, so the Teacher's wager stays live.
3. Save the pressed arrangement to `localStorage` under `bench.left`, minus its last stem, so the next load opens on a half-finished vase. The hidden thread appears after 6 seconds of hovering over the water line. Dragging it 200px down unspools the vase into the raw config text, one line per stem, with a note on the stem that has no label.

**Guest:** Daedalus (myth; Greek myth). The method is drawn from public-domain history, myth, or literature, or invented. The guest speaks in character in original words, never quoting the source, and nothing here is endorsed by anyone.

## Team

```text
Team for 2026-10-17
Season: 2026-10-12

1. Florist [new]
   Method: Test it in the place where it will be used.
   Stance: Breaks the frame.
   Temperament: Asks for a demonstration before any opinion.
2. Teacher
   Method: Name the audience as one specific person.
   Stance: Insists it must be beautiful.
   Temperament: Argues the opposite side to test an idea.
3. Calligrapher
   Method: Swap your draft with someone else's and finish theirs.
   Stance: Wants it to last.
   Temperament: Hoards evidence before saying anything.
4. Daedalus (myth; Greek myth) [guest]
   Method: Design the way out of whatever you build.
   Stance: Speaks for the one who finds it.
   Temperament: Turns every disagreement into a wager.

Constraint: Hides one thing for the curious to find.
Task: Mod workshop: a place to build a Claude Code mod from parts.
```

Provider: claude. Model: claude-opus-5-5.
