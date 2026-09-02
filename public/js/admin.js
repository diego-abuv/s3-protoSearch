// admin.js — Painel de administracao

const API = {
  async get(url) {
    const res = await Auth.authFetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  async post(url, body) {
    const res = await Auth.authFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },
  async patch(url, body) {
    const res = await Auth.authFetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },
  async del(url) {
    const res = await Auth.authFetch(url, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },
  async getRaw(url) {
    const res = await Auth.authFetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  },
};

let currentView = 'dashboard';
let usersPage = 1;
let auditPage = 1;
const PAGE_SIZE = 20;
let searchChartInstance = null;

// ── Toast ──────────────────────────────────────────────
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  const id = 'toast-' + Date.now();
  container.insertAdjacentHTML(
    'beforeend',
    `<div id="${id}" class="toast align-items-center text-bg-${type === 'success' ? 'success' : type === 'error' ? 'danger' : 'info'} border-0" role="alert">
      <div class="d-flex">
        <div class="toast-body">${escapeHtml(message)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>`,
  );
  const el = document.getElementById(id);
  const toast = new bootstrap.Toast(el, { delay: duration });
  toast.show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}

// ── Download animation ────────────────────────────────
function animateDownload(buttonEl) {
  const rect = buttonEl.getBoundingClientRect();
  const arrow = document.createElement('div');
  arrow.className = 'download-arrow';
  arrow.innerHTML = '&#8593;';
  arrow.style.left = `${rect.left + rect.width / 2 - 12}px`;
  arrow.style.top = `${rect.top}px`;
  document.body.appendChild(arrow);
  setTimeout(() => arrow.remove(), 900);
}

// ── Formatadores ──────────────────────────────────────
function formatToSP(utcDate) {
  if (!utcDate) return '-';
  const d = new Date(utcDate + 'Z');
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function timeSince(dateStr) {
  if (!dateStr) return '-';
  const now = new Date();
  const then = new Date(dateStr + 'Z');
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `ha ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `ha ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `ha ${days}d`;
}

const ACTION_BADGES = {
  search: 'badge-outline-info',
  login: 'badge-outline-success',
  logout: 'badge-outline-warning',
  admin_create_user: 'badge-outline-danger',
  admin_update_user: 'badge-outline-primary',
  admin_delete_user: 'badge-outline-danger',
  admin_block_user: 'badge-outline-danger',
  admin_unblock_user: 'badge-outline-success',
  admin_force_logout: 'badge-outline-warning',
  admin_reset_password: 'badge-outline-primary',
};

function badgeForAction(action) {
  return ACTION_BADGES[action] || 'badge-outline-secondary';
}

function resultBadge(details) {
  if (!details) return '<span class="text-secondary">-</span>';
  if (details.includes('cancelado=1')) return '<span class="badge badge-outline-secondary">Cancelado</span>';
  const m = details.match(/encontrados=(\d+)/);
  if (m && parseInt(m[1], 10) > 0) return '<span class="badge badge-outline-success">Encontrado</span>';
  if (details.includes('interrompida=true')) return '<span class="badge badge-outline-danger">Erro</span>';
  if (m && parseInt(m[1], 10) === 0) return '<span class="badge badge-outline-warning">Nao encontrado</span>';
  if (details.startsWith('erro=')) return '<span class="badge badge-outline-danger">Erro</span>';
  return '<span class="text-secondary">-</span>';
}

const ACTION_LABELS = {
  search: 'Busca de arquivo',
  login: 'Login',
  logout: 'Logout',
  admin_create_user: 'Criar usuario',
  admin_update_user: 'Atualizar usuario',
  admin_delete_user: 'Excluir usuario',
  admin_block_user: 'Bloquear usuario',
  admin_unblock_user: 'Desbloquear usuario',
  admin_force_logout: 'Forcar logout',
  admin_reset_password: 'Reset senha',
};

function labelForAction(action) {
  return ACTION_LABELS[action] || action;
}

// ── View switching ────────────────────────────────────
function switchView(view) {
  currentView = view;
  ['dashboard', 'users', 'audit'].forEach((v) => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle('d-none', v !== view);
  });

  if (view === 'dashboard') {
    loadDashboard();
  } else if (view === 'users') {
    loadUsersFull(1);
  } else if (view === 'audit') {
    loadAuditFull(1);
  }
}

// ── Dashboard ─────────────────────────────────────────
async function loadStats() {
  try {
    const data = await API.get('/admin/stats');
    document.getElementById('statActiveUsers').textContent = data.active_users;
    document.getElementById('statSearches').textContent = data.searches_today;
    document.getElementById('statSuccessRate').textContent =
      data.success_rate !== undefined ? `${data.success_rate}%` : '-';
    document.getElementById('statAvgDuration').textContent =
      data.avg_duration_s ? `${data.avg_duration_s.toFixed(1)}s` : '-';
  } catch (_e) {
    ['statActiveUsers', 'statSearches', 'statSuccessRate', 'statAvgDuration'].forEach((id) => {
      document.getElementById(id).textContent = 'Erro';
    });
  }
}

async function loadChart() {
  try {
    const data = await API.get('/admin/stats/chart');
    const labels = data.data.map((d) => d.day.slice(5));
    const okValues = data.data.map((d) => d.ok || 0);
    const errValues = data.data.map((d) => d.errors || 0);

    const ctx = document.getElementById('searchChart').getContext('2d');
    if (searchChartInstance) searchChartInstance.destroy();
    searchChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Sucesso',
            data: okValues,
            borderColor: 'rgba(0, 217, 255, 0.9)',
            backgroundColor: 'rgba(0, 217, 255, 0.15)',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: 'rgba(0, 217, 255, 0.9)',
          },
          {
            label: 'Erros',
            data: errValues,
            borderColor: 'rgba(239, 68, 68, 0.9)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: 'rgba(239, 68, 68, 0.9)',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#888', font: { size: 11 }, boxWidth: 12, padding: 12 },
          },
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888', font: { size: 11 } } },
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888', precision: 0 } },
        },
      },
    });
  } catch (_e) {
    document.getElementById('searchChart').parentElement.innerHTML =
      '<div class="text-center text-secondary py-4">Erro ao carregar grafico</div>';
  }
}

