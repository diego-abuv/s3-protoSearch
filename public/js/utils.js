function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDuration(seconds) {
  const secs = parseFloat(seconds);
  if (isNaN(secs) || secs < 60) return `${seconds}s`;
  const min = Math.floor(secs / 60);
  const rest = Math.round(secs % 60);
  return `${min} min ${rest}s`;
}
