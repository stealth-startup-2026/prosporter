# Handoff: jersey personalisation (for Kevin)

Prepared by Violet (purpl), 23 Oct 2026. Branch `feat/jersey-personalisation`, PR #6.
Code is done and checked; what's left needs the Shopify store and your eyes on a preview.

## What Mladen asked for

Phone call to Violet, 22 Oct 2026. On the old WordPress site, buying a club jersey asked
a chain of questions (are you a club player, junior or senior, which division, jersey
number). He wants the same on the new site so every jersey order arrives already tagged
with who it is for, instead of staff chasing buyers and typing it in by hand.

## What's built (this branch)

- **The questions**, from the old site (recovered from Wayback snapshots) with the
  changes Mladen confirmed on 23 Oct, see [`README.md`](./README.md). Three trees:
  - **Club jerseys** (ProVolley men's and women's, Inner West men's and women's):
    club player? → junior team? → U15/U17/U19 → senior team? → Division 1/2/3 →
    number confirmed by the club? → confirmed number, or three preferences.
    Non-members, and members in neither team, give a preferred number.
  - **Premier ProVolley Jersey**: last name for the back, Premier League player?,
    team (U19 / Reserves / Premier), then the same number questions.
  - **ProVolley kids jerseys**: club player? → team (Beginner / Intermediate /
    Advance), then the same number questions.
- **Where answers go:** Shopify **line-item properties** (`attributes` on the cart line).
  They show on the order in Shopify admin under the line, on the customer's order
  confirmation, and in the bag drawer. A jersey with a different number is its own line.
- **Which products get the form:** any product in the Jerseys category (or with "jersey"
  in the title) that belongs to ProVolley or Inner West (club tag, `prosporter.club`
  metafield, or club named in the title). Teamwear jerseys (Modena, Italian) get nothing.
  To force it either way, set the product metafield **`prosporter.personalisation`**
  (single line text) to `none`, `premier`, `kids`, `provolley` or `inner-west`.
  A ProVolley jersey with "kids" in the title gets the kids tree.
- **Validation:** the first "Add to bag" click with a missing answer shows the message
  under that field and focuses it; nothing is added until every visible question is
  answered. Numbers are whole: 1-60 for team numbers (confirmed number, preferences),
  1-99 for anyone not in a team.
- **Server side:** the add-to-cart action only accepts bounded string pairs (max 24,
  key ≤ 100, value ≤ 255 chars), so nothing odd can reach the order.
- **Checks:** typecheck, lint, 169 unit tests (23 new) and `SHOPIFY_OPTIONAL=1` build
  pass. Verified in the browser in mock mode (no Shopify keys on Violet's laptop).

Files: `src/lib/personalisation.ts` (rules), `src/components/product/PersonalisationForm.tsx`
(UI), `src/components/product/ProductDetail.tsx` (wiring), `src/lib/cart-attributes.ts` and
`src/lib/shopify/cart-actions.ts` (server guard), `src/components/cart/CartDrawer.tsx` (summary).

## To finish (in order)

1. **Open PR #6's Vercel preview** (stealthstartup2026 account) and go to
   `/product/provolley-mens-volleyball-jersey-sydney`. Pick a size and colour, answer
   the questions as a junior U17 player with an unconfirmed number, add to bag.
2. **Check the bag drawer** shows a line like
   `Club player: Yes · Junior team: Yes · Junior division: U17 · Senior team: No · Number confirmed by club: No · Number preference 1: 7 · …`.
3. **Check out with a test order** (Shopify test gateway or a 100% discount code), then
   open the order in Shopify admin: the properties sit under the jersey line. That is the
   whole point, so do not skip it.
4. **Leave the unlisted clearance jerseys alone.** ProVolley Jersey, ProVolley Womens
   Jersey, Inner West Jersey and the Modena ones carry a pre-printed Number and a Condition
   (Used / Defect) on physical stock. That is not a buyer's choice, so this form does not
   replace it; whether they go on Shopify is still an open question for Mladen.
5. **Merge, then check prosporter.com.au** on a phone and a laptop.
6. **Tell Mladen** it's live and that every jersey order now carries the answers on the
   order page. Teams and number ranges were confirmed with him on 23 Oct (see
   "Changes agreed with Mladen" in [`README.md`](./README.md)).

## Optional, after launch

- **Order tags by Shopify Flow** (if Mladen wants to filter orders by team): trigger
  "Order created" → for each line item → condition on the line item property
  `Junior division` / `Senior division` → action "Add order tags" (e.g. `jersey-u17`).
  Flow is free on the store's plan; no code change needed.
- **CSV exports:** Shopify's order export does not include line-item properties. If staff
  want a spreadsheet, the Flow tags above plus the order page cover it, or an "order
  printer"-type app pulls the properties into a sheet.

## Decisions for you

- Settled with Mladen on 23 Oct: a club player in no team now picks a number (1-99);
  the old checkout questions ("Athletes SVL team in 2025", "Enter the name of your
  ProVolley team") are not needed.

## Rules

- Vercel: only the **stealthstartup2026** account (one shared seat). A preview that
  redirects to `vercel.com/sso-api` is the login wall; sign in as stealthstartup.
- Don't merge or change anything in Shopify without checking with Kevin/Violet first.

## Kick-off prompt for Claude

From the repo root:

```bash
git fetch origin && git checkout feat/jersey-personalisation && git pull
claude "Read docs/personalisation/HANDOFF.md and help me verify and ship the ProSporter jersey personalisation. Work through 'To finish' in order. Ask me before you merge the PR or change anything in Shopify."
```
