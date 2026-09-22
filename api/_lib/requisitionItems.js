// Line items on a purchase requisition.
//
// A requisition used to carry exactly one item in flat columns (ItemCategory,
// Description, Quantity, UnitPrice...). It now carries a list, stored as JSON
// in the LineItems column. The flat columns are still written, summarising the
// list, so SharePoint views, older rows and anything reading them keep working.
//
// Every reader goes through itemsFromRow(), which rebuilds a one-item list from
// the flat columns for rows written before LineItems existed.
//
// One currency and one vendor per requisition: the items come off a single
// vendor quotation.

const MAX_ITEMS = 20;
const OTHER = 'Others';

const round2 = (n) => Math.round(n * 100) / 100;
const str = (v, max = 4000) => String(v ?? '').trim().slice(0, max);

/** The category a person reads: the free-text one when "Others" was picked. */
const categoryLabel = (it) =>
  (it.category === OTHER && it.categoryOther) ? it.categoryOther : (it.category || '');

function badRequest(message) {
  const e = new Error(message);
  e.status = 400;
  return e;
}

/**
 * Validate and clean the items a client posted. Throws a 400 on anything
 * unusable. Totals are recomputed here, never taken from the client.
 */
function normaliseItems(raw) {
  if (!Array.isArray(raw) || raw.length === 0)
    throw badRequest('Add at least one item');
  if (raw.length > MAX_ITEMS)
    throw badRequest(`A requisition can hold at most ${MAX_ITEMS} items`);

  return raw.map((r, i) => {
    const n = i + 1;
    const category      = str(r?.category, 255);
    const categoryOther = category === OTHER ? str(r?.categoryOther, 255) : '';
    // Capped so twenty items still fit one multi-line column (~63k chars).
    const description   = str(r?.description, 2000);
    const quantity      = Number(r?.quantity);
    const unitPrice     = Number(r?.unitPrice);

    if (!category) throw badRequest(`Item ${n}: select a category`);
    if (category === OTHER && !categoryOther) throw badRequest(`Item ${n}: describe the category`);
    if (!description) throw badRequest(`Item ${n}: describe the item or service`);
    if (!Number.isFinite(quantity) || quantity <= 0)
      throw badRequest(`Item ${n}: quantity must be greater than zero`);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0)
      throw badRequest(`Item ${n}: unit price must be greater than zero`);

    // Total from the rounded price, so qty × the price shown is the total shown.
    const price = round2(unitPrice);
    return {
      category,
      categoryOther,
      description,
      quantity,
      unitPrice: price,
      total: round2(quantity * price),
    };
  });
}

/** The items on a SharePoint row, whichever shape it was written in. */
function itemsFromRow(f) {
  if (f.LineItems) {
    try {
      const parsed = JSON.parse(f.LineItems);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      // Fall through to the flat columns rather than lose the request.
    }
  }
  const quantity  = Number(f.Quantity) || 0;
  const unitPrice = Number(f.UnitPrice) || 0;
  return [{
    category:      f.ItemCategory || '',
    categoryOther: f.ItemCategoryOther || '',
    description:   f.Description || '',
    quantity,
    unitPrice,
    total: Number(f.EstimatedTotal) || round2(quantity * unitPrice),
  }];
}

/** "Laptop" for one item, "Laptop + 2 more" for three. */
function itemsTitle(items) {
  if (!items.length) return '';
  const first = categoryLabel(items[0]);
  return items.length === 1 ? first : `${first} + ${items.length - 1} more`;
}

/** "2 × Laptop" for one item, "3 items" for several, for subject lines. */
function itemsHeadline(items) {
  if (items.length === 1) return `${items[0].quantity} × ${categoryLabel(items[0])}`;
  return `${items.length} items`;
}

/**
 * The flat columns written alongside LineItems. A single item fills them
 * exactly as before; several items are summarised so a list view still reads.
 */
function flatColumns(items) {
  const first = items[0];
  if (items.length === 1) {
    return {
      ItemCategory:      first.category,
      ItemCategoryOther: first.categoryOther,
      Description:       first.description,
      Quantity:          first.quantity,
      UnitPrice:         first.unitPrice,
    };
  }
  return {
    ItemCategory:      first.category,
    ItemCategoryOther: first.categoryOther,
    Description: items
      .map((it, i) => `${i + 1}. ${it.quantity} × ${categoryLabel(it)}: ${it.description}`)
      .join('\n'),
    // Total units across the items. UnitPrice has no single meaning here, so it
    // is left empty rather than showing the first item's price as if it applied.
    Quantity: items.reduce((s, it) => s + it.quantity, 0),
  };
}

module.exports = {
  MAX_ITEMS,
  OTHER,
  categoryLabel,
  normaliseItems,
  itemsFromRow,
  itemsTitle,
  itemsHeadline,
  flatColumns,
};
