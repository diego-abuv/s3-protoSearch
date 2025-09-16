# Buscador de Arquivos no S3

Este é um servidor web construído com Node.js e Express que fornece uma interface para buscar arquivos armazenados em um bucket do Amazon S3. A busca é realizada com base em uma data e no nome do arquivo, retornando um link de download pré-assinado.

O projeto é configurado para rodar em dois ambientes distintos, facilitando o desenvolvimento e os testes:

*   **Ambiente de Produção**: Conecta-se diretamente ao AWS S3 usando as credenciais fornecidas para realizar buscas reais.
*   **Ambiente de Desenvolvimento**: Utiliza um sistema de "mock" que simula a estrutura de pastas do S3 em um diretório local, permitindo testes sem custo e sem a necessidade de credenciais da AWS.

## Funcionalidades

- Interface web simples para busca de arquivos.
- Integração com AWS S3 para busca e geração de links de download seguros.
- Modo de desenvolvimento com mock local para testes rápidos.
- Gerenciamento de processos com **PM2** para rodar a aplicação 24/7.
- Configuração baseada em variáveis de ambiente (`.env`).

## Estrutura do Projeto

```
buscador-AWS-S3/
├── public/             # Contém o frontend (index.html)
├── src/
│   ├── app.js          # Configuração central do Express
│   ├── server.js       # Ponto de entrada da aplicação
│   ├── routes/         # Definição das rotas da API
│   └── services/       # Lógica de negócio (S3 real e mock)
├── .env                # Arquivo para variáveis de ambiente (NÃO versionado)
├── ecosystem.config.js # Arquivo de configuração do PM2
└── package.json
```

## Pré-requisitos

- Node.js (versão 18 ou superior)
- npm (geralmente instalado com o Node.js)

## Configuração

1.  Clone este repositório.
2.  Crie um arquivo chamado `.env` na raiz do projeto.
3.  Copie e cole o conteúdo abaixo no arquivo `.env`, substituindo os valores de exemplo pelos seus.

```env
# =======================================
# Variáveis de Ambiente para AWS (Produção)
# =======================================
# Região do seu bucket S3 (ex: us-east-1, sa-east-1)
AWS_REGION=sua-regiao-aws-aqui

# Credenciais de um usuário IAM com permissão para o S3
AWS_ACCESS_KEY_ID=SUA_ACCESS_KEY_ID_AQUI
AWS_SECRET_ACCESS_KEY=SUA_SECRET_ACCESS_KEY_AQUI

# O nome exato do seu bucket no S3
AWS_BUCKET_NAME=nome-do-seu-bucket-aqui


# ==================================================
# Variável para o modo de desenvolvimento (Mock)
# ==================================================
# Caminho absoluto para a pasta que simula o bucket localmente
# Exemplo Windows: E:/Caminho/Para/Sua/Pasta/Local
# Exemplo Linux/macOS: /home/usuario/caminho/para/pasta/local
LOCAL_FILE_PATH=E:/Caminho/Para/Sua/Pasta/Local

# ==================================================
# Variaveis para o modo de busca interna (servidor)
# =======================================
# Servidor X (estrutura especial com subpastas)
PATH_X=\\X.X.X.X\caminho\para\pasta\raiz\compartilhada
YEARS_X="2019,2020,2021"
```

## Estrutura de Pastas e Buckets

Para que a busca funcione corretamente, os arquivos devem seguir uma estrutura de pastas baseada em data.

### Ambiente de Produção (AWS S3)

No seu bucket S3, os arquivos devem ser organizados da seguinte forma:

```
s3://[nome-do-seu-bucket-aqui]/
└── YYYY/
    └── MM/
        └── DD/
            └── nome-do-arquivo.mp3
```

**Exemplo:** Um arquivo de 1 de Outubro de 2024, às 10h, deve estar em `s3://meu-bucket/2024/10/1/10/arquivo.wav`.

### Ambiente de Desenvolvimento (Busca Local)

A estrutura de pastas nos seus servidores locais deve corresponder à configuração no `.env`.

*   **Estrutura Padrão:** O sistema buscará em `[caminho-raiz]\YYYY\M\D\`.
    *   Exemplo: `\\servidor-antigo\gravacoes\2021\5\21\arquivo.wav`

*   **Estrutura Especial:** O sistema buscará em `[caminho-base]\[subpasta]\YYYY\MM\DD\`.
    *   Exemplo: `\\servidor-novo\gravacoes\gravador01\2024\05\21\arquivo.wav`

## Instalação e Execução

1.  **Instale as dependências do projeto:**
    ```bash
    npm install
    ```

2.  **Instale o PM2 globalmente (se ainda não tiver):**
    O PM2 é um gerenciador de processos que manterá sua aplicação rodando 24/7.
    ```bash
    npm install pm2 -g
    ```

3.  **Inicie a aplicação com PM2:**

    *   **Para iniciar em modo de DESENVOLVIMENTO (busca local):**
        ```bash
        pm2 start ecosystem.config.cjs --only buscador-local-server
        ```

    *   **Para iniciar em modo de PRODUÇÃO (busca no S3):**
        ```bash
        pm2 start ecosystem.config.cjs --only buscador-s3-bucket
        ```

## Comandos Importantes do PM2

Aqui está uma lista de comandos úteis para gerenciar sua aplicação com o PM2. Substitua `<nome-do-app>` por `buscador-s3-bucket` ou `buscador-local-server`.

  ```bash
  pm2 list
  ```
- **Ver os logs de uma aplicação em tempo real:**
  ```bash
  pm2 logs <nome-do-app>
  ```
- **Reiniciar uma aplicação:**
  ```bash
  pm2 restart <nome-do-app>
  ```
- **Parar uma aplicação:**
  ```bash
  pm2 stop <nome-do-app>
  ```
- **Remover uma aplicação da lista do PM2:**
  ```bash
  pm2 delete <nome-do-app>
  ```
- **Limpar os arquivos de log de uma aplicação:**
  ```bash
  pm2 flush <nome-do-app>
  ```