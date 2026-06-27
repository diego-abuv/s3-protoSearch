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
};

let auditOffset = 0;
const AUDIT_LIMIT = 20;

// ── Stats ──────────────────────────────────────────────
async function loadStats() {
  try {
    const data = await API.get('/admin/stats');
    document.getElementById('statUsers').textContent = data.users;
    document.getElementById('statLogs').textContent = data.audit_logs;
    document.getElementById('statSessions').textContent = data.active_sessions;
  } catch (_e) {
    // ignora
  }
}

// ── Usuarios ───────────────────────────────────────────
async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  try {
    const data = await API.get('/admin/users');
    if (!data.users.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-secondary py-3">Nenhum usuario</td></tr>';
      return;
    }
    tbody.innerHTML = data.users.map((u) => `
      <tr>
        <td>${u.id}</td>
        <td>${escapeHtml(u.username)}</td>
        <td><span class="badge ${u.role === 'admin' ? 'bg-danger' : 'bg-secondary'}">${escapeHtml(u.role)}</span></td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-info me-1 btn-edit" data-id="${u.id}" data-username="${escapeHtml(u.username)}" data-role="${u.role}">&#9998;</button>
          <button class="btn btn-sm btn-outline-danger btn-delete" data-id="${u.id}" data-username="${escapeHtml(u.username)}">&#128465;</button>
        </td>
      </tr>
    `).join('');
  } catch (_e) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger py-3">Erro ao carregar</td></tr>';
  }
}

// ── Novo usuario ───────────────────────────────────────
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
    loadUsers();
    loadStats();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('d-none');
  }
});

// ── Editar usuario ─────────────────────────────────────
document.getElementById('usersTableBody').addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-edit');
  if (btn) {
    document.getElementById('editUserId').value = btn.dataset.id;
    document.getElementById('editUsername').value = btn.dataset.username;
    document.getElementById('editRole').value = btn.dataset.role;
    document.getElementById('editUserError').classList.add('d-none');
    new bootstrap.Modal(document.getElementById('modalEditar')).show();
  }
});

document.getElementById('btnSalvarEdicao').addEventListener('click', async () => {
  const id = document.getElementById('editUserId').value;
  const username = document.getElementById('editUsername').value.trim();
  const role = document.getElementById('editRole').value;
  const errEl = document.getElementById('editUserError');

  if (!username) {
    errEl.textContent = 'Username nao pode ser vazio';
    errEl.classList.remove('d-none');
    return;
  }

  try {
    await API.patch(`/admin/users/${id}`, { username, role });
    bootstrap.Modal.getInstance(document.getElementById('modalEditar')).hide();
    loadUsers();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('d-none');
  }
});

// ── Excluir usuario ────────────────────────────────────
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
    loadUsers();
    loadStats();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('d-none');
  }
});

// ── Auditoria ──────────────────────────────────────────
async function loadAudit(append) {
  const tbody = document.getElementById('auditTableBody');
  try {
    const data = await API.get(`/admin/audit?limit=${AUDIT_LIMIT}&offset=${auditOffset}`);
    const rows = data.logs.map((l) => `
      <tr>
        <td class="text-nowrap">${escapeHtml(l.created_at)}</td>
        <td>${escapeHtml(l.username)}</td>
        <td><span class="badge bg-info">${escapeHtml(l.action)}</span></td>
        <td class="text-secondary small">${escapeHtml(l.details || '-')}</td>
        <td class="text-secondary small">${escapeHtml(l.ip || '-')}</td>
      </tr>
    `).join('');

    if (append) {
      tbody.innerHTML += rows;
    } else {
      tbody.innerHTML = rows;
    }

    if (!data.logs.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-secondary py-3">Nenhum log</td></tr>';
    }

    const btnMore = document.getElementById('btnCarregarMais');
    btnMore.classList.toggle('d-none', data.logs.length < AUDIT_LIMIT);
  } catch (_e) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger py-3">Erro ao carregar</td></tr>';
  }
}

document.getElementById('btnCarregarMais').addEventListener('click', () => {
  auditOffset += AUDIT_LIMIT;
  loadAudit(true);
});

// ── Init ───────────────────────────────────────────────
document.addEventListener('session-ready', async () => {
  await Promise.all([loadStats(), loadUsers(), loadAudit(false)]);
});
