# היום שאחרי

A public ledger of the failures of 7 October 2023 and of what has been done
about them since. Descriptive, sourced, and neutral on blame: every claim on
the site points at something already published, and the stage each failure has
reached is computed by a rule, never typed in.

Launch: **7 October 2026**, read-only. The plan is in
[`docs/roadmap.html`](docs/roadmap.html); the concept is in
[`docs/concept.html`](docs/concept.html).

## The port

`docs/prototype.html`, frozen at the tag `prototype-v0.4-final`, is the design
specification. It is not a place to work any more.

1. **The stylesheet is copied, not translated.** `app/globals.css` is the
   prototype's `<style>` block verbatim — same token names, same class names.
   No Tailwind, no CSS-in-JS. Design changes happen in `globals.css` now.
2. **Components are the prototype's render functions moved, not redesigned.**
   One function becomes one component and emits the same DOM.
3. **Every view is compared against the prototype, pixel for pixel.** Sixteen
   baselines — four views × two themes × two widths — captured on the CI runner
   and diffed there. Never captured on a laptop: fonts rasterise differently.
   A view is only checked once its name is in `tests/fidelity/ported.json`, so
   turning the gate on for a view is a deliberate line in a commit.
4. **Ported against real data, not the prototype's.** Layouts that survive a
   90-character title and an incident with one claim are the ones that ship.

## Data

The ledger is files in this repository. `data/schema/index.ts` is its shape and
`scripts/validate.ts` is the gate:

- a claim needs a URL, a date and a source type, or it is not a claim;
- place belongs to the claim, not to the incident;
- a stage-5 claim needs a source other than the body that implemented it;
- every incident needs a stage-1 claim;
- institutions, units and systems only — never individuals.

Records still carrying `illustrative: true` came from the prototype and are
placeholders. `npm run validate:strict` refuses them, and that is what stands
between `dev` and `staging`.

Data changes go in by pull request, even solo: the PR is the review queue, and
the commit landing on `prod` is the "published" event the corrections page
reads.

## Branches

`dev` → `staging` → `prod`, one per environment. Promotion is always the whole
branch, never a cherry-pick, so the three never diverge and every promotion is
a fast-forward. A hotfix branches off `prod` and is merged back down.

## Commands

```
npm run dev               work on it
npm run build             static export to out/
npm run validate          shape and rules (dev)
npm run validate:strict   + publishable (staging, prod)
npm run check:links       every source URL still answers
npm run fidelity:app      compare the built app against the baselines
```

`npm run export:prototype` and `npm run sync:css` are one-off scripts from the
port and should not need running again.
