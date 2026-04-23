const express = require('express');
const { getRegister, setHealthOk, isEnabled } = require('../observability/metrics');
const { computeHealthSnapshot } = require('../controllers/healthController');

const router = express.Router();

/** Optional: METRICS_BEARER=secret — require Authorization: Bearer ... */
function auth(req, res, next) {
  const want = (process.env.METRICS_BEARER || '').trim();
  if (!want) {
    return next();
  }
  const h = req.get('authorization') || '';
  const ok = h === `Bearer ${want}`;
  if (!ok) {
    return res.status(401).send('Unauthorized');
  }
  return next();
}

router.get('/', auth, async (req, res) => {
  try {
    if (!isEnabled()) {
      return res.status(503).type('text/plain').send('metrics disabled (METRICS_ENABLED=0 or init failed)');
    }
    const snap = await computeHealthSnapshot();
    setHealthOk(!!snap.allOk);
    const reg = getRegister();
    res.set('Content-Type', reg.contentType);
    res.end(await reg.metrics());
  } catch (e) {
    res.status(500).send('metrics unavailable');
  }
});

module.exports = router;
