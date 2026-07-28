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

function addProgressStep(message) {
  const progressDiv = document.getElementById('searchProgress');
  if (!progressDiv) return;

  const prevActive = progressDiv.querySelector('.progress-step.active');
  if (prevActive) {
    prevActive.classList.remove('active');
    const prevIndicator = prevActive.querySelector('.step-indicator');
    if (prevIndicator) prevIndicator.innerHTML = '&#10003;';
  }

  const tmpl = document.getElementById('tmpl-progress-step').content.cloneNode(true);
  tmpl.querySelector('.step-text').textContent = message;
  progressDiv.appendChild(tmpl);
}

let abortController = null;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  event.stopPropagation();

  form.classList.add('was-validated');
  if (!form.checkValidity()) return;

  const pasta = document.getElementById('data').value;
  const nomeProtocolo = document.getElementById('nomeProtocolo').value;
  const inicio = performance.now();

  abortController = new AbortController();
  btnBuscar.disabled = true;
  btnText.textContent = 'Buscando...';
  btnSpinner.classList.remove('d-none');
  resultadoDiv.innerHTML = '';

  resultadoDiv.appendChild(
    document.getElementById('tmpl-progress').content.cloneNode(true)
  );
  addProgressStep('Iniciando busca...');

  const cancelBtn = resultadoDiv.querySelector('.btn-cancel-search');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      abortController.abort();
      if (window.__searchToken) {
        fetch('/cancel-search/' + window.__searchToken, { method: 'POST' }).catch(() => {});
      }
    });
  }

  const duracao = () => ((performance.now() - inicio) / 1000).toFixed(2);

  try {
    const response = await Auth.authFetch('/buscar-arquivo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
      body: JSON.stringify({ pasta, nomeProtocolo }),
      signal: abortController.signal,
    });

    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventType = '';
      let finalData = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n');
        buffer = parts.pop();

        for (const line of parts) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (eventType === 'searchToken') {
                window.__searchToken = data.token;
              } else if (eventType === 'progress') {
                addProgressStep(data.message);
              } else if (eventType === 'result') {
                finalData = data;
              }
            } catch {
              /* ignore parse errors */
            }
          }
        }
      }

      if (finalData) {
        resultadoDiv.innerHTML = '';
        if (finalData.encontrado && finalData.arquivos && finalData.arquivos.length > 0) {
          resultadoDiv.appendChild(buildResultHtml({
            encontrado: true,
            arquivos: finalData.arquivos,
            status: finalData.status,
          }, duracao()));
        } else {
          const card = document.getElementById('tmpl-error-card').content.cloneNode(true);
          if (finalData.error) {
            card.querySelector('.fs-6').textContent = 'Erro no servidor';
            card.querySelector('.text-secondary.small').textContent = finalData.error;
          } else {
            card.querySelector('.fs-6').textContent = 'Arquivo não encontrado';
            card.querySelector('.text-secondary.small').textContent =
              'Nenhum arquivo encontrado para este protocolo nesta data.';
          }
          const pre = card.querySelector('pre');
          if (pre) pre.remove();
          resultadoDiv.appendChild(card);
        }
      }
      return;
    }

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
    if (err.name === 'AbortError' || abortController?.signal.aborted) {
      resultadoDiv.innerHTML = `
        <div class="result-card not-found">
          <div class="d-flex align-items-start gap-3">
            <div class="result-icon not-found-icon">&#10007;</div>
            <div class="flex-grow-1 min-w-0">
              <strong class="fs-6">Busca cancelada</strong>
              <p class="mb-1 text-secondary small">A consulta foi cancelada pelo usuário.</p>
            </div>
          </div>
        </div>`;
    } else {
      resultadoDiv.innerHTML = `
        <div class="result-card not-found">
          <div class="d-flex align-items-start gap-3">
            <div class="result-icon not-found-icon">&#10007;</div>
            <div class="flex-grow-1 min-w-0">
              <strong class="fs-6">Conexão perdida</strong>
              <p class="mb-1 text-secondary small">A conexão com o servidor foi interrompida. A busca continua em segundo plano — verifique o resultado no painel administrativo.</p>
            </div>
          </div>
        </div>`;
    }
  } finally {
    btnBuscar.disabled = false;
    btnText.textContent = 'Buscar';
    btnSpinner.classList.add('d-none');
    abortController = null;
  }
});