// ── User row helpers ──────────────────────────────────
function userRowHtml(u) {
  return `
    <tr>
      <td>${u.id}</td>
      <td>${escapeHtml(u.username)}</td>
      <td><span class="badge ${u.role === 'admin' ? 'badge-outline-danger' : 'badge-outline-secondary'}">${escapeHtml(u.role)}</span></td>
      <td>
        ${u.is_online ? '<span class="badge badge-online">Online</span>' : '<span class="text-secondary small">Offline</span>'}
        ${u.blocked ? ' <span class="badge badge-blocked">Bloqueado</span>' : ''}
      </td>
      <td class="text-nowrap">${escapeHtml(timeSince(u.last_login))}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-sm btn-outline-info me-1 btn-edit" data-id="${u.id}" data-username="${escapeHtml(u.username)}" data-role="${u.role}" title="Editar">&#9998;</button>
        <button class="btn btn-sm btn-outline-secondary me-1 btn-force-logout" data-id="${u.id}" data-username="${escapeHtml(u.username)}" title="Forcar logout">&#128682;</button>
        <button class="btn btn-sm ${u.blocked ? 'btn-outline-success' : 'btn-outline-danger'} me-1 btn-toggle-block" data-id="${u.id}" data-username="${escapeHtml(u.username)}" data-blocked="${u.blocked ? 1 : 0}" title="${u.blocked ? 'Desbloquear' : 'Bloquear'}">${u.blocked ? '&#128275;' : '&#128274;'}</button>
        <button class="btn btn-sm btn-outline-danger btn-delete" data-id="${u.id}" data-username="${escapeHtml(u.username)}">&#128465;</button>
      </td>
    </tr>`;
}

