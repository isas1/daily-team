# 2026-10-14: Graveyard Shift

[Today](../../README.md) · [Archive](../../ARCHIVE.md)

<img src="team.png" alt="Team for 2026-10-14: Radio producer · Industrial designer · Museum curator · Odysseus" width="100%">

**Task:** Long task: a Claude Code job that runs for hours while no one watches.

**Constraint:** No more than two levels of heading.

**Season:** 2026-10-12

**Decision:** The page is an overnight radio station that only broadcasts while the visitor's tab is hidden, calls them back through the tab title like a singer, and gives them the night's tape when they return.

## Asset

<a href="artifact-1.html"><img src="artifact-1.png" alt="Screenshot of artifact-1.html" width="100%"></a>

[Use it](https://isas1.github.io/daily-team/2026-10-14/) · [artifact-1.html](artifact-1.html), led by Radio producer. Model: claude-opus-5-5.

## The session

### Pitch

**1 · Radio producer: Graveyard Shift**\
Two a.m. on a station nobody hears. The job is the host.\
Every log line goes out as a voice. Every tool call is a cart: a click, a jingle.\
Dead air is the only failure. A long silence means it is stuck.\
You tune a dial and drop in at any hour. You hear what is on air now and nothing earlier.\
I want the hiss under it. Real tape noise. That is what makes four hours feel like four hours.

**2 · Industrial designer: Out of Sight**\
The page only works while you are not on it.\
Switch tabs and it builds. Come back and it freezes, mid-stroke.\
Black text on grey. One line every few seconds. It would run on a phone from 2011 over a train's wifi.\
The machine is a plotter drawing one long line across a strip of paper.\
Watching it is what stops it. You learn to leave.

**3 · Museum curator: The Night Wing**\
Three rooms, left to right. I have drawn them.\
Room one: the desk at dusk. A prompt on a card, a cold mug, the lamp still on.\
Room two: the gallery after closing. Nobody in it. The work moves on its own.\
Room three: morning. The result under glass, with a small label of what it cost.\
The feeling I am guarding is coming home to a house where someone worked while you slept.

**4 · Odysseus: The Mast**\
I have sailed past singers. You do not fight them. You tie yourself down and keep the oars moving.\
The visitor sets the course, then binds their own hands. One click, and the cursor is rope.\
The page sings to them. "Step in. It is failing. Only you can fix it." Lies, mostly.\
If they cut the rope and steer, the ship turns toward the rocks.\
What is left when you strip it all away: the hard part of a long voyage is keeping your hands off the tiller.

### Clash

**1 · Radio producer:** Designer, the hidden tab is the best idea here. It is also silent, and a silent station is a dead station. Who hears the plotter?

**2 · Industrial designer:** Nobody, while it runs. That is the honest part. Your station needs a listener at three a.m. to be worth anything.

**3 · Museum curator:** Then draw me what the visitor sees in room two. A frozen line is a blank wall. I cannot hang a blank wall.

**4 · Odysseus:** You see the singers. Designer's page goes dark, and the dark calls you back. The tab title flickers. "Come look." That is the song.

**1 · Radio producer:** Lovely. And then if they click, the ship hits the rocks and they lose everything? That is a trap with a moral stapled to it.

**2 · Industrial designer:** I'll side with him. The loss should be real. On a slow phone you get one run per evening. Waste it and it is gone.

**4 · Odysseus:** The curator has drawn three rooms and said the least. Curator, what do you fear?

**3 · Museum curator:** A lecture. If the page scolds them for coming back, morning feels like a fine. Morning should feel like a gift on the step.

**1 · Radio producer:** Then the gift is the tape. They come back and hear the whole night played back, fast, with the hiss.

**2 · Industrial designer:** Audio on a 2011 phone over train wifi. You still have not shown me that it plays at all.

### Decision

The page is an overnight radio station that only broadcasts while the visitor's tab is hidden, calls them back through the tab title like a singer, and gives them the night's tape when they return.

Concept: Graveyard Shift

- Radio producer: the station frame, the dial, tool calls as carts, the tape hiss, and the playback of the whole night on return.
- Industrial designer: the hidden-tab rule. Looking pauses the broadcast. Text-first layout, one line every few seconds, no assets over 40 KB.
- Museum curator: three acts drawn as three states. Dusk is a lamp, a card, and a dial. The Shift is the hidden tab. Morning is the tape under glass with a label: hours, lines aired, silences.
- Odysseus: the binding gesture at the start, a rope drawn across the dial, and the singers in the tab title. Returning early cuts the rope.
- Odysseus and the designer lost the shipwreck. Returning early only ends the shift at that hour, and the tape keeps what aired. The curator's fear of a scolding morning outweighed their case for a real loss. The designer's question about audio on slow devices is still open.

### Build notes

1. Use the `visibilitychange` event to drive one state machine with three states, `dusk`, `shift`, `morning`. Advance the fake job log only while `document.hidden` is true. Store each aired line with a timestamp in `localStorage`. Gaps longer than 90 seconds count as dead air.
2. Build the sound with the Web Audio API alone. Pink noise through a 3 kHz lowpass for the hiss, a 40 ms click for each tool call, and a two-note sine cart for each finished step. On return, play the stored night at 8x with `speechSynthesis` reading every fifth line. If `AudioContext` fails, show a scrolling paper-tape transcript instead.
3. Rotate the tab title every 20 seconds during the shift through six lines such as "It stalled. Come see." and "One question for you." Draw the rope as a single SVG path across the dial. Clicking it in dusk binds the visitor. Returning before the job's 40th line shows the rope cut, the hour the shift ended, and the tape so far.

**Guest:** Odysseus (myth; Greek myth). The method is drawn from public-domain history, myth, or literature, or invented. The guest speaks in character in original words, never quoting the source, and nothing here is endorsed by anyone.

## Team

```text
Team for 2026-10-14
Season: 2026-10-12

1. Radio producer
   Method: Prototype in the final material.
   Stance: Defends the material.
   Temperament: Praises an idea, then takes it apart.
2. Industrial designer
   Method: Design for the slowest device and connection first.
   Stance: Pushes toward the strange.
   Temperament: Sides with whoever is losing.
3. Museum curator
   Method: Structure it in three acts.
   Stance: Guards the feeling it leaves behind.
   Temperament: Will not accept a plan they cannot draw.
4. Odysseus (myth; Greek myth) [guest]
   Method: Go around what you cannot beat head-on.
   Stance: Cuts until only the core is left.
   Temperament: Insists on hearing from the quietest person.

Constraint: No more than two levels of heading.
Task: Long task: a Claude Code job that runs for hours while no one watches.
```

Provider: claude. Model: claude-opus-5-5.
