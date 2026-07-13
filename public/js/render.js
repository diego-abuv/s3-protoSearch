function buildResultHtml(data, duracao) {
  const { status, arquivos } = data;
  const encontrado = data.encontrado && arquivos && arquivos.length > 0;
  const temErro = status?.s3?.startsWith('erro:') && status?.local?.startsWith('erro:');

  const steps = [
    { fonte: 's3', status: status?.s3 },
  ];
  if (status?.local && status.local !== 'nao_consultado') {
    steps.push({ fonte: 'local', status: status?.local });
  }

  const card = document.getElementById('tmpl-result-card').content.cloneNode(true);
  const root = card.querySelector('.result-card');

  if (encontrado) root.classList.add('success');
  else if (temErro) root.classList.add('error');
  else root.classList.add('not-found');

  const icon = card.querySelector('.result-icon');
  icon.classList.add(encontrado ? 'success-icon' : 'not-found-icon');
  icon.innerHTML = encontrado ? '&#10003;' : '&#10007;';

  card.querySelector('.fs-6').textContent = encontrado
    ? 'Arquivo encontrado'
    : temErro
      ? 'Falha na busca'
      : 'Nenhum resultado';

  if (temErro) {
    const msgs = [status?.s3, status?.local]
      .filter(s => s?.startsWith('erro:'))
      .map(s => s.replace('erro:', '').trim());
    card.querySelector('.text-secondary.small').textContent = `${msgs.join('; ')} — ${formatDuration(duracao)}`;
  } else {
    card.querySelector('.text-secondary.small').textContent = `${formatDuration(duracao)}`;
  }

  const stepsContainer = card.querySelector('.search-steps');
  steps.forEach((s) => {
    stepsContainer.appendChild(buildStep(s.fonte, s.status));
  });

  if (encontrado) {
    const btnContainer = card.querySelector('.download-buttons');
    arquivos.forEach((a) => {
      btnContainer.appendChild(buildDownloadButton(a));
    });
  }

  return root;
}

function buildStep(fonte, status) {
  const nomes = { s3: 'AWS S3 (nuvem)', local: 'Servidor local (rede)' };

  let cls, text;
  if (status === 'ok') { cls = 'ok'; text = 'Arquivo encontrado'; }
  else if (status === 'indexado') { cls = 'index'; text = 'Arquivo encontrado (índice local)'; }
  else if (status === 'nao_encontrado') { cls = 'miss'; text = 'Nenhum resultado'; }
  else if (status === 'nao_consultado') { cls = 'skip'; text = 'Não consultado'; }
  else if (status && status.startsWith('erro:')) { cls = 'err'; text = status.replace('erro:', '').trim(); }
  else { cls = 'skip'; text = status || 'Desconhecido'; }

  const tmpl = document.getElementById('tmpl-step').content.cloneNode(true);
  tmpl.querySelector('.step-dot').classList.add(cls);
  tmpl.querySelector('.step-fonte').textContent = nomes[fonte] || fonte;
  const statusEl = tmpl.querySelector('.step-status');
  statusEl.classList.add(cls);
  statusEl.textContent = text;

  return tmpl;
}

function buildDownloadButton(arquivo) {
  const tmpl = document.getElementById('tmpl-download-btn').content.cloneNode(true);
  const a = tmpl.querySelector('a');
  a.textContent += escapeHtml(arquivo.nomeParaDownload);

  a.href = '#';
  a.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      const response = await Auth.authFetch(arquivo.downloadUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const tmp = document.createElement('a');
      tmp.href = url;
      tmp.download = arquivo.nomeParaDownload;
      tmp.click();
      URL.revokeObjectURL(url);
    } catch (_err) {
      alert('Falha ao baixar arquivo');
    }
  });

  return a;
}
