# 🔍 Buscador de Protocolos S3 (s3-protoSearch)

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20.x-green?style=for-the-badge&logo=nodedotjs" alt="Node.js">
  <img src="https://img.shields.io/badge/AWS%20S3-Integrado-orange?style=for-the-badge&logo=amazons3" alt="AWS S3">
  <img src="https://img.shields.io/badge/Docker-Ready-blue?style=for-the-badge&logo=docker" alt="Docker">
  <img src="https://img.shields.io/badge/Status-Produ%C3%A7%C3%A3o-brightgreen?style=for-the-badge" alt="Status">
  <img src="https://img.shields.io/badge/S3-KeepAlive-blueviolet?style=for-the-badge&logo=amazons3" alt="S3 KeepAlive">
</p>

Aplicação web para busca unificada de arquivos de protocolo (gravações de áudio, documentos) armazenados em **AWS S3** ou **pastas de rede internas**. Desenvolvida para ambientes corporativos com servidores de call-center legados e armazenamento em nuvem híbrido.

> Projetado para rodar em containers **LXC no Proxmox**, com fallback automático entre fontes de dados e diagnóstico detalhado de falhas de conexão.

---

## 🚀 Funcionalidades

- **Interface Web**: Formulário simples com data e nome do arquivo, step-by-step por servidor, timer de performance e resultados com links de download diretos.
- **Busca Unificada**: Primeiro tenta no S3; se não encontrar (ou houver falha de conexão), busca nos servidores locais.
- **URLs Assinadas (S3)**: Links temporários de 1 hora — sem expor as credenciais da AWS.
- **Download Local Protegido**: Endpoint com validação de path para impedir acesso fora dos diretórios configurados.
- **Diagnóstico Detalhado**: Resposta da API informa individualmente o status de cada fonte (`ok`, `nao_encontrado`, `erro: <motivo>`).
- **Resiliência**: Falha de rede no S3 não quebra o fluxo — o fallback local é executado mesmo com erro.
- **Configuração Flexível**: Múltiplos servidores e estruturas de diretório via `.env`.
- **Keep-Alive nas conexões S3**: Reuso de sockets com pool de 25 conexões, evitando exaustão de portas efêmeras.
- **Retry com backoff**: Requisições S3 falhas são repetidas com exponential backoff + jitter (3 tentativas).
- **Busca paralela com AbortController**: Prefixos de data testados em paralelo via `Promise.all`; ao encontrar, os demais são abortados durante a recursão — redução de ~95% no tempo de fallback local.
- **Rate-limit**: 30 requisições por minuto por IP, com resposta `429` e aviso no log.
- **Docker + PM2**: Suporte a container e gerenciamento de processo com auto-restart.

---

## 📦 Pré-requisitos

| Recurso | Versão                           |
| ------- | -------------------------------- |
| Node.js | 20.x                             |
| Docker  | 24+ (opcional)                   |
| PM2     | 5+ (opcional)                    |
| Acesso  | Rede interna (SMB/CIFS) + AWS S3 |

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

# Busca Local — Sem subpastas
PATH_74=\\192.168.x.xxx\share\base
YEARS_74=2021,2022,2023,2024

# Busca Local — Com subpastas
PATH_196=\\192.168.x.xxx\share\base,sub1;sub2
YEARS_196=2019,2020,2021
```

### Detalhamento das Variáveis

| Variável                | Obrigatório | Descrição                                       |
| ----------------------- | ----------- | ----------------------------------------------- |
| `PORT`                  | Sim         | Porta do servidor HTTP                          |
| `NODE_ENV`              | Não         | `busca-ligacoes` ativa a rota de download local |
| `AWS_ACCESS_KEY_ID`     | Sim         | Chave de acesso AWS                             |
| `AWS_SECRET_ACCESS_KEY` | Sim         | Chave secreta AWS                               |
| `AWS_BUCKET_NAME`       | Sim         | Nome do bucket (com ou sem `s3://`)             |
| `AWS_REGION`            | Sim         | Região do bucket (ex: `sa-east-1`)              |
| `PATH_<ID>`             | Condicional | Caminho base de busca local                     |
| `YEARS_<ID>`            | Condicional | Anos associados ao `PATH_<ID>`                  |