function userRowCompactHtml(u) {
  return `
    <tr>
      <td>${escapeHtml(u.username)}</td>
      <td><span class="badge ${u.role === 'admin' ? 'badge-outline-danger' : 'badge-outline-secondary'}">${escapeHtml(u.role)}</span></td>
      <td>
        ${u.is_online ? '<span class="badge badge-online">Online</span>' : '<span class="text-secondary small">Offline</span>'}
        ${u.blocked ? ' <span class="badge badge-blocked">Bloqueado</span>' : ''}
      </td>
      <td class="text-end text-nowrap">
        <button class="btn btn-sm btn-outline-info me-1 btn-edit" data-id="${u.id}" data-username="${escapeHtml(u.username)}" data-role="${u.role}" title="Editar">&#9998;</button>
        <button class="btn btn-sm ${u.blocked ? 'btn-outline-success' : 'btn-outline-danger'} me-1 btn-toggle-block" data-id="${u.id}" data-username="${escapeHtml(u.username)}" data-blocked="${u.blocked ? 1 : 0}" title="${u.blocked ? 'Desbloquear' : 'Bloquear'}">${u.blocked ? '&#128275;' : '&#128274;'}</button>
      </td>
    </tr>`;
}

function auditRowHtml(l) {
  return `
    <tr>
      <td class="text-nowrap">${escapeHtml(formatToSP(l.created_at))}</td>
      <td>${escapeHtml(l.username)}</td>
      <td><span class="badge ${badgeForAction(l.action)}">${escapeHtml(labelForAction(l.action))}</span></td>
      <td>${resultBadge(l.details)}</td>
      <td><button class="btn btn-sm audit-info-btn" data-log='${escapeHtml(JSON.stringify(l))}' title="Ver detalhes"><i class="info-i">i</i></button></td>
    </tr>`;
}

function auditRowCompactHtml(l) {
  return `
    <tr>
      <td class="text-nowrap">${escapeHtml(formatToSP(l.created_at))}</td>
      <td>${escapeHtml(l.username)}</td>
      <td><span class="badge ${badgeForAction(l.action)}">${escapeHtml(labelForAction(l.action))}</span></td>
      <td>${resultBadge(l.details)}</td>
    </tr>`;
}

// ── Preview tables (dashboard) ────────────────────────
async function loadUsersPreview() {
  const tbody = document.getElementById('usersPreviewBody');
  try {
    const data = await API.get('/admin/users?limit=4&page=1');
    if (!data.users.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-secondary py-2">Nenhum usuario</td></tr>';
      return;
    }
    tbody.innerHTML = data.users.map(userRowCompactHtml).join('');

    const userSelect = document.getElementById('auditFilterUser');
    if (userSelect) {
      const currentVal = userSelect.value;
      userSelect.innerHTML = '<option value="">Todos</option>';
      data.users.forEach((u) => {
        userSelect.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(u.username)}">${escapeHtml(u.username)}</option>`);
      });
      userSelect.value = currentVal;
    }
  } catch (_e) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger py-2">Erro ao carregar</td></tr>';
  }
}

async function loadAuditPreview() {
  const tbody = document.getElementById('auditPreviewBody');
  try {
    const data = await API.get('/admin/audit?limit=5&offset=0');
    if (!data.logs.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-secondary py-2">Nenhum log</td></tr>';
      return;
    }
    tbody.innerHTML = data.logs.map(auditRowCompactHtml).join('');
  } catch (_e) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger py-2">Erro ao carregar</td></tr>';
  }
}

async function loadDashboard() {
  await Promise.all([loadStats(), loadChart(), loadUsersPreview(), loadAuditPreview()]);
}

