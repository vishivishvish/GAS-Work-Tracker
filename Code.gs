/**
 * Threadline - a horizontal Trello-like thread / sub-thread / action-item
 * tracker, served as a Google Apps Script web app, backed by a Google Sheet.
 *
 * SETUP (one-time):
 * 1. Paste this file and Index.html into a new Apps Script project
 *    (script.google.com/home > New project). Create Index.html as a
 *    separate HTML file in the same project (File > New > HTML file,
 *    name it exactly "Index").
 * 2. Select `setupSheets` in the function dropdown and click Run. On first
 *    run this creates a new Google Sheet named "Threadline Data", builds
 *    the Threads/SubThreads/Items/Meta tabs with headers, and stores the
 *    Sheet's ID in this script's Script Properties - you never need to
 *    hardcode or touch a Sheet ID yourself. Check View > Logs (or the
 *    execution log) for the Sheet's URL. Approve permissions when prompted.
 * 3. (Optional but recommended) Set up direct-edit sync: Triggers (clock
 *    icon) > Add Trigger > function `onEditInstalled`, event source
 *    "From spreadsheet", select the Sheet created in step 2, event type
 *    "On edit". This makes manual edits made directly in the Sheet show
 *    up in the web app too (the standalone-script `onEdit` simple trigger
 *    does NOT fire automatically for a sheet the script only references by
 *    ID, so this installable trigger is what makes that work).
 * 4. Deploy > New deployment > Web app. Execute as: Me. Who has access:
 *    Only myself (or your Workspace domain, if you want teammates using
 *    it too - they'd also need edit access to the Sheet). Copy the web
 *    app URL - that's your bookmark.
 * 5. To ship code changes later WITHOUT changing that URL: Deploy >
 *    Manage deployments > pick the existing deployment > Edit (pencil) >
 *    Version: New version > Deploy. Creating a brand new deployment
 *    instead would give you a different URL.
 *
 * The Sheet can live anywhere in your Drive and can be moved between
 * folders freely - it's referenced by its permanent file ID (stored in
 * Script Properties), not by path, so moving folders never breaks it.
 */

const SHEET_NAMES = {
  THREADS: "Threads",
  SUBTHREADS: "SubThreads",
  ITEMS: "Items",
  META: "Meta",
};

// ---- Setup ----

function setupSheets() {
  const props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty("SHEET_ID");
  var ss;
  if (sheetId) {
    ss = SpreadsheetApp.openById(sheetId);
  } else {
    ss = SpreadsheetApp.create("Threadline Data");
    props.setProperty("SHEET_ID", ss.getId());
  }

  ensureSheet_(ss, SHEET_NAMES.THREADS, ["ThreadID", "Name", "Order", "Collapsed"]);
  ensureSheet_(ss, SHEET_NAMES.SUBTHREADS, ["SubThreadID", "ThreadID", "Name", "Tag", "Order", "Collapsed"]);
  ensureSheet_(ss, SHEET_NAMES.ITEMS, ["ItemID", "SubThreadID", "Text", "Checked", "Owner", "Order"]);

  const metaSheet = ensureSheet_(ss, SHEET_NAMES.META, ["Key", "Value"]);
  if (metaSheet.getRange("A2").getValue() !== "LastModified") {
    metaSheet.getRange("A2").setValue("LastModified");
    metaSheet.getRange("B2").setValue(new Date().getTime());
  }

  const defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  Logger.log("Threadline Sheet ready: " + ss.getUrl());
  return ss.getUrl();
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ---- Web app entry point ----

function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Threadline")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

// ---- Sheet access helpers ----

function getSheetId_() {
  const id = PropertiesService.getScriptProperties().getProperty("SHEET_ID");
  if (!id) throw new Error("SHEET_ID not set - run setupSheets() once first.");
  return id;
}

function getSheet_(name) {
  return SpreadsheetApp.openById(getSheetId_()).getSheetByName(name);
}

function rowsToObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values.map(function (row) {
    const obj = {};
    headers.forEach(function (h, i) {
      obj[h] = row[i];
    });
    return obj;
  });
}

function findRow_(sheet, idColName, id) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf(idColName);
  for (var i = 1; i < values.length; i++) {
    if (values[i][idCol] === id) {
      return { rowIndex: i + 1, headers: headers, row: values[i] };
    }
  }
  return null;
}

function updateCell_(sheet, idColName, id, colName, value) {
  const found = findRow_(sheet, idColName, id);
  if (!found) throw new Error("Row not found: " + id);
  const col = found.headers.indexOf(colName);
  if (col === -1) throw new Error("Column not found: " + colName);
  sheet.getRange(found.rowIndex, col + 1).setValue(value);
}

function deleteRow_(sheet, idColName, id) {
  const found = findRow_(sheet, idColName, id);
  if (!found) return false;
  sheet.deleteRow(found.rowIndex);
  return true;
}

function bumpLastModified_() {
  const sheet = getSheet_(SHEET_NAMES.META);
  const found = findRow_(sheet, "Key", "LastModified");
  const now = new Date().getTime();
  if (found) {
    sheet.getRange(found.rowIndex, found.headers.indexOf("Value") + 1).setValue(now);
  } else {
    sheet.appendRow(["LastModified", now]);
  }
}

function getLastModified() {
  const sheet = getSheet_(SHEET_NAMES.META);
  const found = findRow_(sheet, "Key", "LastModified");
  return found ? Number(found.row[found.headers.indexOf("Value")]) || 0 : 0;
}

// ---- Read: the whole board, nested and ready to render ----

