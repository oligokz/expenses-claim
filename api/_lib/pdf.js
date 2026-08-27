// Renders the approved requisition as a PDF.
//
// Composed once, when the final approval lands, not generated at submit and
// patched at each stage. The SharePoint row is the record; this is a rendering
// of it, so it can always be rebuilt from the row and there is no half-signed
// artifact to reconcile if something fails midway.
//
// pdf-lib is pure JS. An HTML-to-PDF renderer would mean bundling Chromium,
// which is far too heavy for a Vercel function.

const { getDriveId } = require('./sharepoint');
const { topFolderFor } = require('./attachments');

/* The CREOX mark from public/logo.svg, path data only (240 x 60 viewBox).
 * Drawn as vector rather than a raster: no rasteriser is needed, it stays
 * crisp at any zoom, and the source SVG is white-on-transparent, invisible on
 * white paper, so it has to be recoloured at draw time anyway. */
const LOGO_VIEWBOX = [240, 60];
const LOGO_PATHS = [
  'M19.7746 47.6751L0 36.1536V23.8376L19.7746 35.3502V47.6751Z',
  'M39.5579 23.8376L19.7746 12.3249V24.641L39.5579 36.1536L59.3325 24.641V12.3249L39.5579 23.8376Z',
  'M39.5579 36.1624L19.7834 47.6839V60L39.5579 48.4873L59.3413 60V47.6839L39.5579 36.1624Z',
  'M0 23.8376L19.7746 12.3249V0L0 11.5127V23.8376Z',
  'M240 21.8952L225.372 29.3025L210.752 21.8952V29.8234L224.922 37.01L210.752 44.1966V52.1336L225.372 44.7175L240 52.1336V44.1966L225.821 37.01L240 29.8234V21.8952Z',
  'M100.062 51.9835H83.9802C76.2783 51.9835 70.6826 45.8034 70.6826 37.2925C70.6826 28.7816 76.2783 22.6015 83.9802 22.6015H100.062V29.1789H83.9802C79.0101 29.1789 77.2476 33.5491 77.2476 37.2925C77.2476 41.0359 79.0101 45.4061 83.9802 45.4061H100.062V51.9835Z',
  'M171.115 29.1878V22.6104H142.299V51.9835H171.115V45.4061H148.864V40.5856H168.674V34.0082H148.864V29.1878H171.115Z',
  'M136.994 51.957L128.482 43.8699C133.434 42.8193 137.144 38.3343 136.985 33.0194C136.809 27.1572 131.786 22.6015 125.935 22.6015H106.143V51.957H112.708V37.9459L127.451 51.957H136.994ZM112.708 29.1789H126.261C128.552 29.1789 130.42 31.0506 130.42 33.3461C130.42 35.6416 128.552 37.5221 126.261 37.5221H112.708V29.1789Z',
  'M193.057 52.5574H189.515C181.117 52.5574 174.287 45.7151 174.287 37.3014C174.287 28.8876 181.117 22.0365 189.515 22.0365H193.057C201.455 22.0365 208.285 28.8788 208.285 37.3014C208.285 45.724 201.455 52.5574 193.057 52.5574ZM189.515 28.4285C184.633 28.4285 180.668 32.4014 180.668 37.2925C180.668 42.1836 184.633 46.1566 189.515 46.1566H193.057C197.939 46.1566 201.905 42.1836 201.905 37.2925C201.905 32.4014 197.939 28.4285 193.057 28.4285H189.515Z',
];

const A4 = [595.28, 841.89];
const MARGIN = 56;
const INK = [0.06, 0.06, 0.06];
const MUTED = [0.45, 0.45, 0.45];
const RULE = [0.86, 0.86, 0.86];
const PANEL = [0.96, 0.96, 0.96];
const GREEN = [0.09, 0.42, 0.24];

const LABEL_W = 168;
const LINE = 15;

/* SharePoint returns UTC. A date-only column comes back as midnight Singapore
 * time expressed as 16:00Z the previous day, so formatting without the zone
 * silently shows the wrong day. */
const TZ = 'Asia/Singapore';

function parts(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(d);
  const get = (t) => f.find((p) => p.type === t)?.value || '';
  return {
    date: `${get('day')}/${get('month')}/${get('year')}`,
    time: `${get('hour')}:${get('minute')} ${get('dayPeriod').toLowerCase()}`,
  };
}

