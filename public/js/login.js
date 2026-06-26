// login.js — Lógica da página de login
(async () => {
  const user = await Auth.checkSession();
  if (user) {
    window.location.href = '/';
    return;
  }
})();

const form = document.getElementById('formLogin');
const btnEntrar = document.getElementById('btnEntrar');
const btnText = document.getElementById('btn-text');
const btnSpinner = document.getElementById('btn-spinner');
const loginError = document.getElementById('loginError');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  event.stopPropagation();
  form.classList.add('was-validated');
  if (!form.checkValidity()) return;

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  btnEntrar.disabled = true;
  btnText.textContent = 'Entrando...';
  btnSpinner.classList.remove('d-none');
  loginError.classList.add('d-none');

  try {
    await Auth.login(username, password);
    window.location.href = '/';
  } catch (err) {
    loginError.textContent = err.message;
    loginError.classList.remove('d-none');
  } finally {
    btnEntrar.disabled = false;
    btnText.textContent = 'Entrar';
    btnSpinner.classList.add('d-none');
  }
});
