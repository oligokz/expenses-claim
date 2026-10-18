// Creating SharePoint list rows, shared by the four submit handlers.

/** POST a new row to `listName`. Throws with Graph's response on failure. */
async function createListItem(token, siteId, listName, fields) {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(listName)}/items`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }
  );
  if (!res.ok) {
    throw new Error(`create in "${listName}" failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

// Diagnostic: the list's columns with their data type, so we can tell exactly
// which field is missing or has a mismatched type when a write fails.
async function describeColumns(token, siteId, listName) {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(listName)}/columns`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const typeOf = (c) =>
    c.text ? 'text'
    : c.number ? 'number'
    : c.dateTime ? 'dateTime'
    : c.choice ? 'choice'
    : c.currency ? 'currency'
    : c.boolean ? 'boolean'
    : c.personOrGroup ? 'person'
    : c.lookup ? 'lookup'
    : c.calculated ? 'calculated(read-only)'
    : 'other';
  const map = {};
  for (const c of data.value || []) map[c.name] = typeOf(c) + (c.readOnly ? ' [readOnly]' : '');
  return map;
}

/**
 * Run a create, and if it fails, append each field we sent alongside the
 * column type it maps to. Graph's "generalException" says nothing useful on its
 * own. The report goes to the server log only (see http.js).
 */
async function withColumnReport(token, siteId, listName, fields, create) {
  try {
    return await create();
  } catch (writeErr) {
    const cols = await describeColumns(token, siteId, listName).catch(() => null);
    if (cols) {
      writeErr.message +=
        ' | columns: ' + Object.keys(fields).map((f) => `${f}=${cols[f] || 'MISSING'}`).join(', ');
    }
    throw writeErr;
  }
}

module.exports = { createListItem, describeColumns, withColumnReport };
