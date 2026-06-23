const form = document.getElementById('formBusca');
const resultadoDiv = document.getElementById('resultado');
const btnBuscar = document.getElementById('btnBuscar');
const btnText = document.getElementById('btn-text');
const btnSpinner = document.getElementById('btn-spinner');

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

  resultadoDiv.innerHTML = `<div class="search-progress"><div class="progress-step active"><span class="step-indicator"></span><span>Consultando servidores...</span></div></div>`;

  const duracao = () => ((performance.now() - inicio) / 1000).toFixed(2);

  try {
    const response = await fetch('/buscar-arquivo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pasta, nomeProtocolo }),
    });

    const raw = await response.text();

    let data;
    try {
      data = JSON.parse(raw);
    } catch (parseErr) {
      resultadoDiv.innerHTML = `
        <div class="result-card error">
          <div class="d-flex align-items-start gap-3">
            <div class="result-icon error-icon">!</div>
            <div class="flex-grow-1 min-w-0">
              <strong class="fs-6">Resposta inesperada do servidor</strong>
              <p class="mb-1 text-secondary small">${parseErr.name}: ${escapeHtml(parseErr.message)} (status ${response.status})</p>
              <pre class="mb-0 text-warning small" style="white-space:pre-wrap">${escapeHtml(raw.slice(0, 1000))}</pre>
            </div>
          </div>
        </div>`;
      return;
    }

    resultadoDiv.innerHTML = buildResultHtml(data, duracao());
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

function buildResultHtml(data, duracao) {
  const { status, arquivos } = data;
  const encontrado = data.encontrado && arquivos && arquivos.length > 0;

  const steps = [
    { fonte: 's3', status: status?.s3 },
  ];
  if (status?.local && status.local !== 'nao_consultado') {
    steps.push({ fonte: 'local', status: status?.local });
  }

  const html = `
    <div class="result-card ${encontrado ? 'success' : 'not-found'}">
      <div class="d-flex align-items-start gap-3 mb-3">
        <div class="result-icon ${encontrado ? 'success-icon' : 'not-found-icon'}">
          ${encontrado ? '&#10003;' : '&#10007;'}
        </div>
        <div class="flex-grow-1 min-w-0">
          <strong class="fs-6">${encontrado ? 'Arquivo encontrado' : 'Nenhum resultado'}</strong>
          <div class="text-secondary small">${duracao}s</div>
        </div>
      </div>

      <div class="search-steps mb-3">
        ${steps.map((s) => buildStep(s.fonte, s.status)).join('')}
      </div>

      ${encontrado ? buildDownloadButtons(arquivos) : ''}
    </div>
  `;

  return html;
}

function buildStep(fonte, status) {
  const nomes = { s3: 'AWS S3 (nuvem)', local: 'Servidor local (rede)' };

  let cls, text;
  if (status === 'ok') { cls = 'ok'; text = 'Arquivo encontrado'; }
  else if (status === 'nao_encontrado') { cls = 'miss'; text = 'Nenhum resultado'; }
  else if (status === 'nao_consultado') { cls = 'skip'; text = 'Não consultado'; }
  else if (status && status.startsWith('erro:')) { cls = 'err'; text = status.replace('erro:', '').trim(); }
  else { cls = 'skip'; text = status || 'Desconhecido'; }

  return `
    <div class="step-item">
      <div class="step-dot ${cls}"></div>
      <div>
        <div class="step-fonte">${nomes[fonte] || fonte}</div>
        <div class="step-status ${cls}">${text}</div>
      </div>
    </div>
  `;
}

function buildDownloadButtons(arquivos) {
  const buttons = arquivos.map((a) => `
    <a href="${escapeHtml(a.downloadUrl)}"
       class="btn btn-success btn-sm"
       target="_blank"
       rel="noopener">
      &#10515; ${escapeHtml(a.nomeParaDownload)}
    </a>
  `).join('');

  return `<div class="download-buttons">${buttons}</div>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
