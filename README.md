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

## Current state

Working prototype. Entries save to the device (localStorage) and the session resumes after closing the browser.

Still to build for production:
- Google Drive sign-in + Sheets read/write (the load screen is a mock; the app is designed to append its own columns to each lead row)
- Server-side team accounts and call attribution
- Real project list, budget bands and team names — manager Settings screen already edits these locally

## Source

Designed as a Design Component (`Speed Dialer.dc.html`). `index.html` is the compiled standalone build — edit the `.dc.html` and recompile, don't edit `index.html` by hand.
