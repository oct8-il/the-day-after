# W1 handoff · putting the repo on GitHub

Run these on your Mac, in `~/WebstormProjects/the-next-day`. Everything before
this point is already committed locally on `dev`, `staging` and `prod`, all
three pointing at the same commit.

## 1. The organisation and the repository

Create the org at <https://github.com/organizations/plan> — pick the **Free**
plan, "My personal account" as the owner. Suggested name: `hayom-shaacharei`
(the org name is public and permanent-ish; the repo can be renamed freely).

Then create an **empty private** repository `the-next-day` inside it — no
README, no .gitignore, no licence, or the first push will conflict.

## 2. Push all three branches and the tag

```bash
cd ~/WebstormProjects/the-next-day
git remote add origin git@github.com:hayom-shaacharei/the-next-day.git
git push -u origin dev staging prod
git push origin prototype-v0.4-final
```

If you have not set up an SSH key for GitHub on this machine, use HTTPS instead
and let the browser handle the login:

```bash
git remote add origin https://github.com/hayom-shaacharei/the-next-day.git
```

## 3. Settings, once

- **Settings → General → Default branch**: set to `dev`.
- **Settings → Rules → Rulesets**, one ruleset targeting `staging` and `prod`:
  require a pull request or a fast-forward merge, block force pushes, and
  require the `validate`, `build` and `fidelity vs. prototype` checks. This is
  what stops the three branches from silently drifting apart.
- **Actions → General**: allow GitHub Actions to write to the repository
  (needed by the baselines job and the release job).

## 4. Capture the fidelity baselines

Once the code is on GitHub: **Actions → ci → Run workflow**, tick
*capture baselines*, run it on `dev`. It renders the frozen prototype on the
Linux runner, writes the sixteen PNGs into `tests/fidelity/baseline/` and
commits them. Then `git pull` locally.

They are captured there rather than here on purpose: a baseline made on macOS
fails on every other machine forever, because fonts rasterise differently.

## 5. Vercel

<https://vercel.com/new> → import the repo (grant access to the org).

- **Settings -> Environments -> Production**: set the tracked branch to `prod`.
  Vercel defaults it to the repository's default branch, which is `dev`, so
  without this the apex domain serves dev.
- **Environment variables: none.** The build reads the branch name from
  `VERCEL_GIT_COMMIT_REF` and decides for itself, so there is nothing to set in
  Production, Preview or Development, and nothing that can drift out of sync
  with the branch model. `prod` is the only environment without a ribbon and
  the only one search engines are allowed to index.
- **Domains**: apex on `prod`, `staging.` and `dev.` on their branches — once
  the domain exists.

Framework preset and build command need no changes; the project is a plain
Next.js static export.

## 6. Promotions, from here on

```bash
git push origin dev                    # code lands
git checkout staging && git merge --ff-only dev && git push   # promote
git checkout prod    && git merge --ff-only staging && git push
git checkout dev
```

Always the whole branch. If `--ff-only` refuses, something was committed
directly to `staging` or `prod` — fix that rather than forcing.
