// app.js — Bootstrap: checa sessão e inicializa a página protegida
(async () => {
  const user = await Auth.checkSession();
  if (!user) {
    const isAdminPage = window.location.pathname === '/admin.html';
    const msg = document.getElementById('accessMessage');
    if (isAdminPage && msg) {
      msg.textContent = 'Você deve estar logado para acessar esta página. Redirecionando para o login...';
      await new Promise(r => setTimeout(r, 1500));
    }
    window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
    return;
  }

  const avatarEl = document.getElementById('userAvatar');
  const infoEl = document.getElementById('userInfo');
  if (avatarEl) avatarEl.textContent = user.username.charAt(0);
  if (infoEl) infoEl.innerHTML = `${escapeHtml(user.username)} <span class="user-role">(${escapeHtml(user.role)})</span>`;

  document.getElementById('btnLogout').addEventListener('click', () => Auth.logout());
  document.getElementById('btnBusca')?.addEventListener('click', () => { window.location.href = '/'; });
  document.getElementById('btnAdmin')?.addEventListener('click', () => { window.location.href = '/admin.html'; });

  if (user.role === 'admin') {
    document.getElementById('btnAdmin')?.classList.remove('d-none');
    document.getElementById('divAdminDivider')?.classList.remove('d-none');
  }

  const menu = document.querySelector('.user-menu');
  document.getElementById('userMenuToggle').addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) menu.classList.remove('open');
  });

  document.dispatchEvent(new CustomEvent('session-ready', { detail: user }));
})();