// ── Full users table (expanded view) ──────────────────
async function loadUsersFull(page) {
  usersPage = page;
  const tbody = document.getElementById('usersTableBody');
  try {
    const data = await API.get(`/admin/users?limit=${PAGE_SIZE}&page=${page}`);
    if (!data.users.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-secondary py-3">Nenhum usuario</td></tr>';
      renderPagination('usersPagination', data.total, page, loadUsersFull);
      return;
    }

    const userSelect = document.getElementById('auditFilterUser');
    if (userSelect) {
      const currentVal = userSelect.value;
      userSelect.innerHTML = '<option value="">Todos</option>';
      data.users.forEach((u) => {
        userSelect.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(u.username)}">${escapeHtml(u.username)}</option>`);
      });
      userSelect.value = currentVal;
    }

    tbody.innerHTML = data.users.map(userRowHtml).join('');
    renderPagination('usersPagination', data.total, page, loadUsersFull);
  } catch (_e) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-3">Erro ao carregar</td></tr>';
  }
}

// ── Full audit table (expanded view) ──────────────────
async function loadAuditFull(page) {
  auditPage = page;
  const tbody = document.getElementById('auditTableBody');
  try {
    const offset = (page - 1) * PAGE_SIZE;
    const params = new URLSearchParams();
    params.set('limit', PAGE_SIZE);
    params.set('offset', offset);

    const filters = getAuditFilters();
    if (filters.user) params.set('user', filters.user);
    if (filters.action) params.set('action', filters.action);
    if (filters.resultado) params.set('resultado', filters.resultado);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);

    const data = await API.get(`/admin/audit?${params.toString()}`);
    if (!data.logs.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-secondary py-3">Nenhum log</td></tr>';
      renderPagination('auditPagination', data.total, page, loadAuditFull);
      return;
    }
    tbody.innerHTML = data.logs.map(auditRowHtml).join('');
    renderPagination('auditPagination', data.total, page, loadAuditFull);
  } catch (_e) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger py-3">Erro ao carregar</td></tr>';
  }
}

// ── Pagination renderer ───────────────────────────────
function renderPagination(containerId, total, currentPage, loadFn) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';
  html += `<button class="btn btn-sm btn-outline-secondary" ${currentPage <= 1 ? 'disabled' : ''} data-page="${currentPage - 1}">&laquo;</button>`;

  const maxVisible = 5;
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

  if (start > 1) {
    html += `<button class="btn btn-sm btn-outline-secondary" data-page="1">1</button>`;
    if (start > 2) html += `<span class="btn btn-sm btn-outline-secondary disabled">...</span>`;
  }

  for (let i = start; i <= end; i++) {
    html += `<button class="btn btn-sm ${i === currentPage ? 'btn-gradient' : 'btn-outline-secondary'}" data-page="${i}">${i}</button>`;
  }

  if (end < totalPages) {
    if (end < totalPages - 1) html += `<span class="btn btn-sm btn-outline-secondary disabled">...</span>`;
    html += `<button class="btn btn-sm btn-outline-secondary" data-page="${totalPages}">${totalPages}</button>`;
  }

  html += `<button class="btn btn-sm btn-outline-secondary" ${currentPage >= totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">&raquo;</button>`;

  container.innerHTML = html;
  container.querySelectorAll('button[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page);
      if (p && p !== currentPage) loadFn(p);
    });
  });
}

// ── Audit filters ─────────────────────────────────────
function getAuditFilters() {
  return {
    user: document.getElementById('auditFilterUser')?.value || '',
    action: document.getElementById('auditFilterAction')?.value || '',
    resultado: document.getElementById('auditFilterResult')?.value || '',
    from: document.getElementById('auditFilterFrom')?.value || '',
    to: document.getElementById('auditFilterTo')?.value || '',
  };
}

// ── Novo usuario ──────────────────────────────────────
document.getElementById('btnNovoUsuario').addEventListener('click', () => {
  document.getElementById('formNovoUsuario').classList.toggle('d-none');
  document.getElementById('novoUserError').classList.add('d-none');
});

