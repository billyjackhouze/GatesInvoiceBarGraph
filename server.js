'use strict';
require('dotenv').config();
/**
 * GEL Invoice Pipeline Board — Express server
 * Port: PIPELINE_PORT (default 3006)
 *
 * Routes:
 *   GET  /               → serve UI (dist/)
 *   GET  /api/pipeline   → all active invoices grouped by InvoiceType stage
 *   GET  /api/health     → connection status
 *
 * FM LAYOUT: GatesInvoicesAPI
 *
 * STAGES (top → bottom on board):
 *   Preflight → Acknowledged → Fulfillment → Logistics → Delivery → Signed
 *   On Hold (shown separately at bottom)
 *
 * FM FIND: OR query — one criteria per active stage.
 * Query against 'Type' (stored field) — NOT 'InvoiceType' (calc field, unreliable for early stages).
 */

const path    = require('path');
const express = require('express');
const { createGELClient } = require('./lib/fm-client');

const PORT   = process.env.PIPELINE_PORT || 3006;
const LAYOUT = 'GatesInvoicesAPI';

// Stage definitions — order here controls board order (On Hold always last)
const PIPELINE_STAGES = [
  'Preflight',
  'Acknowledged',
  'Fulfillment',
  'Logistics',
  'Delivery',
  'Signed',
];
const ALL_STAGES = [...PIPELINE_STAGES, 'On Hold'];

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

    // OR query — one criteria object per stage
    // Use 'Type' (stored field), NOT 'InvoiceType' (calc — only reliable for late stages)
    const query = ALL_STAGES.map(stage => ({ 'Type': stage }));

    const rawRecords = await fm.findRecords(
      LAYOUT,
      query,
      {
        limit: 1000,
        sort:  [{ fieldName: 'Type', sortOrder: 'ascend' }],
      }
    );

    // Map FM fields → clean shape
    const records = rawRecords.map(r => ({
      recordId:    r.recordId,
      invoiceId:   r.fieldData['_id']          || String(r.recordId),
      company:     r.fieldData['CompanyName']   || '—',
      stage:       r.fieldData['Type']          || '',
      date:        r.fieldData['Date']          || '',
      poNumber:    r.fieldData['PONumber']      || '',
      customerPO:  r.fieldData['CustomerPO']    || '',
    }));

    // Group by stage in defined order
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
// GET /api/debug  — returns raw fieldData of first 10 records (any stage)
// Remove once field names are confirmed.
// ─────────────────────────────────────────────────────────────
app.get('/api/debug', async (req, res) => {
  const result = await withFM(res, async (fm) => {
    // Wildcard find — grab any 10 records from the layout
    const rawRecords = await fm.findRecords(
      LAYOUT,
      [{ '_id': '*' }],
      { limit: 10 }
    );
    return rawRecords.map(r => ({
      recordId:  r.recordId,
      fieldData: r.fieldData,
    }));
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
