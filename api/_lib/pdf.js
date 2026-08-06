// Renders the approved requisition as a PDF.
//
// Composed once, when the final approval lands — not generated at submit and
// patched at each stage. The SharePoint row is the record; this is a rendering
// of it, so it can always be rebuilt from the row and there is no half-signed
// artifact to reconcile if something fails midway.
//
// pdf-lib is pure JS. An HTML-to-PDF renderer would mean bundling Chromium,
// which is far too heavy for a Vercel function.

const { getDriveId } = require('./sharepoint');

const A4 = [595.28, 841.89];
const MARGIN = 50;
const INK = [0.06, 0.06, 0.06];
const MUTED = [0.42, 0.42, 0.42];
const RULE = [0.85, 0.85, 0.85];

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

  /* Wrap to the available width — descriptions are free text and will overflow
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
  text('PURCHASE REQUISITION', { size: 18, f: bold });
  y -= 20;
  text(claimRef, { size: 11, f: bold, c: MUTED });
  const statusLabel = (fields.Status || 'Pending').toUpperCase();
  page.drawText(statusLabel, {
    x: MARGIN + width - bold.widthOfTextAtSize(statusLabel, 11),
    y,
    size: 11,
    font: bold,
    color: colour(statusLabel === 'APPROVED' ? [0.1, 0.45, 0.25] : MUTED),
  });
  y -= 14;
  rule();
  y -= 22;

  const section = (title) => {
    ensure(60);
    text(title.toUpperCase(), { size: 9, f: bold, c: MUTED });
    y -= 14;
  };

  const field = (label, value) => {
    if (value === undefined || value === null || String(value).trim() === '') return;
    const labelW = 150;
    const lines = wrap(value, 10, width - labelW);
    ensure(lines.length * 13 + 6);
    text(label, { size: 10, c: MUTED });
    lines.forEach((ln, i) => {
      page.drawText(ln, {
        x: MARGIN + labelW,
        y: y - i * 13,
        size: 10,
        font,
        color: colour(INK),
      });
    });
    y -= lines.length * 13 + 3;
  };

  const money = (n) =>
    Number(n || 0).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  section('Requestor');
  field('Name', fields.RequestorName);
  field('Email', fields.RequestorEmail);
  field('Department', fields.Department);
  field('Job title', fields.JobTitle);
  field('Submitted', fields.SubmissionDate);
  y -= 12;

  section('Item / service');
  field('Category', fields.ItemCategoryOther || fields.ItemCategory);
  field('Description', fields.Description);
  field('Quantity', fields.Quantity);
  field('Unit price', `${fields.Currency || 'SGD'} ${money(fields.UnitPrice)}`);
  if (fields.Currency && fields.Currency !== 'SGD') {
    field('Estimated total', `${fields.Currency} ${money(fields.EstimatedTotal)}`);
  }
  field('Estimated total (SGD)', `SGD ${money(fields.EstimatedTotalSGD)}`);
  y -= 12;

  section('Vendor');
  field('Vendor', fields.VendorName);
  field('Contact', fields.VendorContact);
  field('Email', fields.VendorEmail);
  field('Quotation attached', fields.QuotationAttached ? 'Yes' : 'No');
  y -= 12;

  section('Project / customer');
  field('For', fields.ProjectCustomer);
  y -= 12;

  /* ── approvals ── */
  ensure(200);
  section('Approvals');

  // A stage nobody was nominated for never happened — don't print an empty
  // signature block for it.
  for (const sig of signatures.filter((s) => s.name || s.png)) {
    ensure(110);
    text(sig.label, { size: 10, f: bold });
    y -= 14;
    text(sig.name || '', { size: 10 });
    const dateStr = sig.date || '';
    page.drawText(dateStr, {
      x: MARGIN + width - font.widthOfTextAtSize(dateStr, 10),
      y,
      size: 10,
      font,
      color: colour(MUTED),
    });
    y -= 6;

    if (sig.png) {
      try {
        const img = await doc.embedPng(sig.png);
        // Cap the height; signatures vary wildly in aspect ratio.
        const maxH = 46;
        const scale = Math.min(maxH / img.height, 180 / img.width, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        ensure(h + 20);
        page.drawImage(img, { x: MARGIN, y: y - h, width: w, height: h });
        y -= h + 4;
      } catch {
        // A missing or corrupt image must not lose the whole document.
        y -= 8;
        text('(signature image unavailable)', { size: 9, c: MUTED });
        y -= 8;
      }
    }

    y -= 6;
    rule();
    y -= 18;
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

/** Upload the composed PDF beside the request's other attachments. */
async function storePdf(token, siteId, bytes, claimRef, month) {
  const driveId = await getDriveId(token, siteId);
  const segments = ['Requisition Attachments', month, claimRef, `${claimRef}-approved.pdf`];
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

module.exports = { buildRequisitionPdf, storePdf, fetchDriveFile };
