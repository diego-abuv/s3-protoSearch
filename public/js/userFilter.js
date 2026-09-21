// userFilter.js — helpers para o filtro de usuario da auditoria
(function (global) {
  const escapeAttr = (value) =>
    String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function items(usernames) {
    return (usernames || [])
      .map(
        (name) =>
          `<button type="button" class="audit-user-combo-item" role="option" data-value="${escapeAttr(name)}">${escapeAttr(name)}</button>`,
      )
      .join('\n');
  }

  function matches(usernames, query = '') {
    const q = String(query).toLowerCase().trim();
    return (usernames || []).filter((name) => !q || name.toLowerCase().includes(q));
  }

  global.AuditUserFilter = { items, matches };
})(typeof window !== 'undefined' ? window : globalThis);