document.getElementById('btnCancelarNovo').addEventListener('click', () => {
  document.getElementById('formNovoUsuario').classList.add('d-none');
  document.getElementById('newUsername').value = '';
  document.getElementById('newPassword').value = '';
  document.getElementById('novoUserError').classList.add('d-none');
});

document.getElementById('btnSalvarNovo').addEventListener('click', async () => {
  const errEl = document.getElementById('novoUserError');
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value;
  const role = document.getElementById('newRole').value;

  const usernameRegex = /^[a-zA-Z0-9._-]{3,50}$/;

  if (!usernameRegex.test(username)) {
    errEl.textContent = 'Usuario invalido (3-50 caracteres, apenas letras, numeros, . _ -)';
    errEl.classList.remove('d-none');
    return;
  }

  if (!username || !password) {
    errEl.textContent = 'Username e senha sao obrigatorios';
    errEl.classList.remove('d-none');
    return;
  }

  try {
    await API.post('/admin/users', { username, password, role });
    document.getElementById('formNovoUsuario').classList.add('d-none');
    document.getElementById('newUsername').value = '';
    document.getElementById('newPassword').value = '';
    errEl.classList.add('d-none');
    showToast('Usuario criado com sucesso', 'success');
    if (currentView === 'users') loadUsersFull(usersPage);
    loadDashboard();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('d-none');
  }
});

// ── Editar usuario ────────────────────────────────────
document.getElementById('usersTableBody').addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-edit');
  if (btn) {
    document.getElementById('editUserId').value = btn.dataset.id;
    document.getElementById('editUsername').value = btn.dataset.username;
    document.getElementById('editRole').value = btn.dataset.role;
    document.getElementById('editPassword').value = '';
    document.getElementById('editUserError').classList.add('d-none');
    new bootstrap.Modal(document.getElementById('modalEditar')).show();
  }
});

document.getElementById('btnSalvarEdicao').addEventListener('click', async () => {
  const id = document.getElementById('editUserId').value;
  const username = document.getElementById('editUsername').value.trim();
  const password = document.getElementById('editPassword').value.trim();
  const role = document.getElementById('editRole').value;
  const errEl = document.getElementById('editUserError');
  const payload = { username, role };

  if (password) {
    payload.password = password;
  }

  const usernameRegex = /^[a-zA-Z0-9._-]{3,50}$/;

  if (!usernameRegex.test(username)) {
    errEl.textContent = 'Usuario invalido (3-50 caracteres, apenas letras, numeros, . _ -)';
    errEl.classList.remove('d-none');
    return;
  }

  if (!username) {
    errEl.textContent = 'Username nao pode ser vazio';
    errEl.classList.remove('d-none');
    return;
  }

  try {
    await API.patch(`/admin/users/${id}`, payload);
    bootstrap.Modal.getInstance(document.getElementById('modalEditar')).hide();
    showToast('Usuario atualizado', 'success');
    if (currentView === 'users') loadUsersFull(usersPage);
    loadDashboard();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('d-none');
  }
});

// ── Forcar logout ─────────────────────────────────────
document.getElementById('usersTableBody').addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-force-logout');
  if (btn) {
    document.getElementById('forceLogoutUserId').value = btn.dataset.id;
    document.getElementById('forceLogoutUserName').textContent = btn.dataset.username;
    document.getElementById('forceLogoutError').classList.add('d-none');
    new bootstrap.Modal(document.getElementById('modalForceLogout')).show();
  }
});

document.getElementById('btnConfirmarForceLogout').addEventListener('click', async () => {
  const id = document.getElementById('forceLogoutUserId').value;
  const errEl = document.getElementById('forceLogoutError');

  try {
    await API.post(`/admin/users/${id}/force-logout`);
    bootstrap.Modal.getInstance(document.getElementById('modalForceLogout')).hide();
    showToast('Sessoes revogadas', 'success');
    if (currentView === 'users') loadUsersFull(usersPage);
    loadDashboard();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('d-none');
  }
});

