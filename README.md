# 🔍 Buscador de Protocolos S3 (s3-protoSearch)

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20.x-green?style=for-the-badge&logo=nodedotjs" alt="Node.js">
  <img src="https://img.shields.io/badge/AWS%20S3-Integrado-orange?style=for-the-badge&logo=amazons3" alt="AWS S3">
  <img src="https://img.shields.io/badge/Docker-Ready-blue?style=for-the-badge&logo=docker" alt="Docker">
  <img src="https://img.shields.io/badge/Status-Produ%C3%A7%C3%A3o-brightgreen?style=for-the-badge" alt="Status">
</p>

Aplicação web para busca unificada de arquivos de protocolo (gravações de áudio, documentos) armazenados em **AWS S3** ou **pastas de rede internas**. Desenvolvida para ambientes corporativos com servidores de call-center legados e armazenamento em nuvem híbrido.

> Projetado para rodar em containers **LXC no Proxmox**, com fallback automático entre fontes de dados e diagnóstico detalhado de falhas de conexão.

---

## 🚀 Funcionalidades

* **Interface Web**: Formulário simples com data e nome do arquivo, resultados com links de download diretos.
* **Busca Unificada**: Primeiro tenta no S3; se não encontrar (ou houver falha de conexão), busca nos servidores locais.
* **URLs Assinadas (S3)**: Links temporários de 1 hora — sem expor as credenciais da AWS.
* **Download Local Protegido**: Endpoint com validação de path para impedir acesso fora dos diretórios configurados.
* **Diagnóstico Detalhado**: Resposta da API informa individualmente o status de cada fonte (`ok`, `nao_encontrado`, `erro: <motivo>`).
* **Resiliência**: Falha de rede no S3 não quebra o fluxo — o fallback local é executado mesmo com erro.
* **Configuração Flexível**: Múltiplos servidores e estruturas de diretório via `.env`.
* **Docker + PM2**: Suporte a container e gerenciamento de processo com auto-restart.

---

## 📦 Pré-requisitos

| Recurso | Versão |
| ------- | ------ |
| Node.js | 20.x |
| Docker | 24+ (opcional) |
| PM2 | 5+ (opcional) |
| Acesso | Rede interna (SMB/CIFS) + AWS S3 |

---

## ⚙️ Configuração do Ambiente (.env)

O sistema utiliza um arquivo `.env` na raiz do projeto para todas as configurações.

```env
# Servidor
PORT=80
NODE_ENV=busca-ligacoes

# AWS S3
AWS_ACCESS_KEY_ID=SUA_CHAVE_AWS
AWS_SECRET_ACCESS_KEY=SEU_SECRET_AWS
AWS_BUCKET_NAME=nome-do-bucket
AWS_REGION=sa-east-1

# Busca Local — Estrutura Padrão
PATH_74=\\192.168.16.74\grv-voxage\backupligacoes
YEARS_74=2021,2022,2023,2024

# Busca Local — Estrutura Especial (com subpastas)
PATH_196=\\192.168.0.196\Bkp_Ligacoes,Backup_Gravacoes_10_11;Backup_Gravacoes_10_12
YEARS_196=2019,2020,2021
```

### Detalhamento das Variáveis

| Variável | Obrigatório | Descrição |
| -------- | ----------- | --------- |
| `PORT` | Sim | Porta do servidor HTTP |
| `NODE_ENV` | Não | `busca-ligacoes` ativa a rota de download local |
| `AWS_ACCESS_KEY_ID` | Sim | Chave de acesso AWS |
| `AWS_SECRET_ACCESS_KEY` | Sim | Chave secreta AWS |
| `AWS_BUCKET_NAME` | Sim | Nome do bucket (com ou sem `s3://`) |
| `AWS_REGION` | Sim | Região do bucket (ex: `sa-east-1`) |
| `PATH_<ID>` | Condicional | Caminho base de busca local |
| `YEARS_<ID>` | Condicional | Anos associados ao `PATH_<ID>` |

### Estruturas de Diretório Local

**Padrão** — a data é montada como `YYYY/M/D` (sem zero):

```text
\\servidor\base\2024\5\26
```

**Especial** — quando o `PATH_<ID>` contém vírgula, define subpastas com data `YYYY/MM/DD` (com zero):

```text
PATH_196=\\servidor\base,sub1;sub2
```

Resulta em:
```text
\\servidor\base\sub1\2024\05\26
\\servidor\base\sub2\2024\05\26
```

> **Atenção**: Use `\\` para caminhos Windows e `/` para Linux.

---

## 📂 Estrutura do Projeto

```
s3-protoSearch/
├── .env                          # Configurações sensíveis
├── .prettierrc                   # Configuração do Prettier
├── eslint.config.js              # Configuração do ESLint
├── docker-compose.yml            # Orquestração Docker
├── Dockerfile                    # Imagem Node 20-alpine
├── ecosystem.config.cjs          # Configuração PM2
├── package.json
├── src/
│   ├── server.js                 # Entry point
│   ├── app.js                    # Express app + rota /download-local
│   ├── routes/
│   │   └── search.js             # POST /buscar-arquivo
│   └── services/
│       ├── unifiedSearchService.js   # Orquestrador S3 -> Local
│       ├── s3SearchService.js        # Busca no S3 com prefixos
│       └── localSearchService.js     # Busca em diretórios de rede
└── public/
    ├── index.html                # Interface Bootstrap 5
    ├── main.js                   # Lógica de busca no frontend
    └── style.css                 # Customizações
```

