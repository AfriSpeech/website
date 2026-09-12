/**
 * AfriSpeech — community join form → Google Sheet.
 *
 * Standalone Apps Script project (script.google.com), not bound to the sheet,
 * so the target sheet is addressed by id.
 *
 * Setup:
 *   1. Create the Google Sheet, copy its id from the URL between /d/ and /edit.
 *   2. Paste that id into SHEET_ID below, and your shared secret into
 *      SECRET (must match JOIN_SHEET_SECRET in Netlify). Never commit the
 *      real secret to this file - it lives in the deployed script only.
 *   3. Run setup() once from the editor to authorize and create the tab.
 *   4. Deploy → New deployment → Web app,
 *      "Execute as: Me", "Who has access: Anyone".
 *   5. Put the /exec URL in Netlify as JOIN_SHEET_URL, and SECRET below as
 *      JOIN_SHEET_SECRET.
 */

var SHEET_ID = 'PASTE_SHEET_ID_HERE';
var SECRET = 'PASTE_SHARED_SECRET_HERE';
var SHEET_NAME = 'Submissions';
var HEADERS = ['Timestamp', 'Name', 'Email', 'Reason', 'Email sent'];

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return json({ ok: false, error: 'forbidden' });

    getSheet().appendRow([
      new Date(),
      String(body.name || ''),
      String(body.email || ''),
      String(body.reason || ''),
      body.emailSent ? 'yes' : 'no',
    ]);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/** Run once from the editor: triggers the auth prompt and creates the tab. */
function setup() {
  var sheet = getSheet();
  Logger.log('Ready: %s → %s', sheet.getParent().getName(), sheet.getName());
}

function getSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
