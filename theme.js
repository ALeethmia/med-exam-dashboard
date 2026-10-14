// Applied before paint. Local development never initializes the production database.
window.workspaceLocalOnly = !window.i3FixtureOnly && (['localhost', '127.0.0.1', '::1'].includes(location.hostname) ||
  new URLSearchParams(location.search).get('mode') === 'local');
(() => {
  const media = matchMedia('(prefers-color-scheme: dark)');
  let choice = 'system';
  try { choice = localStorage.getItem('med_exam_theme') || 'system'; } catch {}
  if (!['light', 'dark', 'system'].includes(choice)) choice = 'system';
  function apply() {
    document.documentElement.dataset.theme = choice === 'system' ? (media.matches ? 'dark' : 'light') : choice;
    document.documentElement.style.colorScheme = document.documentElement.dataset.theme;
    window.dispatchEvent(new Event('appearance-change'));
  }
  window.setAppearance = value => {
    choice = ['light', 'dark', 'system'].includes(value) ? value : 'system';
    try { localStorage.setItem('med_exam_theme', choice); } catch {}
    apply();
  };
  window.getAppearance = () => choice;
  media.addEventListener('change', apply);
  apply();
})();