---

## 🔌 API — Formato da Resposta

### `POST /buscar-arquivo`

**Request:**
```json
{ "pasta": "2024-05-26", "nomeProtocolo": "audio-12345.mp3" }
```

**Response — Arquivo encontrado (200):**
```json
{
  "encontrado": true,
  "arquivos": [
    {
      "downloadUrl": "https://s3-assinado...",
      "nomeParaDownload": "audio-12345.mp3"
    }
  ],
  "status": {
    "s3": "ok",
    "local": "nao_consultado"
  }
}
```

**Response — Não encontrado (404):**
```json
{
  "encontrado": false,
  "arquivos": null,
  "status": {
    "s3": "nao_encontrado",
    "local": "nao_encontrado"
  }
}
```

**Response — S3 com erro de conexão + local falhou (404):**
```json
{
  "encontrado": false,
  "arquivos": null,
  "status": {
    "s3": "erro: getaddrinfo EAI_AGAIN bc-audios.s3.sa-east-1.amazonaws.com",
    "local": "nao_encontrado"
  }
}
```

| Campo `status.s3` / `status.local` | Significado |
| --------------------------------- | ----------- |
| `ok` | Fonte consultada e arquivo encontrado |
| `nao_encontrado` | Fonte consultada mas sem resultado |
| `nao_consultado` | Fonte não foi consultada (a anterior já achou) |
| `erro: <mensagem>` | Falha na consulta (rede, DNS, permissão) |

---

## 🚀 Instalação e Execução

### Docker (recomendado)

```bash
git clone <URL_DO_REPOSITORIO>
cd s3-protoSearch
cp .env.example .env        # Configure suas credenciais
docker-compose up -d
```

Acesse: `http://<IP_DO_HOST>:80`

### PM2 (sem Docker)

```bash
npm install
npm install -g pm2
pm2 start ecosystem.config.cjs
```

### Manual (desenvolvimento)

```bash
npm install
npm start                    # ou: node src/server.js
```

### Lint e Formatação

```bash
npm run lint                 # Verifica código
npm run lint:fix             # Corrige automaticamente
npm run format               # Formata com Prettier
```

---

## 🐧 Preparação do Container LXC

### Acesso a Pastas de Rede (CIFS)

```bash
sudo apt install -y cifs-utils
sudo mkdir -p /sharepoint
```

Crie um arquivo de credenciais:

```bash
sudo nano /etc/samba/credentials/meuservidor
```

```
username=SEU_USUARIO
password=SUA_SENHA
domain=SEU_DOMINIO
```

Adicione ao `/etc/fstab`:

```
//192.168.0.196/Bkp_Ligacoes /sharepoint/192-168-0-196 cifs credentials=/etc/samba/credentials/meuservidor,iocharset=utf8,file_mode=0777,dir_mode=0777 0 0
```

Monte todos os pontos:

```bash
sudo mount -a
```

### Firewall

Certifique-se de que as portas 443 (S3), 445 (CIFS) e a porta da aplicação estão liberadas entre o container e os servidores de rede.

---

## 🛠 Estrutura do Sistema

| Módulo | Tipo | Função |
| ------ | ---- | ------ |
| **Express** | Servidor | HTTP + rotas + arquivos estáticos |
| **S3 Client** | SDK AWS | Listagem de objetos + geração de URLs assinadas |
| **Local Search** | FS Node | Leitura recursiva de diretórios de rede |
| **Unified Search** | Orquestrador | Sequência S3 → fallback local com resiliência |
| **PM2** | Process Manager | Auto-restart + ambiente consistente |
| **Docker** | Container | Isolamento + volumes CIFS |

---

## 🧠 Arquitetura do Sistema

```mermaid
graph TD
    U[Usuário] --> F[Frontend Bootstrap]
    F --> API[POST /buscar-arquivo]
    API --> ORQ[UnifiedSearchService]

    subgraph "Orquestração"
        ORQ --> TRY1{Tenta S3}
        TRY1 -->|OK| S3[AWS S3 - ListObjectsV2]
        TRY1 -->|Erro de rede| FALLBACK
        TRY1 -->|Não encontrou| FALLBACK

        FALLBACK --> LOCAL{Busca Local}
        LOCAL --> FS[Varre diretórios CIFS]
    end

    S3 --> URL1[URL assinada 1h]
    FS --> URL2[/download-local protegido]

    URL1 --> R[Resposta JSON]
    URL2 --> R
    R --> F

    R --> STATUS{{status: {s3, local}}}

    style ORQ fill:#4CAF50,stroke:#333,stroke-width:2px
    style STATUS fill:#FFC107,stroke:#333,stroke-width:2px
```

---

## 🐛 Tratamento de Erros

O sistema foi projetado para **nunca retornar um erro 500 genérico sem explicação**:

| Situação | Comportamento |
| -------- | ------------- |
| S3 caiu (DNS, timeout, firewall) | Loga o erro, executa fallback local |
| S3 caiu + local achou | `200` com `status.s3: "erro: ..."` e `local: "ok"` |
| Ambos consultados sem resultado | `404` com `status` individual por fonte |
| Path de rede inacessível | Loga aviso, pula para próxima configuração |
| Path traversal detectado | `403` negado com warn no log |

---

## 📄 Licença

Distribuído sob licença interna de uso corporativo.