/** "9:41 am 06/08/2026" */
function fmtDateTime(value) {
  if (!value) return '';
  const p = parts(value);
  return p ? `${p.time} ${p.date}` : String(value);
}

/** "06/08/2026" */
function fmtDate(value) {
  if (!value) return '';
  const p = parts(value);
  return p ? p.date : String(value);
}

/** Fetch a file's bytes from the document library by drive-relative path. */
async function fetchDriveFile(token, siteId, path) {
  const driveId = await getDriveId(token, siteId);
  const encoded = String(path).split('/').map(encodeURIComponent).join('/');
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encoded}:/content`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`fetchDriveFile failed (${res.status}) for ${path}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * @param {object} o
 * @param {object} o.fields      the SharePoint row
 * @param {string} o.claimRef    e.g. REQ-12
 * @param {Array}  o.signatures  [{ stage, label, name, date, png?: Uint8Array }]
 */
async function buildRequisitionPdf({ fields, claimRef, signatures = [] }) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

  const doc  = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage(A4);
  let y = A4[1] - MARGIN;
  const width = A4[0] - MARGIN * 2;

  const colour = (c) => rgb(c[0], c[1], c[2]);

  /** Start a new page when the next block wouldn't fit. */
  const ensure = (needed) => {
    if (y - needed >= MARGIN) return;
    page = doc.addPage(A4);
    y = A4[1] - MARGIN;
  };

  const text = (s, { x = MARGIN, size = 10, f = font, c = INK } = {}) => {
    page.drawText(String(s ?? ''), { x, y, size, font: f, color: colour(c) });
  };

  const rule = () => {
    page.drawLine({
      start: { x: MARGIN, y },
      end:   { x: MARGIN + width, y },
      thickness: 0.5,
      color: colour(RULE),
    });
  };

  /* Wrap to the available width, descriptions are free text and will overflow
     the page otherwise. */
  const wrap = (s, size, maxWidth) => {
    const words = String(s ?? '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  /* ── header ── */
  const logoW = 96;
  const logoScale = logoW / LOGO_VIEWBOX[0];
  const logoH = LOGO_VIEWBOX[1] * logoScale;
  for (const d of LOGO_PATHS) {
    // drawSvgPath treats (x, y) as the SVG origin with y running downward, so
    // pass the top of the block rather than its baseline.
    page.drawSvgPath(d, { x: MARGIN, y, scale: logoScale, color: colour(INK) });
  }

  // Status sits on the logo line, hard right, the first thing worth knowing.
  const statusLabel = (fields.Status || 'Pending').toUpperCase();
  page.drawText(statusLabel, {
    x: MARGIN + width - bold.widthOfTextAtSize(statusLabel, 10),
    y: y - logoH + 14,
    size: 10,
    font: bold,
    color: colour(statusLabel === 'APPROVED' ? GREEN : MUTED),
  });

  y -= logoH + 32;

  text('Purchase Requisition', { size: 21, f: bold });
  y -= 18;
  text(claimRef, { size: 12, f: bold, c: MUTED });
  y -= 14;
  rule();
  y -= 28;

  const section = (title) => {
    ensure(90);
    text(title.toUpperCase(), { size: 8.5, f: bold, c: MUTED });
    y -= 8;
    rule();
    y -= 18;
  };

  const field = (label, value, opts = {}) => {
    if (value === undefined || value === null || String(value).trim() === '') return;
    const size = opts.strong ? 11 : 10;
    const valueFont = opts.strong ? bold : font;
    const lines = wrap(value, size, width - LABEL_W);
    ensure(lines.length * LINE + 8);
    text(label, { size: 10, c: MUTED });
    lines.forEach((ln, i) => {
      page.drawText(ln, {
        x: MARGIN + LABEL_W,
        y: y - i * LINE,
        size,
        font: valueFont,
        color: colour(INK),
      });
    });
    y -= lines.length * LINE;
  };

  const money = (n) =>
    Number(n || 0).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  section('Requestor');
  field('Name', fields.RequestorName);
  field('Email', fields.RequestorEmail);
  field('Department', fields.Department);
  field('Job title', fields.JobTitle);
  field('Submitted', fmtDateTime(fields.SubmissionDate));
  y -= 22;

  section('Item / service');
  field('Category', fields.ItemCategoryOther || fields.ItemCategory);
  field('Description', fields.Description);
  field('Quantity', String(fields.Quantity ?? ''));
  field('Unit price', `${fields.Currency || 'SGD'} ${money(fields.UnitPrice)}`);
  if (fields.Currency && fields.Currency !== 'SGD') {
    field('Estimated total', `${fields.Currency} ${money(fields.EstimatedTotal)}`);
  }
  y -= 14;

  // The committed figure gets a panel, it's what the approval is really about.
  ensure(46);
  page.drawRectangle({
    x: MARGIN, y: y - 11, width, height: 32, color: colour(PANEL),
  });
  page.drawText('Estimated total (SGD)', {
    x: MARGIN + 14, y, size: 10, font, color: colour(MUTED),
  });
  const totalStr = `SGD ${money(fields.EstimatedTotalSGD)}`;
  page.drawText(totalStr, {
    x: MARGIN + width - 14 - bold.widthOfTextAtSize(totalStr, 13),
    y: y - 2,
    size: 13,
    font: bold,
    color: colour(INK),
  });
  y -= 50;

  section('Vendor');
  field('Vendor', fields.VendorName);
  field('Contact', fields.VendorContact);
  field('Email', fields.VendorEmail);
  field('Quotation attached', fields.QuotationAttached ? 'Yes' : 'No');
  y -= 22;

  section('Project / customer');
  field('For', fields.ProjectCustomer);
  y -= 22;

  /* ── approvals ──
   * Boxed side by side, mirroring the signature table on the paper form.
   * A stage nobody was nominated for never happened, so it gets no box. */
  const acted = signatures.filter((s) => s.name || s.png);
  if (acted.length) {
    ensure(150);
    section('Approvals');

    const gap = 16;
    const boxW = (width - gap) / 2;
    const boxH = 108;

    for (let i = 0; i < acted.length; i += 2) {
      const row = acted.slice(i, i + 2);
      ensure(boxH + 12);
      const top = y;

      row.forEach((sig, j) => {
        const bx = MARGIN + j * (boxW + gap);
        const by = top - boxH + 12;

        page.drawRectangle({
          x: bx, y: by, width: boxW, height: boxH,
          borderColor: colour(RULE), borderWidth: 0.5,
        });

        page.drawText(sig.label, {
          x: bx + 14, y: top - 6, size: 9, font: bold, color: colour(INK),
        });
        page.drawText(sig.name || '', {
          x: bx + 14, y: top - 23, size: 10, font, color: colour(INK),
        });
        const when = fmtDateTime(sig.date);
        if (when) {
          page.drawText(when, {
            x: bx + 14, y: top - 37, size: 8.5, font, color: colour(MUTED),
          });
        }
      });

      // Images need await, so they go in a second pass over the same row.
      for (let j = 0; j < row.length; j++) {
        const sig = row[j];
        if (!sig.png) continue;
        const bx = MARGIN + j * (boxW + gap);
        const by = top - boxH + 12;
        try {
          const img = await doc.embedPng(sig.png);
          // Cap both dimensions; signatures vary wildly in aspect ratio.
          const scale = Math.min(38 / img.height, (boxW - 28) / img.width, 1);
          page.drawImage(img, {
            x: bx + 14,
            y: by + 12,
            width: img.width * scale,
            height: img.height * scale,
          });
        } catch {
          // A missing or corrupt image must not lose the whole document.
          page.drawText('(signature image unavailable)', {
            x: bx + 14, y: by + 16, size: 8, font, color: colour(MUTED),
          });
        }
      }

      y -= boxH + gap;
    }
    y -= 10;
  }

  if (fields.ApprovalNotes) {
    ensure(60);
    section('Notes');
    for (const line of String(fields.ApprovalNotes).split('\n').filter(Boolean)) {
      for (const ln of wrap(line, 9, width)) {
        ensure(12);
        text(ln, { size: 9, c: MUTED });
        y -= 11;
      }
    }
  }

  /* ── footer on every page ── */
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `${claimRef}  ·  page ${i + 1} of ${pages.length}`;
    p.drawText(label, {
      x: MARGIN,
      y: 28,
      size: 8,
      font,
      color: colour(MUTED),
    });
  });

  return doc.save();
}

