const html = document.documentElement;
const themeToggle = document.getElementById('themeToggle');
const STORAGE_KEY = 's3-proto-theme';

function getPreferredTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function setTheme(theme) {
  html.setAttribute('data-bs-theme', theme);
  localStorage.setItem(STORAGE_KEY, theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.content = theme === 'dark' ? '#05070D' : '#DBEAFE';
  }
}

themeToggle.addEventListener('click', () => {
  const current = html.getAttribute('data-bs-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
});

setTheme(getPreferredTheme());
