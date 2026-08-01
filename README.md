# Vishnu's Landscape Work Tracker (GAS-Work-Tracker)

A horizontal, Trello-like tracker for managing a large number of ongoing
work threads at once. Each thread branches out into sub-threads laid out
side by side, and each sub-thread holds a list of lettered, checkable
action steps.

Runs as a Google Apps Script web app, backed by a Google Sheet, inside your
own Google Workspace account: no external hosting, no separate login.

## Files

- `Code.gs` - backend: Sheet schema setup, `doGet()` web app entry point,
  and all read/write functions (add/rename/delete/toggle for threads,
  sub-threads, and items).
- `Index.html` - frontend: the board UI, rendered from `getBoardData()`,
  polling every 5 seconds for changes and re-rendering when the Sheet's
  `LastModified` timestamp moves.
- `thread-manager-mockup-v2.html` - the original static design mockup
  (kept for reference; not used by the running app).

## Data model (Google Sheet, auto-created by `setupSheets()`)

- `Threads`: ThreadID, Name, Order, Collapsed
- `SubThreads`: SubThreadID, ThreadID, Name, Tag, Order, Collapsed
- `Items`: ItemID, SubThreadID, Text, Checked, Owner, Order
- `Meta`: Key, Value (holds `LastModified`, bumped by every write)

Letters (A, B, C...) for action steps are computed at read time from each
item's position within its sub-thread - never stored - so deleting/adding
items never causes duplicate or stale letters.

The Sheet is referenced by its permanent Drive file ID (stored in this
script's Script Properties), never by folder path, so it can be moved
between Drive folders at any time without breaking anything.

## One-time setup

1. Go to [script.google.com/home](https://script.google.com/home) > New project.
2. Paste `Code.gs`'s contents into the default `Code.gs` file.
3. File > New > HTML file, name it exactly `Index`, paste `Index.html`'s contents in.
4. Select `setupSheets` in the function dropdown (top toolbar) and click **Run**.
   First run creates a new Sheet called "Threadline Data", builds all four
   tabs with headers, and stores its ID in this script's Script Properties.
   Approve the permissions prompt. Check `Execution Log` (top toolbar) for the Sheet's URL.
5. *(Optional, recommended)* Set up direct-edit sync: select `installEditTrigger`
   in the function dropdown and click **Run**. (Not done via the Triggers UI's
   "Add Trigger" dialog - its "From spreadsheet" event source is only offered
   to scripts *bound* to a Sheet, i.e. opened via Extensions > Apps Script
   from inside the Sheet itself. Since this is a standalone script, that
   option won't appear there, so the trigger is installed in code instead.)
   Without this, edits made directly in the Sheet (rather than through the
   web app) won't be picked up until the next write through the app bumps
   `LastModified` - with it, direct Sheet edits sync too.
6. **Deploy > New deployment > Web app**. Execute as: **Me**. Who has
   access: **Only myself** (or your Workspace domain, if teammates should
   use it too - they'd then also need edit access to the underlying Sheet).
   Copy the resulting web app URL - that's the bookmark you'll use daily.
7. To ship code changes later **without changing that URL**: **Deploy >
   Manage deployments** > pick the existing deployment > pencil/Edit icon >
   Version: **New version** > Deploy. Creating a brand-new deployment
   instead of editing the existing one gives you a different URL each time.

## How live updates work

Since Apps Script web apps can't push updates over a server socket,
`Index.html` instead polls `getLastModified()` every 5 seconds (a single
cheap cell read), only re-fetching the full board (`getBoardData()`) once
that timestamp has actually moved. Every write function bumps the timestamp, and (with the
installable trigger from step 5) so does any direct edit in the Sheet.
