// A single bounded request helper keeps Hexlace writes retryable on unreliable
// festival networks. Callers retain their local dirty/pending state on errors.
(() => {
  window.fetchHexlaceApi = async (url, options = {}, timeoutMs = 12000, fetchFn = fetch) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const accessHeaders = window.CampAccess?.authorizationHeaders?.() || {};
      const authorizedOptions = accessHeaders.Authorization
        ? { ...options, headers: { ...accessHeaders, ...(options.headers || {}) } }
        : options;
      return await fetchFn(url, { ...authorizedOptions, signal: controller.signal });
    } finally {
      window.clearTimeout(timeout);
    }
  };
})();
