# Speed Dialer — Google Sheets setup

One-time, about 10 minutes. You need the master spreadsheet and the Apps Script web app.

## 1. Create the master spreadsheet

1. New Google Sheet, name it **Speed Dialer — Master Leads**.
2. File → Import → upload `apps-script/master-sheet-template.csv` → Import location **Replace current sheet**.
3. Rename that tab to exactly **Leads**.

Only three columns need filling when you add leads: **Name**, **Phone**, **Vertical**.
Leave everything else blank — the app and script fill them.

`Vertical` must match the app's list exactly: `Farm land`, `Primary market`, `Secondary market`, `Pre-launch`, `Mandate plotted`.

Leave `Caller` blank. The script distributes unassigned rows evenly across that vertical's members the moment someone opens the app.

## 2. Add the script

1. In the spreadsheet: Extensions → **Apps Script**.
2. Delete the placeholder code, paste all of `apps-script/Code.gs`.
3. **Set your token.** Near the top, replace `CHANGE-ME-to-a-long-random-string` with your own random string — 30+ characters, letters and digits. Keep a copy; you'll paste it into the app. Save.
4. **Deploy → New deployment** → gear icon → type **Web app**.
   - Description: `Speed Dialer API`
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Deploy → Authorize access → pick your Google account → Advanced → Go to (unsafe) → Allow.
   This warning is normal for your own script.
6. Copy the **Web app URL** — it ends in `/exec`.

## 3. Connect the app

1. Open https://mr-sanonline.github.io/Speed-Dialer/ → enter manager PIN → **Settings**.
2. Paste the `/exec` URL into **Google sheet connection**, and your token into **Access token** below it.
3. Tap **Test & set up tabs**. This creates the **Call Log** tab and adds any missing columns.
4. The note under the field should read "Connected". If it says "Unauthorised", the token doesn't match the script.
5. **Change the manager PIN** in Settings → Manager PIN. Until you do, the default `1947` works and anyone with the link can open your dashboard.

Each team member pastes the same URL + token once, on their own phone.

## 4. Check it works

1. Sign in as one team member, load leads — you should see rows from the sheet with their name in the `Caller` column.
2. Dial one, pick an outcome, fill a field, Save.
3. In the sheet: that row's `Outcome`/`Status` fills in, and a row appears in **Call Log**.
4. Manager → Team tab now reads real numbers ("Live from Call Log").

## How it behaves

- **Only logged calls count.** A dial with no outcome is written as `Attempted, not logged` so you can see the gap.
- **Offline**: saves queue on the phone and retry every 20 seconds and on reconnect. The caller sees "3 saves waiting".
- **Day rolls over at midnight IST.**
- **Duplicates**: same phone twice in the sheet gets `Duplicate = YES` and a DUPE badge in the app.
- **Dashboard** is live, cached 2 minutes. Tap the status line to force a refresh.
- **Reassigning**: the script exposes a `reassign` action (`from`, `to`, optional `count`) for moving a person's uncalled leads. You can also just edit the `Caller` column by hand.

## Changing the roster

Add or remove members in the app's Settings → Team members, in the form `Name (Vertical)`, e.g. `Rahul (Farm land)`. Distribution picks them up on the next load.

## Security

The web app must be deployed as "Anyone" (that's how a browser can reach it without Google sign-in), so the endpoint is protected by the **shared token** instead: every request carries it, and the script rejects anything without a match. Two rules follow:

- Treat the token like a password. Share it with the team directly, not in a public place.
- If it leaks, change `API_TOKEN` in the script, redeploy, and update the token in each phone's Settings.

Also change the manager PIN from the default `1947` (Settings → Manager PIN). The app URL is public, so the PIN is the only thing between a stranger and your dashboard.
