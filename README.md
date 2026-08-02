# Vishnu's Landscape Work Tracker (GAS-Work-Tracker)

A horizontal, Trello-like tracker for managing a large number of ongoing
work threads at once. Each numbered thread branches out into sub-threads
laid out side by side, and each sub-thread holds a list of lettered,
checkable action steps. Threads can be dragged to reorder them, and
threads/sub-threads/items can each carry an optional date.

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

- `Threads`: ThreadID, Name, Order, Collapsed, DateOpened
- `SubThreads`: SubThreadID, ThreadID, Name, Tag, Order, Collapsed, DateOpened
- `Items`: ItemID, SubThreadID, Text, Checked, Owner, Order, Date
- `Meta`: Key, Value (holds `LastModified`, bumped by every write)

Letters (A, B, C...) for action steps and numbers (1, 2, 3...) for threads
are both computed at read time from each row's position - never stored -
so deleting/adding/reordering never causes duplicate or stale labels.

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
5. *If you had this project set up before the `DateOpened`/`Date` columns
   existed*, select `migrateAddDateColumns` in the function dropdown and
   click **Run** once. It only adds the missing columns and never touches
   existing data - brand-new setups already have them from `setupSheets`
   and can skip this.
6. *(Optional, recommended)* Set up direct-edit sync: select `installEditTrigger`
   in the function dropdown and click **Run**. (Not done via the Triggers UI's
   "Add Trigger" dialog - its "From spreadsheet" event source is only offered
   to scripts *bound* to a Sheet, i.e. opened via Extensions > Apps Script
   from inside the Sheet itself. Since this is a standalone script, that
   option won't appear there, so the trigger is installed in code instead.)
   Without this, edits made directly in the Sheet (rather than through the
   web app) won't be picked up until the next write through the app bumps
   `LastModified` - with it, direct Sheet edits sync too.
7. **Deploy > New deployment > Web app**. Execute as: **Me**. Who has
   access: **Only myself** (or your Workspace domain, if teammates should
   use it too - they'd then also need edit access to the underlying Sheet).
   Copy the resulting web app URL - that's the bookmark you'll use daily.
8. To ship code changes later **without changing that URL**: **Deploy >
   Manage deployments** > pick the existing deployment > pencil/Edit icon >
   Version: **New version** > Deploy. Creating a brand-new deployment
   instead of editing the existing one gives you a different URL each time.

## How live updates work

Since Apps Script web apps can't push updates over a server socket,
`Index.html` instead polls `getLastModified()` every 5 seconds (a single
cheap cell read), only re-fetching the full board (`getBoardData()`) once
that timestamp has actually moved. Every write function bumps the timestamp, and (with the
installable trigger from step 6) so does any direct edit in the Sheet.

## Thread reordering

Threads are numbered by their on-page position, and each thread's header
(the row with the chevron, number, and title) is a drag handle: drag one
thread and drop it above or below another to reorder. The drop calls
`reorderThreads()`, which rewrites the `Order` column for every thread, and
the board re-renders immediately with updated numbers - other open tabs
pick up the new order on their next 5-second poll.

## Dates

Threads, sub-threads, and items each carry an optional date (when the
thread/sub-thread was opened, or when an item was last relevant). They're
set through the same prompts used for naming: adding or renaming a thread
or sub-thread, and adding or editing an item, all ask for a date as one of
the sequential prompts (leave blank to clear it).
