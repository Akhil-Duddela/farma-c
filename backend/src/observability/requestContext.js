const { AsyncLocalStorage } = require('node:async_hooks');

const storage = new AsyncLocalStorage();

/**
 * @param {{ requestId: string, method?: string, path?: string }} ctx
 * @param {() => void} fn
 */
function runWithRequestContext(ctx, fn) {
  return storage.run({ ...ctx }, fn);
}

function getRequestContext() {
  return storage.getStore();
}

module.exports = { runWithRequestContext, getRequestContext, storage };
