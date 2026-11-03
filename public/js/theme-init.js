/**
 * Applies the saved (or system) theme before first paint.
 * A separate file rather than an inline script so a strict Content-Security-Policy
 * can stay in force without allowing inline JavaScript.
 */
(function () {
  try {
    var saved = localStorage.getItem('clf.theme');
    var system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = saved || system;
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
