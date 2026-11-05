export const GUARD_POPSTATE_HANDLER = '__mimirGuardPopState';

/**
 * Runs from an inline script in `<head>`, so this listener is registered before
 * Next's. It must run first: Next's handler can unmount the page, and with it
 * any listener the page's guard added later, in the middle of the same event.
 */
export const GUARD_INIT_SCRIPT = `window.addEventListener('popstate', function (event) {
  var handler = window[${JSON.stringify(GUARD_POPSTATE_HANDLER)}];
  if (handler) handler(event);
}, true);`;
