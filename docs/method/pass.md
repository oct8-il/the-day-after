# The pass — how a published incident is rebuilt and judged

*docs/method/pass.md · v1 · 11 September 2026 · the QA criteria for [DIA-306](https://linear.app/dialog-dimensions/issue/DIA-306) (one full pass per published incident), written before the first incident is touched so every pass is judged the same way.*

This document is the researcher's contract. A pass that does not fill every line of §1 is not a pass. The rules in §2–§4 are the rules the site publishes to readers, in Hebrew, on the about page (DIA-340 ports them); this file is the working text they are ported from, and where the two disagree, this file is wrong until fixed — the reader-facing page is the promise.

Everything below was ruled by the editor on 11 September 2026 unless marked **(proposed)**, which means the researcher applied a ruling to a case the editor has not seen yet and the editor should confirm or overturn it on the first pass that meets it.

---

## 0. What a pass is

A pass takes one published incident and rebuilds it from nothing: every stage searched, every quote re-read off its page, every counter-claim looked for, the stage recomputed, the summary rewritten. The output is the incident file with a filled `pass` block (§1.7), landed by pull request to `dev` like any data change.

The pass does not trust anything the incident file currently says. The existing claims are leads, not evidence, until each one has been re-fetched (§4). An existing stage is a number to compare against, not a floor: a pass may move an incident down as well as up, and "stage 1, searched, nothing found" is a complete, publishable result — the site's whole promise at stage 1 is *we looked*.

An incident that has not been passed by 1 October 2026 leaves `published.json` (DIA-306). `npm run check:passes` lists what is still unpassed; on 1 October the `REQUIRE_PASS` constant in `scripts/validate.ts` is flipped and `validate:strict` enforces it.

---

## 1. Per-item checklist — the definition of done

Fill it in order. Each numbered line becomes a field in the `pass` block (§1.7); the validator checks the fields it can, the editor checks the rest at PR review.

### 1.1 The responsible body

Name the body or bodies whose failure this is — the ones whose own words count as acknowledgement (stage 2) and whose own report counts as implementation (stage 4). Institutions only: "פיקוד העורף", "אוגדת עזה", "משרד הבריאות", "מד״א", never a person or an office-holder.

Write it down first, because §3.2 and §3.4 are defined against it. Where the failure spans bodies (i05: no joint command post — IDF and police), list all of them; acknowledgement by any one of its own part is stage 2 for the incident, and the summary says which part. Where no institution is responsible (i19: broadcasters airing unverified reports), name the class of body ("ערוצי השידור") and expect stage 2 to be rare — that is a finding, not a gap in the method.

### 1.2 Stage 1 — the failure itself

- **At least two independent sources where they exist.** Independent means a different *originating body*, not a different outlet: ynet and Maariv reporting the same IDF probe are one source. A probe and a Comptroller report are two. A probe and a resident's published testimony are two. Where only one origin exists after a real search, say so in the log — it is allowed, and it is information.
- **Cite the primary when it is online.** If the IDF probe, the Comptroller chapter or the Knesset protocol is on the web, the claim points at it, typed by its own body (official / oversight), and the outlet's article becomes a second link only if it adds something (a quote the primary does not carry, a place). If the primary is not online — most IDF probes are not — the outlet's coverage carries the claim (§3.1).
- **Quote read off the page**, ≤ 40 words, trimmed of names (§2.4). Not from a research agent's output, not from memory, not from a search snippet (§4).
- **Date as the page shows it** — day, month or year; never invented precision. Ambiguous numeric dates (`8/1/2026`) are recorded at the precision that is certain (`01.2026`) unless the page's language resolves it **(proposed)**.
- **Place on the claim** when the source is about a place (a resident of Sderot, the Nahal Oz post, Route 232); none when it is a document about the country. Place is on the evidence, never on the incident.

### 1.3 Stages 2–6 — one search each

For each of stages 2, 3, 4, 5, 6, in that order, the log records:

| field | what goes in it |
|---|---|
| `searched` | Y — a pass with a stage skipped is not a pass. |
| `where` | The bodies, outlets and query terms actually used. Not a category ("press") — the names ("mevaker.gov.il דוח 2026 מלאי דם", "ynet", "ערוץ 14", "אבו עלי אקספרס"). |
| `date` | The day the search was run, `DD.MM.YYYY`. |
| `outcome` | `found` · `not_found` · `unreachable` (a source that plausibly holds the answer could not be fetched from here — N12/mako and Haaretz block the cloud shell; hand these to the editor's browser and record the URL). |
| `claims` | If found: the ids of the claims authored for this stage. Each one satisfies §3 for that stage. |
| `note` | Optional, short: why a plausible source was rejected, what was found that did not qualify ("a team was formed to examine — intention, stays at 2"). |

The fixed core every stage search covers (the editor's ruling: fixed core plus logged per-item additions):

1. The responsible body's own site (idf.il probes and Spokesperson; oref.org.il; police.gov.il; mdais.org; health.gov.il; mod.gov.il; gov.il for the ministry).
2. State Comptroller — mevaker.gov.il reports and newsroom, the digital library for chapters.
3. Knesset — committee protocols and MMM research papers on fs.knesset.gov.il / main.knesset.gov.il: Foreign Affairs & Defence and its subcommittees, State Control, Interior, Health, Welfare as the item requires.
4. Government resolutions (gov.il החלטות ממשלה) and the Knesset legislation database for bills.
5. News search in Hebrew with the query terms logged, and — across the whole pass, not per stage — at least one outlet from each of the three groups in §2.3.
6. Per-item additions: the bodies specific to this failure (the civil commission of inquiry, family organisations, the relevant kibbutz or council, INSS/IDI/Misgav, court rulings on nevo/the judiciary site), logged by name.

### 1.4 Counter-evidence

A separate search, after the stages, for sources that dispute any claim now on the incident — especially the highest one. Where found, the disputing source is authored as a claim with `asserts_stage: 0` and `contests: <claim id>`. It attaches to a *claim*, not to the incident; the stage does not move (§3.6). Log it like a stage search (`where`, `date`, `outcome`, `claims`).

Where to look: the responsible body's response to an oversight report (the Comptroller publishes it alongside); family and survivor organisations; kibbutz and council statements; follow-up press a year on; Knesset committee sessions where the body was questioned.

### 1.5 The stage, before and after

Record the computed stage as it was before the pass (`stage_before`). The stage after the pass is computed by `lib/stage.ts` from the claims and is never written down; `check:passes` prints both and whether the item moved. A move down is not a failure of the pass — it is the pass working.

### 1.6 Editor summary for the current stage

Required for every passed incident whose computed stage is 2 or above: a `summaries` entry for that stage, every sentence footnoted to claim ids (`cites`), in the register of the ledger — what the sources say, not what they imply. Content by stage: 2 — the acknowledgement, in the body's words, and what it covers; 3 — what the plan decides (body, instrument, budget, scope, date); 4 — what is reported in place, with scope and what is *not* covered; 5 — what the verifier checked and found; 6 — what eroded, and what remains. Stage 1 has no stage summary: the incident's `summary` field is the description, and the stage-1 chapter is the evidence itself.

Drafted by the researcher, approved by the editor at PR review. A summary that names a person, or asserts more than its citations, is sent back.

### 1.7 The `pass` block

The checklist, as data, in the incident file. Optional in the schema until 1 October; validated whenever present.

```json
"pass": {
  "date": "18.09.2026",
  "responsible": ["פיקוד העורף"],
  "stage_before": 4,
  "stage1_origins": ["תחקיר צה\"ל על שדרות", "נציב תלונות הציבור", "כתבת כל רגע"],
  "searches": [
    { "stage": 2, "where": ["idf.il תחקיר שדרות", "ynet", "מעריב", "ערוץ 14"], "date": "18.09.2026", "outcome": "found", "claims": ["i13-c04", "i13-c05"] },
    { "stage": 3, "where": ["oref.org.il", "gov.il החלטות ממשלה התרעה", "כל רגע"], "date": "18.09.2026", "outcome": "found", "claims": ["i13-c07"] },
    { "stage": 4, "where": ["oref.org.il היסטוריית התרעות", "כלכליסט", "ynet"], "date": "18.09.2026", "outcome": "found", "claims": ["i13-c08", "i13-c09"], "note": "alert history = observed in the implementer's record, §3.4" },
    { "stage": 5, "where": ["mevaker.gov.il פיקוד העורף התרעה", "fs.knesset.gov.il ועדת החוץ והביטחון התרעה חדירה", "שומרים", "העין השביעית"], "date": "18.09.2026", "outcome": "not_found" },
    { "stage": 6, "where": ["news search התרעת חדירה תקלה 2025 2026", "אבו עלי אקספרס"], "date": "18.09.2026", "outcome": "not_found" }
  ],
  "counter": { "where": ["מועצה אזורית שער הנגב", "פורום המשפחות", "ynet 2026 התרעה לא הופעלה"], "date": "18.09.2026", "outcome": "not_found" },
  "unreachable": ["https://www.mako.co.il/..."],
  "issue": "https://linear.app/dialog-dimensions/issue/DIA-319"
}
```

*This is the shape, shown on i13's existing claim ids. It is not a completed pass of i13; the `where` and `date` values are illustrative.*

What the validator checks when a `pass` block is present: every stage 2–6 has exactly one search entry; a `found` entry lists at least one claim id that exists on the incident and asserts that stage; a `not_found` entry coexists with no claim at that stage; a stage-6 claim exists only alongside a stage-4 or stage-5 claim (§3.5); `responsible` is non-empty and passes the naming check; when the computed stage is ≥ 2, a `summaries` entry for it exists. What only the editor checks: that `where` is honest, that §2.3's three groups appear, and that the summary says no more than its citations.

---

## 2. Admissible sources

### 2.1 By type — what each may assert

| type | who | may assert | may not |
|---|---|---|---|
| **official** | IDF probes and Spokesperson, government resolutions, ministries, police, MDA, Home Front Command, local authorities | 1, 2, 3, 4, 6 | 5 for its own reforms — the implementer never verifies itself |
| **oversight** | State Comptroller and Ombudsman, Knesset committees and MMM, courts, a state commission of inquiry | all stages, including 5 | — |
| **press** | named outlets and named channels (§2.3) | 1–4 and 6 from a single outlet; 5 only for investigative work with a documentary basis, preferably corroborated by a second outlet | 5 from a single report of "sources say" |
| **research** | INSS, IDI, Misgav, university work, the intelligence-methodology institute, the civil commission of inquiry's research output | 1 and 5 primarily; 2–4 when quoting the body | — |
| **civil** | bereaved, hostage and survivor organisations, kibbutz and council committees, NGOs (ACRI, the family forums, מועצת אוקטובר) | 1, 6, and contests | 3–4 on their own word — see the i22 case in §3.4 **(proposed)** |

The type is the type of the *body whose words the claim carries*. Coverage of an IDF probe on ynet is `press`; the probe on idf.il is `official`. Both are admissible; §1.2 says which to prefer.

### 2.2 Standing exclusions

No individuals named — not commanders, officials, ministers, even when the source names them; quotes are trimmed around the name. No victims' or survivors' names. Nothing that has not already been published by a source that bears responsibility for publishing it. A claim with no URL, no date or no source type is not entered — the validator refuses it.

Published testimony is admissible as a linked claim with its place; it is never retold as narrative.

### 2.3 Outlets and channels — diversification

Three groups. A pass must have searched at least one outlet from each, and the log must show it by name:

- **Traditional outlets** — ynet, N12/mako, Kan, Haaretz, Maariv, Walla, Calcalist, Globes, Israel Hayom, Times of Israel, Channel 13.
- **Outlets outside the mainstream consensus** — Channel 14, Makor Rishon, Arutz 7 (inn.co.il), Zman Israel, Shomrim, The Seventh Eye, Local Call.
- **Independent journalists and channels** — Telegram/X channels such as Abu Ali Express and Daniel Amram's channel.

The grouping is about where a claim is likely to surface, not about trust: every outlet and channel is `press` and carries the same stage rules. No outlet is excluded by name; a claim is judged by what it asserts and what it rests on.

Independent channels are named by the channel, not the person: `"source": "ערוץ הטלגרם אבו עלי אקספרס"` or `"דניאל עמרם — ערוץ טלגרם"`. The naming rule (§2.2) is about the actors in the events; the author of a published channel is a publisher, like an outlet's masthead. Their posts carry a claim when they say something in their own name with a basis (a document, a photo, a named unit's statement); when a post only relays a document or an outlet, cite the document or outlet and log the channel as where it was found.

### 2.4 Trimming

Quotes ≤ 40 words. A name inside a quote is removed with an ellipsis or the sentence is cut before it; the quote must still say what the claim says it says. If trimming the name makes the quote meaningless, choose another sentence from the same page.

---

## 3. Evidence classification — what reaching a stage requires

The stage is the highest stage with a claim; a stage-6 claim overrides. The rules below decide what a claim may assert. They are written to be boring: anyone from any camp should read them and fail to find a lever.

### 3.1 Stage 1 — identified

A credible source (any type) documented the failure as this incident words it. The claim proves the sentence in `he`; it does not imply it. Conditions documented years later (the Comptroller's 2026 finding on blood stocks, i26) are worded as the later finding, not as a claim about the day.

Two independent origins where they exist (§1.2). Of the 29, i04, i24, i25, i29, i30 and i31 currently rest on one origin each (a single IDF probe through one or two outlets); the pass on each searches for a second origin and logs the result either way.

Oversight identifying a failure is stage 1, whatever its date. The Comptroller finding in 2026 that evacuation ran without command (i06-c02) identifies; it does not verify anything.

### 3.2 Stage 2 — acknowledged

The responsible body (§1.1), in its own words, about *this* failure. Not a general statement ("mistakes were made on 7 October"), not another body speaking about it (the Comptroller, a Knesset chair, the government about the IDF), not a resignation, not a probe's existence.

Press coverage is admissible when the quote is the body's finding reported as such — "the probe found that no infiltration alert was issued" (i13-c04) — and the primary is not online. When the primary is online, cite it. An outlet's own characterisation ("the IDF admitted a systemic failure") is not the body's words; find the sentence the outlet is paraphrasing.

A ministry's own inquiry committee acknowledging on the ministry's behalf (i06-c01, the Health Ministry's committee) is stage 2 for that ministry. The IDF History Department writing that readiness squads went to battle with council-bought radios (i07-c04) is stage 2: the body, in its own words, about this failure — the register does not matter.

### 3.3 Stage 3 — plan announced

A decision by a body with authority to make it: a government resolution; an approved budget line; a signed order, procedure or doctrine; a unit stood up or a post created; a bill that has passed a Knesset reading; a tender issued. The claim should carry the instrument, and the summary the scope.

Not a plan: "we will", "we intend", "the IDF has decided to examine", "a team was formed to look into", a recommendation in a probe (a probe recommends; the body decides), a bill merely tabled, a minister's speech. These stay at 2. A probe's recommendations list (i09-c05, i10-c05) is stage 3 only where the source says the recommendation was adopted as a decision; otherwise it is part of the acknowledgement and the search for the decision continues.

Cases from the 29 for the pass to settle **(proposed)**: i05-c03 and i14-c04 rest on a police officer's interview describing a new dispatch arrangement — if the arrangement is described as in force, it is the implementer reporting (stage 4, §3.4); if as intended, it is stage 2; the interview alone is not a decision. i16-c06, the government resolution on an "independent" commission, is a decision by a body with authority and stays at 3; whether it addresses the failure as worded ("no national inquiry body with authority and an end date") is the public's question, and the contest on i16-c07 is the mechanism for the dispute.

### 3.4 Stage 4 — implemented

The implementing body reports the change in place, with scope and a date. "In place" means operating, not funded or approved. Two kinds, both stage 4, distinguished in the summary:

- **Reported** — the body says so (Spokesperson, ministry release, an officer on the record in an outlet, a response to the Comptroller).
- **Observed in the record** — the fix is visible in the implementer's own operational record: infiltration alerts appearing in the Home Front Command alert history for the envelope; a barrier in published IDF-confirmed photographs (i02-c07). This is the stronger kind and the summary says so, but it is still the implementer's own record. Tzofar and similar apps mirror that record; they verify nothing.

Partial implementation — some places, some languages, a pilot — is stage 4. The summary states the scope and what is not covered, footnoted; the stage-4 question ("how far does what was implemented address the problem") is where partiality is judged.

The fix must answer the failure as worded in `he`. A measure that addresses a neighbouring problem is not a claim on this incident, however real. i02-c07 (the barrier inside Gaza, on an incident about remote-controlled weapons on the fence being neutralised) is the case to rule on in i02's pass **(proposed: it is a claim only if the source ties it to the fence's remote-weapons layer; otherwise it belongs on p2 as context, not on i02)**.

A civil-society body reporting that the fix happened (i22-c02, ACRI's update that alert languages were added) is admissible as stage 4 only when it quotes the implementer; the pass replaces it with the Home Front Command's own announcement where one exists and keeps the ACRI page as stage 1 / the trigger **(proposed)**.

### 3.5 Stage 5 — independently verified

A body that is not the implementer, with a basis it states, confirms the fix is in place: a Comptroller follow-up chapter, a Knesset committee's oversight session with findings, a court's factual finding, an investigative report citing documents (preferably corroborated), a research institute's field assessment. "Basis" means the verifier says what it checked — not "sources say it works".

Not stage 5: the implementer's own record, however public (§3.4); a mirror of that record; a press report repeating the body's claim; a civil-society statement that things improved without a stated basis (that is a stage-1-type observation, or nothing). No stage-5 claim exists on any of the 29 as of this document; that is the honest state, and the pass may leave it so.

### 3.6 Stage 6 — regressed

A later source reports that a fix that *was in place* (stage 4 or 5) eroded, was reversed, defunded or discontinued. Regression requires something to regress from: a stage-6 claim is valid only on an incident that also carries a stage-4 or stage-5 claim, and the regression must be of that fix.

Not regression: a plan cancelled, defunded or stalled before implementation — the item stays at 3 and the cancellation is authored as a contest on the plan claim (`asserts_stage: 0`, `contests: <plan claim>`); an oversight body finding the fix was never actually in place — that is a contest on the stage-4 claim (i06-c07 on i06-c06 is the pattern); a new failure of the same kind that the fix never covered — that is scope, stated in the stage-4 summary.

The case from the 29: i07 carries two stage-6 claims. i07-c09 (October 2025, budget cut) predates the stage-4 claims (January and May 2026) and so cannot be a regression of them — the pass re-classifies it, most likely as a contest on the plan or as context dropped from the ledger. i07-c10 (July 2026, reserve call-up orders cancelled) is after the implementation and is a regression only if the orders were part of the fix reported in place; the pass decides on the sources **(proposed)**.

Restoration after regression: `lib/stage.ts` pins the item at 6 while a stage-6 claim exists. If a later source reports the fix restored, the pass authors the restoring claim at 4 and moves the stage-6 claim out of the ledger with a corrections-log entry, so the history shows the dip **(proposed — the concept says "a later implementation claim moves it back up", and the code does not yet do that by date)**.

### 3.7 Contests

A contest attaches to one specific claim and disputes what that claim asserts. It carries a URL, date, type and quote like any claim. It never moves the stage; the item shows the badge. A contest on a stage-1 claim disputes that the failure happened as worded — those are rare and are the editor's call before publishing.

---

## 4. Re-verification rule

**Never author from a research agent's quote without re-fetching the page.** Two of five spot-checked sweep quotes were wrong; two more were wrong in the v1 batch (Sderot's rifles were returned by the outgoing rabashatz in August 2022, not "transferred without authorisation"; the MDA/United Hatzalah court order is January 2024, not 2023). Agents paraphrase, merge sentences and shift dates. The agent finds the page; the researcher reads it.

Concretely: every claim authored in a pass — new or inherited — has had its URL fetched *in that pass*, the quote located verbatim on the page, the date read off the page, and the source's own name read off the masthead. A page that cannot be fetched from the research environment is logged `unreachable` with the URL and handed to the editor's browser; no claim is authored from it until someone has read it. A page that has changed or vanished since the claim was first authored: keep the claim only if an archive copy shows the quote (`archive_url`), otherwise drop it and log why.

The inherited claims are not exempt. A pass that keeps an existing claim has re-read it; a pass that cannot re-read it removes it.

---

## Appendix — where this lives and what enforces it

- This file: `docs/method/pass.md`. Reader-facing Hebrew: the about page's method section (DIA-340 audits it against this file).
- Schema: `Pass` in `data/schema/index.ts`, optional on `Incident`.
- Validator: `scripts/validate.ts` checks a present `pass` block (§1.7); `REQUIRE_PASS` gates published incidents in strict mode from 1 October 2026.
- Report: `npm run check:passes` — every published incident, passed or not, stage before → after.
- Board: DIA-308…336, one sub-issue per incident; the pass's PR links the issue; the `pass.issue` field links back.
