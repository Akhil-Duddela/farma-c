#!/usr/bin/env node
/**
 * E2E smoke: health, readiness, AI enhance (auth), optional DB check, optional automation.
 *
 * Environment:
 *   E2E_BASE_URL      — default http://localhost:4000
 *   E2E_JWT           — Bearer token (skips login)
 *   E2E_EMAIL, E2E_PASSWORD — login to get token
 *   E2E_MONGO_CHECK   — if "1", connect to Mongo and count posts (uses MONGODB_URI from .env)
 *   E2E_AUTOMATION    — if "1" and E2E_PLATFORMS, POST /api/automation/run and poll one post
 */
const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const config = require('../src/config');
const Post = require('../src/models/Post');

const base = (process.env.E2E_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');

async function main() {
  const client = axios.create({ baseURL: base, timeout: 180000, validateStatus: () => true });
  const { status: hStatus, data: h } = await client.get('/health');
  if (hStatus !== 200 || !h?.ok) {
    throw new Error(`GET /health failed: ${hStatus} ${JSON.stringify(h)}`);
  }
  const { status: rStatus, data: ready } = await client.get('/health/ready');
  if (rStatus !== 200 || !ready?.ok) {
    throw new Error(`GET /health/ready failed (Mongo not connected?): ${rStatus} ${JSON.stringify(ready)}`);
  }
  // eslint-disable-next-line no-console
  console.log('[e2e] health + ready ok');

  let token = (process.env.E2E_JWT || '').trim();
  if (!token && process.env.E2E_EMAIL && process.env.E2E_PASSWORD) {
    const { status, data } = await client.post('/api/auth/login', {
      email: process.env.E2E_EMAIL,
      password: process.env.E2E_PASSWORD,
    });
    if (status !== 200 || !data?.token) {
      throw new Error(`Login failed: ${status} ${JSON.stringify(data)}`);
    }
    token = data.token;
  }

  if (token) {
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    const { status, data: body } = await client.post(
      '/api/ai/enhance',
      { input: 'monsoon layer poultry tips' },
      auth
    );
    if (status !== 200) {
      throw new Error(`POST /api/ai/enhance failed: ${status} ${JSON.stringify(body)}`);
    }
    if (typeof body?.title !== 'string' || !body.title.length) {
      throw new Error('AI response missing non-empty title');
    }
    // eslint-disable-next-line no-console
    console.log('[e2e] /api/ai/enhance ok, title len=', body.title.length, 'degraded=', !!body?._meta?.degraded);
  } else {
    // eslint-disable-next-line no-console
    console.log('[e2e] skip auth: set E2E_JWT or E2E_EMAIL + E2E_PASSWORD for AI test');
  }

  if (process.env.E2E_MONGO_CHECK === '1' && process.env.MONGODB_URI) {
    await mongoose.connect(config.mongoUri, { maxPoolSize: 2, serverSelectionTimeoutMS: 8000 });
    const n = await Post.countDocuments();
    // eslint-disable-next-line no-console
    console.log('[e2e] Post count in DB:', n);
    await mongoose.disconnect();
  }

  if (process.env.E2E_AUTOMATION === '1' && token) {
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    const platforms = (process.env.E2E_PLATFORMS || 'ig').toLowerCase().includes('ig')
      ? { instagram: true, youtube: false }
      : { instagram: true, youtube: true };
    const { status, data: run } = await client.post(
      '/api/automation/run',
      { input: 'E2E automation smoke idea', platforms },
      auth
    );
    if (status !== 200 && status !== 201) {
      throw new Error(`automation run failed: ${status} ${JSON.stringify(run)}`);
    }
    const id = run?.postId;
    if (!id) {
      // eslint-disable-next-line no-console
      console.log('[e2e] automation response:', run);
    } else {
      for (let i = 0; i < 15; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 2000));
        // eslint-disable-next-line no-await-in-loop
        const s = await client.get(`/api/posts/${id}`, auth);
        if (s.status === 200 && s.data) {
          const p = s.data;
          if (p.pipelineStatus && ['failed', 'published', 'partial', 'completed', 'publishing', 'ai_done', 'uploaded', 'video_done'].includes(p.pipelineStatus)) {
            // eslint-disable-next-line no-console
            console.log('[e2e] post pipeline snapshot:', p.pipelineStatus, p.automation?.step);
            break;
          }
        }
      }
    }
  }
  // eslint-disable-next-line no-console
  console.log('[e2e] done');
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
