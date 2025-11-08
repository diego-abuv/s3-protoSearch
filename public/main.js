const form = document.getElementById('formBusca');

form.addEventListener('submit', async (event) => {
    // Previne a submissão padrão em todos os casos
    event.preventDefault();
    event.stopPropagation();


    // Adiciona a classe de validação do Bootstrap para mostrar os feedbacks (ex: campos vermelhos)
    form.classList.add('was-validated');

    // Se o formulário não for válido (campos obrigatórios não preenchidos), não faz nada.
    if (!form.checkValidity()) {
        return;
    }

    // Se o formulário for válido, executa a lógica de busca
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

            if (response.ok) {
                
                let htmlContent = '<div class="alert alert-success"><p class="mb-2">Arquivos encontrados!</p>';

                data.forEach(arquivo => { 
                    
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
                // exibe mensagem de arquivo não encontrado
                resultadoDiv.innerHTML = '<div class="alert alert-danger"><p class="mb-2">Infelizmente não encontramos nenhum arquivo.</p><p class="mb-2">Busca realizada nos servidores Locais e na nuvem do S3.</p></div>';
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