function getBoardData() {
  const threads = rowsToObjects_(getSheet_(SHEET_NAMES.THREADS));
  const subthreads = rowsToObjects_(getSheet_(SHEET_NAMES.SUBTHREADS));
  const items = rowsToObjects_(getSheet_(SHEET_NAMES.ITEMS));

  threads.sort(function (a, b) {
    return a.Order - b.Order;
  });
  subthreads.sort(function (a, b) {
    return a.Order - b.Order;
  });
  items.sort(function (a, b) {
    return a.Order - b.Order;
  });

  const board = threads.map(function (t) {
    const subs = subthreads
      .filter(function (s) {
        return s.ThreadID === t.ThreadID;
      })
      .map(function (s) {
        const its = items
          .filter(function (i) {
            return i.SubThreadID === s.SubThreadID;
          })
          .map(function (i, idx) {
            return {
              itemId: i.ItemID,
              letter: String.fromCharCode(65 + idx),
              text: i.Text,
              checked: !!i.Checked,
              owner: i.Owner || "",
            };
          });
        return {
          subThreadId: s.SubThreadID,
          name: s.Name,
          tag: s.Tag || "",
          collapsed: !!s.Collapsed,
          items: its,
        };
      });
    return {
      threadId: t.ThreadID,
      name: t.Name,
      collapsed: !!t.Collapsed,
      subthreads: subs,
    };
  });

  return { board: board, lastModified: getLastModified() };
}

// ---- Writes: threads ----

function addThread(name) {
  const sheet = getSheet_(SHEET_NAMES.THREADS);
  const id = Utilities.getUuid();
  sheet.appendRow([id, name, sheet.getLastRow(), false]);
  bumpLastModified_();
  return id;
}

function renameThread(threadId, newName) {
  updateCell_(getSheet_(SHEET_NAMES.THREADS), "ThreadID", threadId, "Name", newName);
  bumpLastModified_();
}

function setThreadCollapsed(threadId, collapsed) {
  updateCell_(getSheet_(SHEET_NAMES.THREADS), "ThreadID", threadId, "Collapsed", collapsed);
  bumpLastModified_();
}

function deleteThread(threadId) {
  // Cascade: remove sub-threads and items under this thread first.
  const subSheet = getSheet_(SHEET_NAMES.SUBTHREADS);
  const subs = rowsToObjects_(subSheet).filter(function (s) {
    return s.ThreadID === threadId;
  });
  subs.forEach(function (s) {
    deleteSubThread(s.SubThreadID, true);
  });
  deleteRow_(getSheet_(SHEET_NAMES.THREADS), "ThreadID", threadId);
  bumpLastModified_();
}

// ---- Writes: sub-threads ----

function addSubThread(threadId, name, tag) {
  const sheet = getSheet_(SHEET_NAMES.SUBTHREADS);
  const id = Utilities.getUuid();
  sheet.appendRow([id, threadId, name, tag || "", sheet.getLastRow(), false]);
  bumpLastModified_();
  return id;
}

function renameSubThread(subThreadId, newName, newTag) {
  const sheet = getSheet_(SHEET_NAMES.SUBTHREADS);
  updateCell_(sheet, "SubThreadID", subThreadId, "Name", newName);
  updateCell_(sheet, "SubThreadID", subThreadId, "Tag", newTag || "");
  bumpLastModified_();
}

function setSubThreadCollapsed(subThreadId, collapsed) {
  updateCell_(getSheet_(SHEET_NAMES.SUBTHREADS), "SubThreadID", subThreadId, "Collapsed", collapsed);
  bumpLastModified_();
}

function deleteSubThread(subThreadId, skipBump) {
  const itemsSheet = getSheet_(SHEET_NAMES.ITEMS);
  const items = rowsToObjects_(itemsSheet).filter(function (i) {
    return i.SubThreadID === subThreadId;
  });
  items.forEach(function (i) {
    deleteRow_(itemsSheet, "ItemID", i.ItemID);
  });
  deleteRow_(getSheet_(SHEET_NAMES.SUBTHREADS), "SubThreadID", subThreadId);
  if (!skipBump) bumpLastModified_();
}

// ---- Writes: items ----

function addItem(subThreadId, text, owner) {
  const sheet = getSheet_(SHEET_NAMES.ITEMS);
  const id = Utilities.getUuid();
  sheet.appendRow([id, subThreadId, text, false, owner || "", sheet.getLastRow()]);
  bumpLastModified_();
  return id;
}

function editItem(itemId, newText, newOwner) {
  const sheet = getSheet_(SHEET_NAMES.ITEMS);
  updateCell_(sheet, "ItemID", itemId, "Text", newText);
  updateCell_(sheet, "ItemID", itemId, "Owner", newOwner || "");
  bumpLastModified_();
}

function toggleItem(itemId) {
  const sheet = getSheet_(SHEET_NAMES.ITEMS);
  const found = findRow_(sheet, "ItemID", itemId);
  if (!found) throw new Error("Item not found: " + itemId);
  const checkedCol = found.headers.indexOf("Checked");
  const newVal = !found.row[checkedCol];
  sheet.getRange(found.rowIndex, checkedCol + 1).setValue(newVal);
  bumpLastModified_();
  return newVal;
}

function deleteItem(itemId) {
  deleteRow_(getSheet_(SHEET_NAMES.ITEMS), "ItemID", itemId);
  bumpLastModified_();
}

// ---- Direct-Sheet-edit sync (installable trigger, see setup step 3) ----

function onEditInstalled(e) {
  if (e.range.getSheet().getName() !== SHEET_NAMES.META) {
    bumpLastModified_();
  }
}
