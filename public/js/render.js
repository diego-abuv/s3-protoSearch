function buildResultHtml(data, duracao) {
  const { status, arquivos } = data;
  const encontrado = data.encontrado && arquivos && arquivos.length > 0;

  const steps = [
    { fonte: 's3', status: status?.s3 },
  ];
  if (status?.local && status.local !== 'nao_consultado') {
    steps.push({ fonte: 'local', status: status?.local });
  }

  const card = document.getElementById('tmpl-result-card').content.cloneNode(true);
  const root = card.querySelector('.result-card');

  root.classList.add(encontrado ? 'success' : 'not-found');

  const icon = card.querySelector('.result-icon');
  icon.classList.add(encontrado ? 'success-icon' : 'not-found-icon');
  icon.innerHTML = encontrado ? '&#10003;' : '&#10007;';

  card.querySelector('.fs-6').textContent = encontrado ? 'Arquivo encontrado' : 'Nenhum resultado';
  card.querySelector('.text-secondary.small').textContent = `${duracao}s`;

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
  a.href = escapeHtml(arquivo.downloadUrl);
  a.textContent += escapeHtml(arquivo.nomeParaDownload);
  return tmpl;
}