### Estruturas de Diretório Local

O sistema testa **automaticamente 4 variações** da data (`YYYY/M/D`, `YYYY/M/DD`, `YYYY/MM/DD`, `YYYY/MM/D`) em cada servidor configurado, combinando mês e dia com e sem zero à esquerda. Variações redundantes são eliminadas com `Set`.

```text
\\servidor\base\2024\5\26     → sem zero
\\servidor\base\2024\5\26     ← duplicado, descartado
\\servidor\base\2024\05\26    → com zero no mês
\\servidor\base\2024\05\26    ← duplicado, descartado
```

As buscas são feitas em **paralelo** via `Promise.all` com `AbortController` — assim que um prefixo encontra o arquivo, os demais são abortados durante a recursão.

> **Atenção**: Use `\\` para caminhos Windows e `/` para Linux. Quando o `PATH_<ID>` contém vírgula, define subpastas (ex: `PATH_196=\\servidor\base,sub1;sub2`).

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
│   ├── services/
│   │   ├── unifiedSearchService.js   # Orquestrador S3 -> Local
│   │   ├── s3SearchService.js        # Busca no S3 com prefixos
│   │   └── localSearchService.js     # Busca em diretórios de rede
│   └── utils/
│       ├── errorCodes.js             # Mapa de erros AWS/rede + sanitizeError
│       ├── retry.js                  # Exponential backoff com jitter
│       └── logger.js                 # Logger estruturado com cores
└── public/
    ├── index.html                # Interface web (Bootstrap CSS via CDN)
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
    "s3": "erro: getaddrinfo EAI_AGAIN nome-do-bucket.s3.sa-east-1.amazonaws.com",
    "local": "nao_encontrado"
  }
}
```

| Campo `status.s3` / `status.local` | Significado                                    |
| ---------------------------------- | ---------------------------------------------- |
| `ok`                               | Fonte consultada e arquivo encontrado          |
| `nao_encontrado`                   | Fonte consultada mas sem resultado             |
| `nao_consultado`                   | Fonte não foi consultada (a anterior já achou) |
| `erro: <mensagem>`                 | Falha na consulta (rede, DNS, permissão)       |

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

## ⚡ Otimizações de Performance

### S3 — Keep-Alive e Pool de Conexões

O cliente S3 utiliza `https.Agent` com `keepAlive: true` e `maxSockets: 25` — as conexões TLS são reutilizadas em vez de abertas e fechadas a cada requisição. Isso elimina o acúmulo de sockets em estado `TIME_WAIT` e previne exaustão de portas efêmeras.

### S3 — Deduplicação de Prefixos

A função `generatePrefixes` produz 4 variações de prefixo (`YYYY/M/D`, `YYYY/M/DD`, `YYYY/MM/DD`, `YYYY/MM/D`) e as deduplica com `new Set()`. Em dias e meses ≥ 10, apenas 1 ou 2 prefixos únicos são testados em vez de 4.

### S3 — Retry com Exponential Backoff

Requisições ao S3 (`ListObjectsV2`, `getSignedUrl`) são envolvidas por `withRetry`, que tenta até 3 vezes com delay progressivo + jitter aleatório. A primeira tentativa falha espera 500ms, a segunda 1000ms, evitando picos repentinos de retry.

### Local — Busca Paralela com AbortController

Os 4 prefixos de data são testados em paralelo via `Promise.all`. Cada prefixo executa `listFilesRecursively` de forma independente. Quando um prefixo encontra o arquivo, `AbortController.abort()` é disparado — os demais prefixos recebem o sinal e interrompem a recursão no próximo `readdir`, retornando array vazio. Isso reduz o tempo de fallback local de ~7s para ~330ms em servidores com dezenas de milhares de arquivos.

### Local — I/O Assíncrona

Todo o acesso a diretórios e arquivos usa `fs.promises` (`readdir`, `stat`, `access`) em vez dos equivalentes síncronos (`readdirSync`, `existsSync`, `statSync`), permitindo que o event loop do Node.js atenda outras requisições durante a espera por I/O de rede (CIFS).

---

## 🐧 Preparação do Container LXC

### Ajustes de Rede (sysctl)

Para ambientes com muitas requisições S3, configure o kernel do container para suportar mais conexões:

```bash
# Aumenta pool de portas efêmeras de ~28k para ~64k
echo "net.ipv4.ip_local_port_range = 1024 65535" >> /etc/sysctl.conf

