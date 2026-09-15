# Mobile item — slide 3 (השלבים), settled 13 Sep 2026

> Written to the repo because project memory was unavailable at the end of the session.
> Next session: move this into project memory as `project_mobile_slide3.md`, and add the
> footer rule below to `project_mobile_slide2.md`.

## State
Agreed: canvas "Item Slide 3 · Round 5" — artifact `35012b66-79ae-4cc2-8523-40ebef140e17`
(artboards: stage 4 = the page the slide opens on, stage 1 with the map, stage 5 unreached).
Earlier rounds: f9a7cd8d, f69eeac8, 2201b453, dd8b5bf0.

## The page
Each stage is a page in a vertical stack; the page itself never scrolls.

- Chrome as slides 1–2: one-path breadcrumb, dark grey `#121519`, dots (third lit).
- **Head**, as one group: the status chip as the stack's **title** — square-cornered tag
  (radius 3), stage-colour fill, dark ink, 19px bold (`4 · יושם`); the **stage definition**
  under it; then **date · age** (`25.10.2023 · 18 ימים אחרי 7.10`). A hairline rule closes
  the group and opens the body.
- **Definitions never use the stage's own term**: `התיקון דווח כמבוצע בשטח בידי הגוף האחראי`
  (יושם), `מה שקרה בשטח, כפי שנרשם בתיעוד ציבורי` (זוהה),
  `גוף שאינו הגוף האחראי בדק את התיקון בשטח ופרסם ממצאים` (אומת עצמאית).
- **Body** = slide 2's overview: lead sentence, paragraphs, dashed lines, bold scattered on
  key phrases, a source chip per sentence, sources carousel at the bottom. On stage 1 the
  **evidence map comes before the carousel**.
- **No painted backgrounds** — the stage-coloured pages were killed as a gimmick. Colour lives
  only in the status chip and the locator.
- Stage 5 (unreached): statement, who counts as a checking body, the `1,053 ימים` counter, and
  a dashed `יודעים אחרת?` box with `הגישו מקור`. No carousel.
- `חזרה לשלב הנוכחי` pill appears only when you are not on the current stage, arrow pointing
  the right way.

## Locator — the gate's ladder reused
- Five rungs, chronological downward, stage colours, dashed when unreached, **even spacing**
  (the gap before the unreached rung belongs to the gate only), no labels.
- **Viewed stage**: ring in the stage's own colour, 2px. **Current stage**: gold `#e0a44a` ring
  at half that, 1px. Viewed wins when they coincide.
- The ring is offset 2px from the rung. A hugging border was tried and rejected — a same-colour
  border is invisible against the fill.
- 10px gutter from the screen edge; body gutter 36px.
- **Trap**: in this RTL page `padding-inline-end` is the LEFT side. Set the gutter physically
  (`right: 14px`) and measure the render — this cost two rounds.

## Footer — new chrome rule
- Right: the **previous** slide with a right-pointing chevron. Left: the **next** slide with a
  left-pointing chevron.
- **Exception: slide 2 carries no previous-slide label** — the item page does not refer back to
  the gate. The rule applies to every other slide.
- Slide 3 only: `↑↓ שלבים` centred between them, as actual arrows.
- The `החליקו לצדדים` hint stays gate-only.

## Open
- Whether locator rungs are tappable jump targets (recommended — it makes the locator the
  navigation and the pill a convenience).
- Stage 1's head date is the documentation date (19.10.2023), not 7.10 itself.
- Five rungs as on the gate; a sixth stage appears only if reached — unconfirmed.
- The map is a placeholder drawing (two markers, שדרות · זיקים).
- Slides 4 and 5 must gain the previous-slide label when drawn.

---

# Slide 4 (דעת הציבור) — locked v1, 13 Sep 2026

Full spec lives in `docs/mobile-item.html` (v1.2, section 7). For project memory, the
points that are decisions rather than layout:

- The slide is **דעת הציבור**, not "the question". Its question is **generic in substance,
  phrased in the item's context** — for i13: `האם התרעות החדירה שהותקנו נותנות מענה לכשל המקורי?`
- Above it, three centred summary lines: the failure, what was reported since, and a dimmer
  caveat line. The first two carry source chips; **an absence gets no chip**.
