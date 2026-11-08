(() => {
  let saved;
  try { saved = localStorage.getItem('theme'); } catch {}
  let explicit = saved === 'light' || saved === 'dark';
  const apply = (theme) => {
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll('.site-theme').forEach(button => {
      button.textContent = theme === 'dark' ? 'Light' : 'Dark';
      button.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
    });
  };
  apply(explicit ? saved : 'dark');
  document.addEventListener('DOMContentLoaded', () => {
    apply(document.documentElement.dataset.theme);
    document.querySelectorAll('.site-theme').forEach(button => button.addEventListener('click', () => {
      explicit = true;
      const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('theme', theme); } catch {}
      apply(theme);
    }));
  });
})();
