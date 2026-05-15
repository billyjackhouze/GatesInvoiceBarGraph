'use strict';
/**
 * FileMaker Data API v2 client — standalone copy for GEL Invoice Pipeline (invtl).
 */

const https = require('https');
const axios = require('axios');

class FMClient {
  constructor({ host, database, username, password, verifySSL = true }) {
    this.base      = `https://${host}/fmi/data/v2/databases/${encodeURIComponent(database)}`;
    this.auth      = Buffer.from(`${username}:${password}`).toString('base64');
    this.verifySSL = verifySSL;
    this._token    = null;
  }

  _agent() {
    return this.verifySSL ? undefined : new https.Agent({ rejectUnauthorized: false });
  }

  async login() {
    const res = await axios.post(
      `${this.base}/sessions`,
      {},
      {
        headers: { 'Authorization': `Basic ${this.auth}`, 'Content-Type': 'application/json' },
        httpsAgent: this._agent(),
        timeout: 15000,
      }
    );
    this._token = res.data?.response?.token;
    if (!this._token) throw new Error('FileMaker login failed — no token returned');
    return this._token;
  }

  async logout() {
    if (!this._token) return;
    try {
      await axios.delete(`${this.base}/sessions/${this._token}`, {
        headers: { 'Content-Type': 'application/json' },
        httpsAgent: this._agent(),
        timeout: 10000,
      });
    } catch (_) { /* best-effort */ }
    this._token = null;
  }

  _headers() {
    if (!this._token) throw new Error('Not authenticated — call login() first');
    return { 'Authorization': `Bearer ${this._token}`, 'Content-Type': 'application/json' };
  }

  /**
   * Find records. query can be a single object or an array (OR logic).
   * Returns [] when FM error 401 (no records found).
   */
  async findRecords(layout, query, { limit = 500, offset = 1, sort } = {}) {
    const body = {
      query: Array.isArray(query) ? query : [query],
      limit,
      offset,
    };
    if (sort) body.sort = sort;

    const res = await axios.post(
      `${this.base}/layouts/${encodeURIComponent(layout)}/_find`,
      body,
      { headers: this._headers(), httpsAgent: this._agent(), timeout: 20000 }
    );
    const code = res.data?.messages?.[0]?.code;
    if (code === '401') return [];
    this._assertOK(res.data, 'findRecords');
    return res.data.response.data || [];
  }

  _assertOK(data, op) {
    const code = data?.messages?.[0]?.code;
    if (code !== '0') {
      const msg = data?.messages?.[0]?.message || 'Unknown FM error';
      throw new Error(`FM ${op} failed (code ${code}): ${msg}`);
    }
  }
}

function createGELClient(database = process.env.FM_SIDEKICK_DB) {
  return new FMClient({
    host:      process.env.FM_HOST,
    database:  database || 'GELSidekick.fmp12',
    username:  process.env.FM_USERNAME,
    password:  process.env.FM_PASSWORD,
    verifySSL: process.env.FM_SSL_VERIFY !== 'false',
  });
}

module.exports = { FMClient, createGELClient };
