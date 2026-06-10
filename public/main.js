const form = document.getElementById('formBusca');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  event.stopPropagation();

  form.classList.add('was-validated');

  if (!form.checkValidity()) {
    return;
  }

  const pasta = document.getElementById('data').value;
  const nomeProtocolo = document.getElementById('nomeProtocolo').value;
  const resultadoDiv = document.getElementById('resultado');
  const btnBuscar = document.getElementById('btnBuscar');
  const btnText = document.getElementById('btn-text');
  const btnSpinner = document.getElementById('btn-spinner');

  btnBuscar.disabled = true;
  btnText.textContent = 'Buscando...';
  btnSpinner.classList.remove('d-none');
  resultadoDiv.innerHTML = '';

  try {
    const response = await fetch('/buscar-arquivo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pasta, nomeProtocolo }),
    });

    const data = await response.json();

    if (response.ok && data.encontrado && data.arquivos) {
      let htmlContent = '<div class="alert alert-success">';

      const detalhesFonte = [];
      if (data.status) {
        if (data.status.s3 === 'ok') detalhesFonte.push('AWS S3');
        if (data.status.local === 'ok') detalhesFonte.push('Servidor Local');
      }
      if (detalhesFonte.length > 0) {
        htmlContent += `<p class="mb-2">Arquivos encontrados em: <strong>${detalhesFonte.join(' e ')}</strong></p>`;
      } else {
        htmlContent += '<p class="mb-2">Arquivos encontrados!</p>';
      }

      data.arquivos.forEach((arquivo) => {
        htmlContent += `
          <a href="${arquivo.downloadUrl}"
          download="${arquivo.nomeParaDownload}"
          class="btn btn-success me-2 mb-2">
            Baixar ${arquivo.nomeParaDownload}
          </a>
        `;
      });

      htmlContent += '</div>';
      resultadoDiv.innerHTML = htmlContent;
    } else {
      let mensagem = '<div class="alert alert-danger">';

      if (data.status) {
        mensagem += '<p class="mb-2"><strong>Detalhes da busca:</strong></p>';
        mensagem += `<p class="mb-1">S3 (nuvem): ${formatarStatus(data.status.s3)}</p>`;
        mensagem += `<p class="mb-2">Local (rede): ${formatarStatus(data.status.local)}</p>`;
        mensagem += '<hr>';
      }

      mensagem += '<p class="mb-0">Nenhum arquivo encontrado com esses critérios.</p>';
      mensagem += '</div>';
      resultadoDiv.innerHTML = mensagem;
    }
  } catch (error) {
    console.error('Erro na requisição:', error);
    resultadoDiv.innerHTML = '<div class="alert alert-danger">Erro ao conectar com o servidor.</div>';
  } finally {
    btnBuscar.disabled = false;
    btnText.textContent = 'Buscar Arquivo';
    btnSpinner.classList.add('d-none');
  }
});

function formatarStatus(status) {
  if (status === 'ok') return '<span class="text-success">OK (encontrado)</span>';
  if (status === 'nao_encontrado') return '<span class="text-warning">Verificado - não continha o arquivo</span>';
  if (status === 'nao_consultado') return '<span class="text-secondary">Não consultado</span>';
  if (status && status.startsWith('erro:')) {
    const motivo = status.replace('erro:', '').trim();
    return `<span class="text-danger" title="${motivo}">ERRO: ${motivo}</span>`;
  }
  return `<span>${status || 'Desconhecido'}</span>`;
}
