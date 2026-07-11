# The Action Site — "What is the government doing?"

A fully static write-your-MP site generated from this project's own pipeline files.
**No backend. No database. No analytics. No cookies. Nothing about a visitor is ever recorded.**

## What it is

- **`index.html` — Take Action.** One dropdown of **active bills only** (still amendable /
  stoppable), grouped and ordered ALARM → CONCERN → EXPLAIN (the pipeline's own registers:
  `track: HIGH` = alarm; the `/watch_stakes` CONCERN/EXPLAIN registers map straight across).
- **The Enacted File — a hidden third tab.** Bills that received royal assent are NOT in the
  default view. The tab reveals itself only when an enacted bill is opened — via a Record-page
  "Take action" link, a `?bill=` deep link to a law bill, or `?file=enacted` (linked from every
  footer). Enacted options are labelled "law since {date}" (from `law_date`) and their letters
  shift to accountability (regulations, amending bill, use of the powers).
- **The simplified layout IS the site** (chosen 2026-07-10): first open shows only the masthead,
  the bill dropdown, a one-line register legend, and the privacy box; the bill card, recipient,
  and letter steps reveal after a bill is chosen (`body.simple` drives this in app.js/style.css).
  The pre-simplification full layout is archived, unlinked, at `index-classic.html`.
  Selecting a bill builds a cited letter in the register's voice:
  - **ALARM** — direct: provisions named unacceptable, amendment/removal demanded,
    accountability required.
  - **CONCERN** — firm but not entitled: real tensions put as questions Parliament must
    answer on the record.
  - **EXPLAIN** — explanation-focused: consequential substance left to regulation must be
    explained before (or as) the rules are set.
  - **All registers:** anything the bill defers to Cabinet regulation gets a mandatory
    "explained and addressed" demand paragraph. Stage-aware asks follow
    `Graphics/stage-action-cta.md` (House → MP; Senate → a senator from your province;
    law → Gazette regulations + amending bill + accountability).
- **`graphics.html` — The Record.** Every published carousel, grouped by register, plus
  roundups, primers, and the glossary. Swipeable strips + a lightbox.

**Direct landing page per bill = the general page pre-selected:** `index.html?bill=C-22`
(the dropdown updates the URL as you browse, so every state is a shareable link).
Graphics deep-link: `graphics.html#C-22`.

## Privacy design (the "record nothing" guarantee)

- Letters are assembled **in the visitor's browser** and opened via `mailto:` in **their own
  mail app** — the site never sees the letter, the sender, or whether it was sent.
- The **only** network call to anything external is the optional MP postal-code lookup, sent
  directly from the visitor's browser to `represent.opennorth.ca` (Open North's civic open-data
  API) on an explicit button click. It is disclosed on the page, and there's a no-lookup path
  (ourcommons.ca link + copy buttons).
- **Senator matching is fully local:** province is derived from the postal code's first letter
  in the browser, and matched against the embedded senators list (`senators.json`, scraped from
  sencanada.ca at build time). Default pick is **random within the province** — deliberately
  non-editorial and non-partisan, and it spreads letters across senators; the dropdown lets the
  visitor switch. Refresh the dataset occasionally: `python Site/fetch_senators.py`.
- Fonts are self-hosted (no Google Fonts ping). `data.js` is embedded (no fetches), so the
  site even works opened as a local file.

## How it rides the pipeline (wired 2026-07-11)

The site shares the pipeline's human gate — one approval releases the social post AND the
bill's page. Two update classes, two paths:

- **Editorial (new bill pages) — gated.** `/bills_pipeline` Step 6.5 drafts
  `Bills/<n>/action.json` with `"draft": true` (drafts are **excluded** from builds); the
  approval email shows the letter content beside the graphic + caption (and flags
  oppose-stance candidates). `/post_approved` Step 1.5 flips the flag for the approved
  bills, rebuilds, and **deploys the site before publishing to Buffer** so caption links
  resolve on arrival.
- **Mechanical (stage moves, royal assent, deaths) — automatic.** `Site/sync_status.py`
  runs in the daily pipeline (Step 0.5): refreshes every live action.json's
  `status`/`status_label`/`law_date` from LEGISinfo (zero new words — all rendered text is
  pre-approved template language), refreshes `senators.json` when >14 days old, rebuilds,
  and auto-deploys via `Site/deploy.py`. Staleness is the harm this prevents.

