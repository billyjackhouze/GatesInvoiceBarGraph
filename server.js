'use strict';
require('dotenv').config();
/**
 * GEL Invoice Pipeline Board — Express server
 * Port: PIPELINE_PORT (default 3006)
 *
 * Routes:
 *   GET  /               → serve UI (dist/)
 *   GET  /api/pipeline   → active invoices grouped by stage
 *   GET  /api/health     → connection status
 *
 * FM LAYOUT: GatesInvoicesAPI
 *
 * FIELD NOTES (confirmed via /api/debug audit 2026-05-15):
 *   InvoiceType  — calc field; reliably returns 'Delivery' and 'Signed' for active pipeline records.
 *                  'Acknowledged', 'Fulfillment', 'Logistics', 'On Hold' return 0 results in this
 *                  layout — those stages live in a different FM table/layout (to be wired up later).
 *   Type         — stores document type ('Delivery Ticket', 'Signed', 'Quote') — NOT workflow stage.
 *   DateSigned   — M/D/YYYY string; populated when invoice is signed.
 *
 * Signed stage: filtered to TODAY (CT) only — shows what was signed today.
 */

const path    = require('path');
const express = require('express');
const { createGELClient } = require('./lib/fm-client');

const PORT   = process.env.PIPELINE_PORT || 3006;
const LAYOUT = 'GatesInvoicesAPI';

// Stage definitions — order controls board order
const PIPELINE_STAGES = [
  'Preflight',
  'Acknowledged',
  'Fulfillment',
  'Logistics',
  'Delivery',
  'Signed',
];
const ALL_STAGES = [...PIPELINE_STAGES, 'On Hold'];

// Today's date in FM format (M/D/YYYY) using CT timezone
function todayCT() {
  const ct = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  return `${ct.getMonth() + 1}/${ct.getDate()}/${ct.getFullYear()}`;
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// ─────────────────────────────────────────────────────────────
// FM session wrapper
// ─────────────────────────────────────────────────────────────
async function withFM(res, fn) {
  const fm = createGELClient();
  try {
    await fm.login();
    const result = await fn(fm);
    await fm.logout();
    return result;
  } catch (err) {
    await fm.logout().catch(() => {});
    const fmDetail = err.response?.data;
    console.error('[PIPELINE ERROR]', err.message, fmDetail ? JSON.stringify(fmDetail) : '');
    res.status(500).json({ error: err.message, fmDetail: fmDetail ?? null });
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/pipeline
// ─────────────────────────────────────────────────────────────
app.get('/api/pipeline', async (req, res) => {
  const result = await withFM(res, async (fm) => {

    const today = todayCT();

    // OR query — each object is one find criteria (ANDed within, OR between objects)
    // Early stages (Preflight→Logistics) return 0 in this layout today; Delivery + Signed work.
    // Signed: scoped to DateSigned = today so stale signed invoices don't clutter the board.
    const query = [
      { 'InvoiceType': 'Preflight'    },
      { 'InvoiceType': 'Acknowledged' },
      { 'InvoiceType': 'Fulfillment'  },
      { 'InvoiceType': 'Logistics'    },
      { 'InvoiceType': 'Delivery'     },
      { 'InvoiceType': 'On Hold'      },
      { 'InvoiceType': 'Signed', 'DateSigned': today },  // today only
    ];

    const rawRecords = await fm.findRecords(
      LAYOUT,
      query,
      {
        limit: 1000,
        sort:  [{ fieldName: 'InvoiceType', sortOrder: 'ascend' }],
      }
    );

    // Map FM fields → clean shape
    const records = rawRecords.map(r => ({
      recordId:    r.recordId,
      invoiceId:   r.fieldData['_id']          || String(r.recordId),
      company:     r.fieldData['CompanyName']   || '—',
      stage:       r.fieldData['InvoiceType']   || '',
      date:        r.fieldData['Date']          || '',
      dateSigned:  r.fieldData['DateSigned']    || '',
      poNumber:    r.fieldData['PONumber']      || '',
      customerPO:  r.fieldData['CustomerPO']    || '',
    }));

    // Group by stage in pipeline order
    const grouped = ALL_STAGES.map(stage => ({
      stage,
      count:   records.filter(r => r.stage === stage).length,
      records: records.filter(r => r.stage === stage),
    }));

    return {
      stages:  grouped,
      total:   records.length,
      asOf:    new Date().toISOString(),
    };
  });

  if (result !== null) res.json(result);
});

// ─────────────────────────────────────────────────────────────
// GET /api/health
// ─────────────────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  const fm = createGELClient();
  try {
    await fm.login();
    await fm.logout();
    res.json({ connected: true, host: process.env.FM_HOST, database: process.env.FM_SIDEKICK_DB });
  } catch (err) {
    res.json({ connected: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// SPA fallback
// ─────────────────────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  GEL Invoice Pipeline  →  http://localhost:${PORT}\n`);
});
