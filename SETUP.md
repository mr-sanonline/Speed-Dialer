# Speed Dialer — Google Sheets setup

One-time, about 10 minutes. You need the master spreadsheet and the Apps Script web app.

## 1. Create the master spreadsheet

Go to [sheets.new](https://sheets.new) and name it **Speed Dialer — Master Leads**. That's it — leave it empty.

The script creates the **Leads** tab, the **Call Log** tab and all the columns for you in step 3. You don't need to import anything.

<details>
<summary>If you'd rather set the columns up by hand</summary>

Import the template straight from GitHub: File → Import → **Upload** won't take a URL, so instead paste this into cell A1 of a blank sheet:

```
=IMPORTDATA("https://raw.githubusercontent.com/mr-sanonline/Speed-Dialer/main/apps-script/master-sheet-template.csv")
```

Then select all → Copy → Edit → **Paste special → Values only** to turn the live formula into plain text (important — the app can't write into formula output). Rename the tab to exactly **Leads**.
</details>

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
3. Tap **Test & set up tabs**. This creates the **Leads** and **Call Log** tabs with every column in the right order.
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

## 5. Per-vertical input sheets (optional but recommended)

Each team can have its own simple sheet with just **Name** and **Phone** — no call fields, nothing to break. The master pulls from them and keeps every call detail in one place.

1. Create one spreadsheet per vertical, e.g. *Leads — Farm land*. First row: `Name`, `Phone`. Add rows below.
2. **Share each one with your own Google account** (the account that owns the script) — at least Viewer.
3. In the master, open the **Sources** tab. It already lists the five verticals. Paste each spreadsheet's URL into **Source spreadsheet URL**, and its tab name into **Tab name** (`Sheet1` unless you renamed it).
4. In the app: manager Settings → **Pull new leads now**.

Every new phone number is appended to the master's `Leads` tab with its vertical set, then distributed to that team's callers. Numbers already in the master are skipped, so you can re-run it any time and nothing is duplicated or overwritten.

The `Rows imported` and `Last imported` columns on the Sources tab tell you what happened. If one says "cannot open", share that spreadsheet with the script's account.

**To make it automatic:** in Apps Script, pick `installHourlyImport` from the function dropdown and press Run once. New leads then appear hourly without anyone tapping anything.

## Changing names, lists or the target after rollout

Every phone keeps its own copy of the roster and dropdown lists so the app works offline. So a change you make in Settings is local until you push it:

1. Manager Settings → make the change (tap a name to rename it, × to remove, Add to append).
2. Scroll to **Send changes to the team** → **Publish to all phones**.

Each phone picks it up when it next opens the app, and again every five minutes while open. If you rename someone who is currently signed in on that phone, they're returned to the name-pick screen so they choose the corrected name.

Note this does **not** rewrite the `Caller` column for leads already assigned under the old spelling. Fix those in the sheet with Find and replace (Ctrl+H) on the `Caller` column, or leave them — the dashboard will list both spellings until you do.

## Troubleshooting

**"Blocked by Google" when you tap Test**

Nine times out of ten the deployment settings are wrong, not the URL. In Apps Script:

1. **Deploy → Manage deployments** → pencil icon on the active one.
2. **Who has access** must be **Anyone**. "Anyone with a Google account" looks similar but makes Google demand a sign-in the app can't do.
3. **Execute as** must be **Me**.
4. Version → **New version** → Deploy. Editing settings alone doesn't republish; you need a new version.
5. Copy the URL again — it must end in **/exec**, never `/dev` (the `/dev` URL only works while you're signed in as the owner).

Then hard-refresh the app and tap Test again.

**"Unauthorised"** — the token in Settings doesn't match `API_TOKEN` in `Code.gs`. Check for a trailing space.

**"Script returned an error page"** — usually a syntax error in the pasted script, or you pasted only part of it. Re-copy the whole of `Code.gs`.

## Security

The web app must be deployed as "Anyone" (that's how a browser can reach it without Google sign-in), so the endpoint is protected by the **shared token** instead: every request carries it, and the script rejects anything without a match. Two rules follow:

- Treat the token like a password. Share it with the team directly, not in a public place.
- If it leaks, change `API_TOKEN` in the script, redeploy, and update the token in each phone's Settings.

Also change the manager PIN from the default `1947` (Settings → Manager PIN). The app URL is public, so the PIN is the only thing between a stranger and your dashboard.
