// Keep the giveaway UI responsive when a request is aborted by the bounded
// API timeout. A timeout is indistinguishable from a weak-signal failure to a
// user, so callers receive a normal failed result and can offer a retry.
(() => {
  window.requestHexlaceGiveaway = async (api, campRole = "") => {
    try {
      const body = { name: "Unclaimed Hexlace", sets: [], claimable: true };
      if (campRole === "member" || campRole === "admin") body.campRole = campRole;
      return await api("/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    } catch {
      return { ok: false, status: 0, body: null, networkError: true };
    }
  };
})();