// ── Bloquear / Desbloquear ────────────────────────────
document.getElementById('usersTableBody').addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-toggle-block');
  if (!btn) return;

  const id = btn.dataset.id;
  const username = btn.dataset.username;
  const isBlocked = btn.dataset.blocked === '1';
  const action = isBlocked ? 'desbloquear' : 'bloquear';

  if (!confirm(`Deseja ${action} o usuario "${username}"?`)) return;

  try {
    await API.patch(`/admin/users/${id}/block`);
    showToast(`Usuario ${action}do`, 'success');
    if (currentView === 'users') loadUsersFull(usersPage);
    loadDashboard();
  } catch (err) {
    showToast(`Erro: ${err.message}`, 'error');
  }
});

// ── Excluir usuario ───────────────────────────────────
document.getElementById('usersTableBody').addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-delete');
  if (btn) {
    document.getElementById('deleteUserId').value = btn.dataset.id;
    document.getElementById('deleteUserName').textContent = btn.dataset.username;
    document.getElementById('deleteUserError').classList.add('d-none');
    new bootstrap.Modal(document.getElementById('modalExcluir')).show();
  }
});

document.getElementById('btnConfirmarExclusao').addEventListener('click', async () => {
  const id = document.getElementById('deleteUserId').value;
  const errEl = document.getElementById('deleteUserError');

  try {
    await API.del(`/admin/users/${id}`);
    bootstrap.Modal.getInstance(document.getElementById('modalExcluir')).hide();
    showToast('Usuario excluido', 'success');
    if (currentView === 'users') loadUsersFull(usersPage);
    loadDashboard();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('d-none');
  }
});