/**
 * The signed travel request.
 *
 * The drawing scaffolding below repeats buildRequisitionPdf's rather than
 * sharing it. That is deliberate: the primitives all mutate the same `page`
 * and `y` cursor, so factoring them out means rewriting the requisition
 * document's body too, and that one is a signed record people have already
 * approved. Two independent layouts that can diverge beat one shared one that
 * risks shifting a document nobody asked us to touch.
 *
 * @param {object} o
 * @param {object} o.fields      the SharePoint row
 * @param {string} o.claimRef    e.g. TRV-7
 * @param {Array}  o.signatures  [{ stage, label, name, date, png?: Uint8Array }]
 */
async function buildTravelPdf({ fields, claimRef, signatures = [] }) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

  const doc  = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage(A4);
  let y = A4[1] - MARGIN;
  const width = A4[0] - MARGIN * 2;

  const colour = (c) => rgb(c[0], c[1], c[2]);

  const ensure = (needed) => {
    if (y - needed >= MARGIN) return;
    page = doc.addPage(A4);
    y = A4[1] - MARGIN;
  };

  const text = (s, { x = MARGIN, size = 10, f = font, c = INK } = {}) => {
    page.drawText(String(s ?? ''), { x, y, size, font: f, color: colour(c) });
  };

  const rule = () => {
    page.drawLine({
      start: { x: MARGIN, y },
      end:   { x: MARGIN + width, y },
      thickness: 0.5,
      color: colour(RULE),
    });
  };

  const wrap = (s, size, maxWidth) => {
    const words = String(s ?? '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  /* ── header ── */
  const logoW = 96;
  const logoScale = logoW / LOGO_VIEWBOX[0];
  const logoH = LOGO_VIEWBOX[1] * logoScale;
  for (const d of LOGO_PATHS) {
    page.drawSvgPath(d, { x: MARGIN, y, scale: logoScale, color: colour(INK) });
  }

  const statusLabel = (fields.Status || 'Pending').toUpperCase();
  page.drawText(statusLabel, {
    x: MARGIN + width - bold.widthOfTextAtSize(statusLabel, 10),
    y: y - logoH + 14,
    size: 10,
    font: bold,
    color: colour(statusLabel === 'APPROVED' ? GREEN : MUTED),
  });

  y -= logoH + 32;

  text('Travel Request', { size: 21, f: bold });
  y -= 18;
  text(claimRef, { size: 12, f: bold, c: MUTED });
  y -= 14;
  rule();
  y -= 28;

  const section = (title) => {
    ensure(90);
    text(title.toUpperCase(), { size: 8.5, f: bold, c: MUTED });
    y -= 8;
    rule();
    y -= 18;
  };

  const field = (label, value, opts = {}) => {
    if (value === undefined || value === null || String(value).trim() === '') return;
    const size = opts.strong ? 11 : 10;
    const valueFont = opts.strong ? bold : font;
    const lines = wrap(value, size, width - LABEL_W);
    ensure(lines.length * LINE + 8);
    text(label, { size: 10, c: MUTED });
    lines.forEach((ln, i) => {
      page.drawText(ln, {
        x: MARGIN + LABEL_W,
        y: y - i * LINE,
        size,
        font: valueFont,
        color: colour(INK),
      });
    });
    y -= lines.length * LINE;
  };

  const money = (n) =>
    Number(n || 0).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  section('Requestor');
  field('Name', fields.RequestorName);
  field('Email', fields.RequestorEmail);
  field('Department', fields.Department);
  field('Job title', fields.JobTitle);
  field('Submitted', fmtDateTime(fields.SubmissionDate));
  y -= 22;

  section('Travel details');
  field('Purpose', fields.PurposeOfTravel);
  field('Meeting / event', fields.EventName);
  field('Destination', fields.Destination);
  field('From', fmtDate(fields.TravelFrom));
  field('To', fmtDate(fields.TravelTo));
  y -= 22;

  if (fields.Agenda) {
    section('Travel agenda');
    // Free prose, so it runs the full width rather than sitting in the value
    // column: trip objectives are paragraphs, not label/value pairs.
    for (const para of String(fields.Agenda).split('\n')) {
      if (!para.trim()) { y -= 6; continue; }
      for (const ln of wrap(para, 10, width)) {
        ensure(LINE + 4);
        text(ln, { size: 10 });
        y -= LINE;
      }
    }
    y -= 22;
  }

  /* ── budget ──
   * Two columns, category and cost, mirroring the table on the paper form.
   * Zero rows are dropped: an empty line reads as an oversight. */
  const budget = [
    ['Flight',                  fields.CostFlight],
    ['Hotel / accommodation',   fields.CostHotel],
    ['Event / registration',    fields.CostEventFees],
    ['Transport',               fields.CostTransport],
    [fields.CostOtherNote || 'Other expenses', fields.CostOther],
  ].filter(([, v]) => Number(v || 0) > 0);

  if (budget.length) {
    section('Expected travel & expenses budget');
    for (const [label, amount] of budget) {
      ensure(LINE + 6);
      text(label, { size: 10, c: MUTED });
      const amt = `SGD ${money(amount)}`;
      page.drawText(amt, {
        x: MARGIN + width - font.widthOfTextAtSize(amt, 10),
        y,
        size: 10,
        font,
        color: colour(INK),
      });
      y -= LINE;
    }
    y -= 12;
  }

  // The committed figure gets a panel, as on the requisition sheet.
  ensure(46);
  page.drawRectangle({
    x: MARGIN, y: y - 11, width, height: 32, color: colour(PANEL),
  });
  page.drawText('Total estimated cost (SGD)', {
    x: MARGIN + 14, y, size: 10, font, color: colour(MUTED),
  });
  const totalStr = `SGD ${money(fields.TotalEstimatedSGD)}`;
  page.drawText(totalStr, {
    x: MARGIN + width - 14 - bold.widthOfTextAtSize(totalStr, 13),
    y: y - 2,
    size: 13,
    font: bold,
    color: colour(INK),
  });
  y -= 50;

  /* ── approvals ── */
  const acted = signatures.filter((s) => s.name || s.png);
  if (acted.length) {
    ensure(150);
    section('Approvals');

    const gap = 16;
    const boxW = (width - gap) / 2;
    const boxH = 108;

    for (let i = 0; i < acted.length; i += 2) {
      const row = acted.slice(i, i + 2);
      ensure(boxH + 12);
      const top = y;

      row.forEach((sig, j) => {
        const bx = MARGIN + j * (boxW + gap);
        const by = top - boxH + 12;

        page.drawRectangle({
          x: bx, y: by, width: boxW, height: boxH,
          borderColor: colour(RULE), borderWidth: 0.5,
        });
        page.drawText(sig.label, {
          x: bx + 14, y: top - 6, size: 9, font: bold, color: colour(INK),
        });
        page.drawText(sig.name || '', {
          x: bx + 14, y: top - 23, size: 10, font, color: colour(INK),
        });
        const when = fmtDateTime(sig.date);
        if (when) {
          page.drawText(when, {
            x: bx + 14, y: top - 37, size: 8.5, font, color: colour(MUTED),
          });
        }
      });

      for (let j = 0; j < row.length; j++) {
        const sig = row[j];
        if (!sig.png) continue;
        const bx = MARGIN + j * (boxW + gap);
        const by = top - boxH + 12;
        try {
          const img = await doc.embedPng(sig.png);
          const scale = Math.min(38 / img.height, (boxW - 28) / img.width, 1);
          page.drawImage(img, {
            x: bx + 14,
            y: by + 12,
            width: img.width * scale,
            height: img.height * scale,
          });
        } catch {
          page.drawText('(signature image unavailable)', {
            x: bx + 14, y: by + 16, size: 8, font, color: colour(MUTED),
          });
        }
      }

      y -= boxH + gap;
    }
    y -= 10;
  }

  if (fields.ApprovalNotes) {
    ensure(60);
    section('Notes');
    for (const line of String(fields.ApprovalNotes).split('\n').filter(Boolean)) {
      for (const ln of wrap(line, 9, width)) {
        ensure(12);
        text(ln, { size: 9, c: MUTED });
        y -= 11;
      }
    }
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(`${claimRef}  ·  page ${i + 1} of ${pages.length}`, {
      x: MARGIN, y: 28, size: 8, font, color: colour(MUTED),
    });
  });

  return doc.save();
}

/** Upload the composed PDF beside the request's other attachments. */
async function storePdf(token, siteId, bytes, claimRef, month) {
  const driveId = await getDriveId(token, siteId);
  // Derived from the reference, not hardcoded, so a travel PDF lands beside the
  // travel attachments rather than in the requisition folder.
  const segments = [topFolderFor(claimRef), month, claimRef, `${claimRef}-approved.pdf`];
  const path = segments.map(encodeURIComponent).join('/');
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${path}:/content`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' },
      body: Buffer.from(bytes),
    }
  );
  if (!res.ok) throw new Error(`storePdf failed (${res.status}): ${await res.text()}`);
  const saved = await res.json();
  return { webUrl: saved.webUrl || '', path: segments.join('/') };
}

module.exports = { buildRequisitionPdf, buildTravelPdf, storePdf, fetchDriveFile };