Captions and (going forward) the graphics' closing CTA point people here — per-bill URL
`{base_url}/?bill=C-XX` in captions, "link in bio" on slides. The live URL lives in
`Pipeline/site-config.json` (`base_url`); while it's empty, captions/graphics omit the link.

## How to update it

1. Run the pipeline as usual. When a new bill is rendered, write its
   **`Bills/<n>/action.json`** (letter content — see any existing one for the format:
   register, status, lead, points w/ cites, unclear w/ cites, credit).
2. When a bill **changes stage**, update `status` + `status_label` in its action.json.
   When it becomes law, also set `law_date` ("June 15, 2026" format) — it feeds the
   "law since" labels and the royal-assent line in letters.
3. Rebuild: `python Site/build_site.py` — recompiles `assets/data.js` and re-copies all
   graphics (bills + roundups + primers + glossary) and fonts.
4. Preview locally: `python -m http.server 8642 --directory Site` → http://localhost:8642

`action.json` field notes: `status` ∈ `house-2nd | house-committee | senate | law`
(add more stage keys in `assets/app.js` STAGE_ASK as needed); `register` ∈
`alarm | concern | explain`; `credit` may be `null`; `unclear` may be `[]`.

**Letter structure (upgraded 2026-07-10, modelled on the revised C-22 sample):**
- Each `points[]` entry is `{text, cite, consequence?}` and renders as its own paragraph:
  plain claim → (cite) → consequence line. 3–4 points per bill — selection is persuasion.
- `credit` is written as a **pivot**: state the verified limits as facts, then turn back to
  the provisions ("The provisions above survived it anyway." / "Publication is not scrutiny.").
  Never a free-floating reassurance.
- The undefined-rules demand is one tight paragraph (items joined inline, lowercase, no
  nested em-dashes) ending in "A power whose limits are set later is not a limited power."
  Skip the `unclear` entry when the deferral is already a main point carrying the demand.
- The lead and the register intro merge into ONE opening paragraph ("…the order exists.
  What is wrong with it is structural, not incidental:") — keep action.json `lead` to one
  sentence that doesn't repeat the points; the intro line does the framing.
- Every letter closes warm — "I would be grateful for a written reply…" — for MPs and
  senators alike. The force lives in the asks, never the sign-off.

**`stance: "oppose"` — the escalated register (alarm bills only, use sparingly).** For a bill
whose defect is its *architecture*, not a fixable clause. Changes the subject line ("this bill
should not pass as written" / "this act needs repeal or amendment"), the intro ("…they are its
architecture:"), and the ask: vote against unless removed (House), withhold support (Senate),
press for repeal + Gazette scrutiny + per-use public reporting (law). Urgency comes from the
directness of the ask, never louder adjectives — and facts-only credits still appear (real
limits are stated; they never soften the ask). Currently: C-8 only. Rarity preserves signal.

## How to launch it (when ready)

The whole `Site/` folder (~40 MB) is the deployable artifact. Any static host works:

- **Netlify Drop** (fastest): drag the `Site/` folder onto https://app.netlify.com/drop
  with a free account — live URL in under a minute; re-drag to update.
- **GitHub Pages** (best for updates): put `Site/` contents in a public repo, enable
  Pages (Settings → Pages → Deploy from a branch). Custom domain supported.
- **Cloudflare Pages**: same drag-and-drop model, generous free tier.

No server code, no environment variables, no build step on the host. Turn OFF any
host-provided analytics to keep the "records nothing" promise literal. The only thing
money can buy here is a custom domain (~$15/yr, optional) — the .netlify.app /
.github.io subdomains are free.

**It is also an installable app (PWA).** `manifest.webmanifest` + `sw.js` + generated
icons (`assets/icons/`, rebuilt by build_site.py from the maple stamp) make the hosted
site installable: Android/desktop Chrome shows an "Install app" prompt; iOS Safari uses
Share → Add to Home Screen. The service worker is network-first (data never goes stale
online; offline falls back to what the device has seen) and caches only on the visitor's
device — the privacy promise is untouched. Requires HTTPS, which all three hosts above
provide by default. For app *stores* (optional, not recommended for this project):
package the hosted PWA with PWABuilder (free tool) — Google Play charges a US$25
one-time developer fee, Apple US$99/year.