- **No stage age on this slide.**
- Two versions: an MVP that shows the dimmed scale inside a dashed *opens later* box, and the
  full version with both opinion registers and the ballot. **The full version is the only
  scrolling screen in the item page** (~1,960px).
- Opinion registers ported from the desktop: analysts are silver bubbles with the stance only
  in the side rule and avatar ring, negatives mirrored, multi-author sources with a `+N` chip,
  **no ratings**; readers are the WhatsApp register with ratings, a cluster bubble for repeated
  answers, in a caged scrolling panel. Analysts scroll **uncaged** — a fade mask, no panel.
- Ballot states: empty → selected (gold, comment box, save) → saved (check, quiet
  `שינוי התשובה`, and the comment shown as the reader's own bubble whose lane and colour come
  from the rating).
- Standing rule, printed on the screen: **public answers never move the stage.** Only a
  documented outside check does.
- Slide 5 (`הלאה`) is the only screen left.

Canvases: slide 4 v1 MVP `7eebf4ca`, full `19d961ab`.

## Spec doc v1.3 — embedded screens (13.9.2026)

`docs/mobile-item.html` now carries a live screen inside each slide section, not
just prose. Mechanics, so the next round can regenerate them:

- Source of truth is the approved `.dc.html` artboard. `scratchpad/embed/extract.py`
  strips the `<x-dc>` / `<helmet>` wrappers, resolves the template holes
  (`{{tintOpacity}}` → 0.52, `{{bg}}` → `#121519`), inlines `hero.jpg` as a data URI,
  and re-emits the helmet's own rules **scoped** to a per-artboard class
  (`.scr-1`, `.scr-2`, …) so `.card` / `.chip` / `.dotmark` keep working.
- Trap that cost a pass: the spec's own stylesheet has a `.card` rule and element
  rules for `h2`, `p`, `code`, `table`. Dropping the artboard helmet let the doc's
  `.card` paint the source carousel **white in light mode**, killed the source chips
  on slides 2–3, and would have set slide 4's question in Frank Ruhl Libre. The doc
  now has a defensive `.scr` reset block plus the scoped helmets.
- Frames: `.vp` is a real 390 × 844 window at 1:1, no scaling. Slide 4's full version
  is the whole 1,960px page inside that window with `overflow-y:auto` — it scrolls.
- Screens embedded: gate (photo + no-photo), slide 2, slide 3 (stage 4 reached +
  stage 5 unreached), slide 4 (MVP, full scrolling, saved). Slide 5 is a dashed
  empty frame so the set reads as complete.

### Correction folded in
Slide 3's footer next-slide label still read `השאלה` from before slide 4 was
renamed. Fixed to `דעת הציבור` in all three stage artboards and in `slide3r5/build.py`,
and the slide-3 canvas artifact was republished.

## Slide 5 (הלאה) — v1 locked, both alternatives (13.9.2026)

Canvas: artifact 60d3ab0c (round 4). Slider playground: d6833c2a.
Spec: `docs/mobile-item.html` v1.4, section 8, with both screens embedded live.

- Sign-off `תודה על הקריאה.` in the slide-title slot; section row `עוד כשלים במעקב` + `4 מתוך 29`.
- Item card capped at **111px, must not grow**. The photograph is the card's
  **ground**, full-bleed, never a side thumbnail. Greyscale + stage-colour
  `mix-blend-mode: color` at .66, masked **30% at the top → 0 at the foot**
  (Roy picked those two numbers on the slider page). Reaching zero is what keeps
  the stage chip legible over any photo.
- Card statement in **Frank Ruhl Libre 15/500**, two lines always reserved so
  every card measures the same.
- `שיתוף כשל מס׳ 13` in gold with a **repost icon** (arrows loop). Share lives
  only on this slide. `כל 29 הכשלים` is the quiet outline above it.
- Second alternative: 1–5 outline stars under `חוות דעת למפתחי האתר?`, below
  share and above the wordmark, at the cost of one card (three instead of four).
- Footer: `דעת הציבור ›` right, **left slot empty** — last slide, nothing to name.
  The mirror of slide 2's missing previous-slide label.

