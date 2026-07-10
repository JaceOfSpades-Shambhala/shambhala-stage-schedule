// Preview mode is intentionally limited to the festival window. Malformed
// query strings must fall back to the real Salmo, BC clock instead of creating
// impossible "now playing" timestamps.
(() => {
  const PREVIEW_PATTERN = /^(2026-07-(?:2[3-7]))T([01]\d|2[0-3]):([0-5]\d)$/;

  window.parseSchedulePreview = value => {
    const match = typeof value === "string" ? value.match(PREVIEW_PATTERN) : null;
    if (!match) return null;
    return { date: match[1], minutes: Number(match[2]) * 60 + Number(match[3]) };
  };
})();