// ── Export CSV ────────────────────────────────────────
document.getElementById('btnExportCSV').addEventListener('click', async (e) => {
  try {
    const filters = getAuditFilters();
    const params = new URLSearchParams();
    if (filters.user) params.set('user', filters.user);
    if (filters.action) params.set('action', filters.action);
    if (filters.resultado) params.set('resultado', filters.resultado);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);

    animateDownload(e.currentTarget);
    showToast('Download sendo realizado...', 'info', 2000);

    const res = await API.getRaw(`/admin/audit/export?${params.toString()}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit_log.csv';
    a.click();
    URL.revokeObjectURL(url);

    showToast('Download concluido', 'success');
  } catch (err) {
    showToast(`Erro ao exportar: ${err.message}`, 'error');
  }
});

// ── Detalhes auditoria ────────────────────────────────
document.getElementById('auditTableBody').addEventListener('click', (e) => {
  const btn = e.target.closest('.audit-info-btn');
  if (!btn) return;

  let log;
  try {
    log = JSON.parse(btn.dataset.log);
  } catch { return; }

  const isSearch = log.action === 'search';
  const isGeneric = [
    'admin_create_user',
    'admin_update_user',
    'admin_delete_user',
    'admin_block_user',
    'admin_unblock_user',
    'admin_force_logout',
    'admin_reset_password',
  ].includes(log.action);
  document.getElementById('ad-title').textContent = isSearch ? 'Detalhes da Consulta' : 'Detalhes da Acao';
  document.getElementById('ad-data').textContent = formatToSP(log.created_at);
  document.getElementById('ad-usuario').textContent = log.username;
  document.getElementById('ad-acao').textContent = labelForAction(log.action);
  document.getElementById('ad-ip').textContent = log.ip || '-';

  const searchEl = document.getElementById('ad-search-fields');
  const genericEl = document.getElementById('ad-generic-fields');
  const hrEl = document.getElementById('ad-search-hr');
  searchEl.classList.toggle('d-none', !isSearch);
  genericEl.classList.toggle('d-none', !isGeneric);
  hrEl.classList.toggle('d-none', !isSearch && !isGeneric);

  if (isSearch) {
    const details = log.details || '';
    const target = log.target || '';

    const parseField = (key) => {
      const m = details.match(new RegExp(`${key}=([^,]+)`));
      return m ? m[1].trim() : null;
    };

    let encontrados = parseField('encontrados');
    if (encontrados === null) encontrados = parseField('arquivos_encontrados');
    const tempo = parseField('tempo');
    const s3 = parseField('s3');
    const local = parseField('local');
    const erro = details.startsWith('erro=') ? details.replace(/^erro=/, '') : null;

    const sepIdx = target.lastIndexOf('/');
    const termo = sepIdx !== -1 ? target.slice(0, sepIdx) : target;
    const protocolo = sepIdx !== -1 ? target.slice(sepIdx + 1) : '';

    document.getElementById('ad-termo').textContent = termo || '-';
    document.getElementById('ad-protocolo').textContent = protocolo || '-';
    document.getElementById('ad-duracao').textContent = tempo ? formatDuration(tempo) : '-';
    document.getElementById('ad-encontrados').textContent =
      encontrados !== null ? encontrados : erro ? `Erro: ${erro}` : '-';

    const sv = document.getElementById('ad-servidores');
    if (s3 || local) {
      const statusClass = (v) => {
        if (!v || v === 'nao_consultado' || v === 'cancelado') return 'skip';
        if (v === 'ok') return 'ok';
        if (v === 'nao_encontrado') return 'miss';
        return 'err';
      };
      sv.innerHTML = `
        <div class="d-flex align-items-center gap-2 mb-1">
          <span class="step-dot ${statusClass(s3)}"></span>
          <span><strong>S3:</strong> ${escapeHtml(s3 || 'nao consultado')}</span>
        </div>
        <div class="d-flex align-items-center gap-2">
          <span class="step-dot ${statusClass(local)}"></span>
          <span><strong>Local:</strong> ${escapeHtml(local || 'nao consultado')}</span>
        </div>
      `;
    } else {
      sv.innerHTML = '<span class="text-secondary">-</span>';
    }
  } else {
    document.getElementById('ad-alvo').textContent = log.target || '-';
    document.getElementById('ad-detalhes').textContent = log.details || '-';
  }

  new bootstrap.Modal(document.getElementById('modalAuditDetail')).show();
});

// ── View navigation buttons ───────────────────────────
document.getElementById('btnVerUsuarios')?.addEventListener('click', () => switchView('users'));
document.getElementById('btnVerAuditoria')?.addEventListener('click', () => switchView('audit'));
document.getElementById('btnVoltarUsers')?.addEventListener('click', () => switchView('dashboard'));
document.getElementById('btnVoltarAudit')?.addEventListener('click', () => switchView('dashboard'));

document.getElementById('btnFiltrarAudit')?.addEventListener('click', () => {
  if (currentView === 'audit') loadAuditFull(1);
});

document.getElementById('auditFilterAction')?.addEventListener('change', (e) => {
  const wrap = document.getElementById('auditFilterResultWrap');
  const select = document.getElementById('auditFilterResult');
  if (e.target.value === 'search') {
    wrap.classList.remove('d-none');
  } else {
    wrap.classList.add('d-none');
    select.value = '';
  }
});

// ── Init ──────────────────────────────────────────────
document.addEventListener('session-ready', async (event) => {
  const user = event.detail;
  if (user.role !== 'admin') {
    const msg = document.getElementById('accessMessage');
    msg.textContent = 'Voce nao tem permissao para acessar esta pagina. Redirecionando para a tela de busca...';
    setTimeout(() => { window.location.href = '/'; }, 10000);
    return;
  }
  document.getElementById('admin-page').classList.add('access-granted');
  await loadDashboard();

  setInterval(() => {
    if (currentView === 'dashboard') loadDashboard();
  }, 30000);
});
