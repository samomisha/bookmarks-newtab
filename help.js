(() => {
  let t = 'system'; try { t = localStorage.theme || 'system'; } catch {}
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.addEventListener('DOMContentLoaded', () => {
    const a = document.querySelector(`article[data-lang="${window.LANG || 'en'}"]`) || document.querySelector('article[data-lang="en"]');
    a.hidden = false;
    if (window.LANG === 'uk') document.title = 'Інструкція — Work-Love-Balance';
  });
})();
