# Jersey personalisation on the old WooCommerce site (PPOM)

Source: Wayback Machine snapshots of prosporter.com.au product pages, 11 May 2026
(the old site is gone; prosporter.com.au now serves the Shopify/Next storefront).
Plugin: PPOM for WooCommerce 34.0.8. Raw field definitions, including the show/hide
rules, are in the three JSON files next to this file.

Mladen's goal (phone call to Violet, 22 Oct 2026): recreate these questions on the new
site so every jersey order is tagged with club / team / division / number automatically.

## Tree A: ProVolley and Inner West club jerseys

Same tree on four products; only the first question's wording changes.
Products: ProVolley Men's Jersey 2026/27, ProVolley Women's Jersey 2026/27,
Inner West Volley Women's Jersey 2026/27 (men's IWV page had no form in the snapshot).

| # | Question (label) | Field | Type | Options | Required | Shown when |
|---|---|---|---|---|---|---|
| 1 | Are you a ProVolley player? / Are you an Inner West Volley player? | if_provolley_player / if_inner_west_volley_player | select | Yes, No | yes | always |
| 2 | Junior team? | is_junior_team | select | No, Yes | no | Q1 = Yes |
| 3 | Select your Junior team | select_your_junior_team | select | U15, U17, U19 | no | Q2 = Yes |
| 4 | Senior team? | plays_senior | select | No, Yes | no | Q1 = Yes |
| 5 | Select your Senior team | senior_team | select | Division 1, Division 2, Division 3 | no | Q4 = Yes |
| 6 | Enter your preferred jersey number | external_number | number | | yes | Q1 = No |
| 7 | Has your jersey number been confirmed by the Club? | number_confirmed | select | No, Yes | no | Q2 = Yes OR Q4 = Yes |
| 8 | Enter your confirmed jersey number (1-60) | confirmed_number | number | | yes | Q7 = Yes |
| 9 | Jersey Number Preference #1 | pref_1 | number | | yes | Q7 = No |
| 10 | Jersey Number Preference #2 | pref_2 | number | | yes | Q7 = No |
| 11 | Jersey Number Preference #3 | pref_3 | number | | yes | Q7 = No |

Notes: a club player can be in both a junior and a senior team (Q2 and Q4 are
independent). Error text on Q8 to Q11 says the number range is 1-60.

## Tree B: Premier ProVolley Jersey 2026/27

| # | Question (label) | Field | Type | Options | Required | Shown when |
|---|---|---|---|---|---|---|
| 1 | Last Name (Back of Jersey) | last_name | text | | yes | always |
| 2 | Do you play Premier League Volley 2026/2027 for ProVolley? | is_provolley_player | select | No, Yes | yes | always |
| 3 | Do you play U19 Division? | is_u19 | select | No, Yes | no | Q2 = Yes |
| 4 | Do you play a Senior Division? | plays_senior | select | No, Yes | no | Q2 = Yes |
| 5 | Select your Senior team | senior_team | select | Reserves, Premier | no | Q4 = Yes |
| 6 | Enter your preferred jersey number | external_number | number | | yes | Q2 = No |
| 7 | Has your jersey number been confirmed by the Club? | number_confirmed | select | No, Yes | no | Q3 = Yes OR Q4 = Yes |
| 8 | Enter your confirmed jersey number | confirmed_number | number | | yes | Q7 = Yes |
| 9-11 | Jersey Number Preference #1, #2, #3 | pref_1..3 | number | | yes | Q7 = No |

## Checkout-level fields (not PPOM, Flexible Checkout Fields style)

Seen in order meta in the 5 Sep 2026 export, so they were asked at checkout, not on the product:

| Order meta key | Orders |
|---|---|
| _shipping_athletes_svl_team_in_2025_if_applicable | 357 |
| _shipping_enter_the_name_of_your_provolley_team_you_play_for | 218 |

## Usage in the old orders (Feb 2024 to Sep 2026)

126 order lines carry PPOM answers: is_junior_team 101, plays_senior 96,
confirmed_number 92, if_provolley_player 87, select_your_junior_team 82,
if_inner_west_volley_player 29, senior_team 28, pref_1/2/3 19, last_name 10,
is_provolley_player 10, is_u19 6.

## Shopify mapping

Line-item properties on the product form (Shopify supports them natively, the
conditional show/hide is storefront JS in the Next.js product page). Each answer then
appears on the order in admin and in order exports, which is the "auto-tagging" Mladen
wants. Optionally a Flow or webhook can add order tags like `provolley`, `junior-u17`,
`senior-div1`, `number-12` from those properties.