Photos used (all Commons, credited, no faces or graphic content): MDA ambulances
(Ilan Ossendryver, CC BY 4.0) · Kfar Aza youth neighbourhood by the fence (Hanay,
CC BY-SA 4.0) · the Knesset (CC BY-SA 3.0) · Kol Israel studios (TaBaZzz, CC BY-SA 4.0).

Still open: what selects the four failures; whether the rating variant ships and
where its answers go; whether cards need a short form of the statement.

### Project memory
`project_memory_*` was unavailable all session, but the same project files are
reachable through the user-memory store under
`/projects/01a0989f-526a-7460-bdb3-504743e63199/`. Slides 3, 4 and 5 were written
there directly (`project_mobile_slide3/4/5.md`), slide 2's footer rule was amended,
and the reimagine file now indexes all five.

## Last-minute changes (13.9.2026) — canvas artifact e4eb48f5, spec v1.5

1. **Slide 1** — the vertical track behind the stage ladder is gone. It tied the
   five stages into one object, and they are not one object. Removed from the
   photo gate and the no-photo fallback both.
2. **Slide 2** — `סקירת הכשל` now sits in a fully-rounded chip (radius 999px, so
   the corner radius is always half the height). **Unique to slide 2** — every
   other slide wears its title bare.
3. **Slide 3** — the slide title `השלבים` was missing; added bare and
   right-aligned above the status chip on all three stage pages, everything else
   pushed down. On the current stage only, a small gold pill sits to the left of
   the status chip, bottom-aligned: `סטטוס נוכחי · 1,053 ימים`. Same gold as the
   locator's current-stage ring, so the two say the same thing in one colour.
4. **Slide 5** — the share button's arrow loop stood upright, TikTok-style: two
   interleaved L arrows, up the left column and down the right, drawn 14 × 18
   (taller than wide), rendered at 15 × 19px.

Ambiguity flagged to Roy on #3: he wrote "directly above the status chip" and then
"beneath their respective status chips". Built to the first; the second reading is
a two-line swap.

Spec doc note: the embedded screens are regenerated wholesale by
`scratchpad/embed/refresh.py`, which strips the old `.shots` blocks with a
**balanced-tag scan**. A non-greedy regex silently leaves orphaned figures behind
(the artboards contain nested divs) — that mistake cost one pass here.

## The stage split — ACCEPTED (13.9.2026). The deck is now six slides.

Canvases: proposal b05eb150 · whole deck 976cc81c · cosmetic fixes 46a934cc.
Spec: `docs/mobile-item.html` **v2.0**, section 6 (מה נעשה מאז) and the new
section 7 (מה עוד לא נעשה); everything after renumbered.

Order: השער · סקירת הכשל · מה נעשה מאז · מה עוד לא נעשה · דעת הציבור · הלאה

Slide 3 holds only the stages the item reached, opening on the current one.
Slide 4 is the same component with the opposite filter, opening at the next stage.

Roy's rulings:
- `חזרה לשלב הנוכחי` on slide 4 **walks back a slide**, chevron pointing right.
- Slide 3 losing its dashed rungs is fine — dots and footer name carry it.
- Item at the last stage: **skip slide 4 entirely**, five slides and five dots.
  No "nothing left" screen.
- Item whose current stage **regressed**: that stage stays on slide 3, with the
  gold pill. Slide 4 never holds the current stage.

Mechanics worth keeping:
- The locator keeps all five slots on BOTH slides; stages belonging to the other
  slide render as `visibility:hidden` spacers. A rung never moves between slides.
- The centre `↑↓` footer arrows appear only when that stack has more than one page
  (כשל 13's slide 4 is a single page — no arrows; כשל 20's has four).
- Slide 4 has no gold ring, no gold pill and no sources carousel.
- Every slide's dots went 5 → 6; `six/patch.py` does that with a balanced-tag scan
  of the dots container (a lazy regex stops at the first inner `</div>`).

Also fixed this round: `השלבים` → `מה נעשה מאז` (and the footer labels on the
slides that name it), tighter gap under the slide title, the gold chip lost its
day count, and the repost icon was rebuilt at 16 × 15 — the 14 × 18 version was
too tall and narrow.