# Reduz TIME_WAIT de 60s para 30s (portas liberadas mais rápido)
echo "net.ipv4.tcp_fin_timeout = 30" >> /etc/sysctl.conf

# Aplica as alterações
sysctl -p
```

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
//192.168.x.xxx/share /sharepoint/servidor cifs credentials=/etc/samba/credentials/meuservidor,iocharset=utf8,file_mode=0777,dir_mode=0777 0 0
```

Monte todos os pontos:

```bash
sudo mount -a
```

### Firewall

Certifique-se de que as portas 443 (S3), 445 (CIFS) e a porta da aplicação estão liberadas entre o container e os servidores de rede.

---

## 🛠 Estrutura do Sistema

| Módulo             | Tipo            | Função                                                              |
| ------------------ | --------------- | ------------------------------------------------------------------- |
| **Express**        | Servidor        | HTTP + rotas + rate-limit + headers de segurança                    |
| **S3 Client**      | SDK AWS         | Listagem de objetos + keep-alive (pool 25 sockets) + URLs assinadas |
| **Local Search**   | FS Node/promises | Leitura recursiva assíncrona com AbortController + prefixos paralelos |
| **Unified Search** | Orquestrador    | Sequência S3 → fallback local com resiliência                       |
| **Utils**          | errorCodes, retry, logger | Tradução de erros, exponential backoff, logs estruturados |
| **PM2**            | Process Manager | Auto-restart + ambiente consistente                                 |
| **Docker**         | Container       | Isolamento + volumes CIFS                                           |

---

## 🧠 Arquitetura do Sistema

```mermaid
graph TD
    U[Usuário] --> F[Frontend Bootstrap CSS]
    F --> API[POST /buscar-arquivo]
    API --> RL[Rate-Limit 30/min]
    RL --> ORQ[UnifiedSearchService]

    subgraph "Orquestração"
        ORQ --> RETRY[withRetry 3x backoff]
        RETRY --> TRY1{Tenta S3}
        TRY1 -->|OK| S3[AWS S3 - ListObjectsV2]
        TRY1 -->|Erro de rede| FALLBACK
        TRY1 -->|Não encontrou| FALLBACK

        FALLBACK --> LOCAL{Busca Local}
        LOCAL --> FS[Varre diretórios CIFS]
    end

    S3 --> |URL assinada 1h| URL1[keepAlive + dedup]
    FS --> |/download-local| URL2[AbortController]

    URL1 --> R[Resposta JSON]
    URL2 --> R
    R --> F

    R --> STATUS["status: {s3, local}"]

    style ORQ fill:#4CAF50,stroke:#333,stroke-width:2px
    style STATUS fill:#FFC107,stroke:#333,stroke-width:2px
```

---

## 🐛 Tratamento de Erros

O sistema foi projetado para **nunca retornar um erro 500 genérico sem explicação**:

| Situação                              | Comportamento                                      |
| ------------------------------------- | -------------------------------------------------- |
| S3 caiu (DNS, timeout, firewall)      | Loga o erro, executa fallback local                |
| S3 caiu + local achou                 | `200` com `status.s3: "erro: ..."` e `local: "ok"` |
| Ambos consultados sem resultado       | `404` com `status` individual por fonte            |
| Path de rede inacessível              | Loga aviso, pula para próxima configuração         |
| Todos os caminhos locais inacessíveis | Status `erro: Nenhum caminho de rede acessivel`    |
| Path traversal detectado              | `403` negado com warn no log                       |
| Rate-limit excedido (30 req/min)      | `429` com aviso no log e no corpo da resposta      |
| Erro genérico no servidor             | `sanitizeError` retorna `Erro interno do servidor` sem vazar detalhes |

---

## 📄 Licença

Distribuído sob licença interna de uso corporativo.
