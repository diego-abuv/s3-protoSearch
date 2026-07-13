const form = document.getElementById('formBusca');
const resultadoDiv = document.getElementById('resultado');
const btnBuscar = document.getElementById('btnBuscar');
const btnText = document.getElementById('btn-text');
const btnSpinner = document.getElementById('btn-spinner');
const dataInput = document.getElementById('data');

dataInput.addEventListener('paste', (e) => {
  const text = (e.clipboardData || window.clipboardData).getData('text');
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(text)) {
    e.preventDefault();
    dataInput.value = text.replace(/\//g, '-');
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  event.stopPropagation();

  form.classList.add('was-validated');
  if (!form.checkValidity()) return;

  const pasta = document.getElementById('data').value;
  const nomeProtocolo = document.getElementById('nomeProtocolo').value;
  const inicio = performance.now();

  btnBuscar.disabled = true;
  btnText.textContent = 'Buscando...';
  btnSpinner.classList.remove('d-none');
  resultadoDiv.innerHTML = '';

  resultadoDiv.appendChild(
    document.getElementById('tmpl-progress').content.cloneNode(true)
  );

  const duracao = () => ((performance.now() - inicio) / 1000).toFixed(2);

  try {
    const response = await Auth.authFetch('/buscar-arquivo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pasta, nomeProtocolo }),
    });

    const raw = await response.text();

    if (!response.ok) {
      resultadoDiv.innerHTML = '';
      const card = document.getElementById('tmpl-error-card').content.cloneNode(true);

      if (response.status === 404) {
        card.querySelector('.fs-6').textContent = 'Arquivo não encontrado';
        card.querySelector('.text-secondary.small').textContent =
          'Nenhum arquivo encontrado para este protocolo nesta data.';
      } else {
        card.querySelector('.fs-6').textContent = 'Erro no servidor';
        card.querySelector('.text-secondary.small').textContent =
          raw || `Status ${response.status}`;
      }

      const pre = card.querySelector('pre');
      if (pre) pre.remove();
      resultadoDiv.appendChild(card);
      return;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (parseErr) {
      resultadoDiv.innerHTML = '';

      const card = document.getElementById('tmpl-error-card').content.cloneNode(true);
      card.querySelector('.fs-6').textContent = 'Resposta inesperada do servidor';
      card.querySelector('.text-secondary.small').textContent =
        `${parseErr.name}: ${escapeHtml(parseErr.message)} (status ${response.status})`;

      const pre = card.querySelector('pre');
      if (pre) {
        pre.textContent = escapeHtml(raw.slice(0, 1000));
      } else {
        card.querySelector('p').remove();
      }

      resultadoDiv.appendChild(card);
      return;
    }

    resultadoDiv.innerHTML = '';
    resultadoDiv.appendChild(buildResultHtml(data, duracao()));
  } catch (err) {
    resultadoDiv.innerHTML = `
      <div class="result-card error">
        <div class="d-flex align-items-start gap-3">
          <div class="result-icon error-icon">!</div>
          <div class="flex-grow-1 min-w-0">
            <strong class="fs-6">Falha na requisição</strong>
            <p class="mb-1 text-secondary small">${err.name}: ${escapeHtml(err.message)}</p>
          </div>
        </div>
      </div>`;
  } finally {
    btnBuscar.disabled = false;
    btnText.textContent = 'Buscar';
    btnSpinner.classList.add('d-none');
  }
});
