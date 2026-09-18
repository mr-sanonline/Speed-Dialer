# Speed Dialer

One-click dialing web app for real-estate tele-calling teams. Runs in any mobile browser (iPhone + Android) — no install.

## Deploy

`index.html` is fully self-contained. Any static host works:

- **GitHub Pages** — Settings → Pages → Branch `main`, folder `/root`. App is served at `https://mr-sanonline.github.io/Speed-Dialer/`.
- **Netlify / Vercel** — drag the folder in, or connect this repo.

Must be served over **https** for `tel:` and WhatsApp links to work reliably.

## On the phone

Open the URL, then:
- iPhone (Safari): Share → Add to Home Screen
- Android (Chrome): ⋮ → Add to Home screen

## Screens

Name pick + manager PIN (default `1947`) · sheet load · dense lead list with search, filters and progress · inline lead form · post-call outcome sheet · caller day summary · manager dashboard · manager settings.

## Lead fields

Pre-filled from the sheet: Name, Phone Number.
Filled by the caller: preferred location, property type (Apartment / Villa–independent house / Plot / Farm plot), configuration (free text), budget band, suggested project, timeline, follow-up date, language, bullet notes, call outcome.

## Google Sheets backend

`apps-script/Code.gs` is a Google Apps Script web app bound to the master spreadsheet. It reads each caller's leads, auto-distributes unassigned rows evenly within a vertical, writes saves back to the lead's row, appends to a Call Log tab, and serves live manager metrics (2-minute cache).

Setup steps: **[SETUP.md](SETUP.md)**. Paste the deployed `/exec` URL into the app's manager Settings → Google sheet connection. Without it the app runs on sample data.

Behaviour: only calls with a logged outcome count towards the 200/day target; a dial with no outcome is written as `Attempted, not logged`; saves queue on the phone when offline and retry automatically; the day rolls over at midnight IST.

`apps-script/master-sheet-template.csv` is the Leads tab column template — fill only Name, Phone and Vertical.

## Team handout

`Team Guide.dc.html` — one-page printable guide for callers.

## Current state

Still open before wide rollout:
- Set `API_TOKEN` in `Code.gs` and paste the same token into the app's Settings
- Change the manager PIN from the default `1947` (Settings → Manager PIN)
- Replace the placeholder budget bands with your real ones (manager Settings)

## Source

Designed as a Design Component (`Speed Dialer.dc.html`). `index.html` is the compiled standalone build — edit the `.dc.html` and recompile, don't edit `index.html` by hand.
