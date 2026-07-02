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
    document.getElementById('statUsers').textContent = 'Erro';
    document.getElementById('statLogs').textContent = 'Erro';
    document.getElementById('statSessions').textContent = 'Erro';
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
        <td><span class="badge ${u.role === 'admin' ? 'badge-outline-danger' : 'badge-outline-secondary'}">${escapeHtml(u.role)}</span></td>
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

  if (!username) {
    errEl.textContent = 'Username nao pode ser vazio';
    errEl.classList.remove('d-none');
    return;
  }

  try {
    await API.patch(`/admin/users/${id}`, payload);
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

// ── Formatadores ──────────────────────────────────────────
function formatToSP(utcDate) {
  const d = new Date(utcDate + 'Z');
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

// ── Mapas de ação ───────────────────────────────────────
const ACTION_BADGES = {
  search: 'badge-outline-info',
  login: 'badge-outline-success',
  logout: 'badge-outline-warning',
  admin_create_user: 'badge-outline-danger',
  admin_update_user: 'badge-outline-primary',
  admin_delete_user: 'badge-outline-danger',
};
function badgeForAction(action) {
  return ACTION_BADGES[action] || 'badge-outline-secondary';
}

const ACTION_LABELS = {
  search: 'Busca de arquivo',
  login: 'Login',
  logout: 'Logout',
  admin_create_user: 'Criar usuario',
  admin_update_user: 'Atualizar usuario',
  admin_delete_user: 'Excluir usuario',
};
function labelForAction(action) {
  return ACTION_LABELS[action] || action;
}

// ── Auditoria ──────────────────────────────────────────
async function loadAudit(append) {
  const tbody = document.getElementById('auditTableBody');
  try {
    const data = await API.get(`/admin/audit?limit=${AUDIT_LIMIT}&offset=${auditOffset}`);
    const rows = data.logs.map((l) => `
      <tr>
        <td class="text-nowrap">${escapeHtml(formatToSP(l.created_at))}</td>
        <td>${escapeHtml(l.username)}</td>
        <td><span class="badge ${badgeForAction(l.action)}">${escapeHtml(labelForAction(l.action))}</span></td>
        <td><button class="btn btn-sm audit-info-btn" data-log='${escapeHtml(JSON.stringify(l))}' title="Ver detalhes"><i class="info-i">i</i></button></td>
      </tr>
    `).join('');

    if (append) {
      tbody.innerHTML += rows;
    } else {
      tbody.innerHTML = rows;
    }

    if (!data.logs.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-secondary py-3">Nenhum log</td></tr>';
    }

    const btnMore = document.getElementById('btnCarregarMais');
    btnMore.classList.toggle('d-none', data.logs.length < AUDIT_LIMIT);
  } catch (_e) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger py-3">Erro ao carregar</td></tr>';
  }
}

document.getElementById('btnCarregarMais').addEventListener('click', async () => {
  const btn = document.getElementById('btnCarregarMais');
  btn.disabled = true;
  btn.textContent = 'Carregando...';
  auditOffset += AUDIT_LIMIT;
  await loadAudit(true);
  btn.disabled = false;
  btn.textContent = 'Carregar mais';
});

// ── Detalhes auditoria ─────────────────────────────────
document.getElementById('auditTableBody').addEventListener('click', (e) => {
  const btn = e.target.closest('.audit-info-btn');
  if (!btn) return;

  let log;
  try {
    log = JSON.parse(btn.dataset.log);
  } catch { return; }

  const isSearch = log.action === 'search';
  const isGeneric = ['admin_create_user', 'admin_update_user', 'admin_delete_user'].includes(log.action);
  document.getElementById('ad-title').textContent = isSearch ? 'Detalhes da Consulta' : 'Detalhes da Ação';
  document.getElementById('ad-data').textContent = formatToSP(log.created_at);
  document.getElementById('ad-usuario').textContent = log.username;
  document.getElementById('ad-acao').textContent = labelForAction(log.action);
  document.getElementById('ad-ip').textContent = log.ip || '-';

  // Alterna seções: search / generic / nenhuma (login/logout)
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
    document.getElementById('ad-encontrados').textContent = encontrados !== null ? encontrados : (erro ? `Erro: ${erro}` : '-');

    const sv = document.getElementById('ad-servidores');
    if (s3 || local) {
      const statusClass = (v) => {
        if (!v || v === 'nao_consultado') return 'skip';
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

// ── Init ───────────────────────────────────────────────
document.addEventListener('session-ready', async () => {
  await Promise.all([loadStats(), loadUsers(), loadAudit(false)]);
});
