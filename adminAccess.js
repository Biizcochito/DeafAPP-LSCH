// Five consecutive presses open the login; they never authenticate the user.
export function createHiddenAdminEntry(windowMs = 3500) {
  let count = 0, firstAt = null, previousAt = null;
  return {
    press(now) {
      if (!Number.isFinite(now)) return false;
      if (firstAt == null || now < previousAt || now - firstAt > windowMs) { count = 0; firstAt = now; }
      previousAt = now;
      count++;
      if (count < 5) return false;
      count = 0; firstAt = null; previousAt = null;
      return true;
    },
    reset() { count = 0; firstAt = null; previousAt = null; },
  };
}
