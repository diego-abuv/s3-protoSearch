# Buscador de Protocolos S3 (s3-protoSearch)

`s3-protoSearch` é uma aplicação web interna projetada para simplificar a busca de arquivos de protocolo (como gravações de áudio, documentos, etc.) que podem estar armazenados em dois locais distintos: um bucket na **AWS S3** ou em **pastas de rede/locais**.

A aplicação fornece uma interface simples onde o usuário informa a data e nome do arquivo completo ou parte dele. O sistema então realiza uma busca unificada, priorizando a nuvem (S3) e, caso não encontre, executa uma busca de fallback nos diretórios locais/rede configurados.

## Arquitetura e Foco de Uso

Este projeto foi desenvolvido com foco em ser executado dentro de um container **LXC em um servidor Proxmox**, comum em ambientes corporativos internos, com a principal função de buscar ligações de call-center recebidas da telefonia nos servidores internos da corporação e servidores em nuvem. Essa abordagem permite isolar a aplicação e suas dependências, ao mesmo tempo que facilita o acesso a recursos da rede interna, como pastas compartilhadas.

Embora seja o foco, a aplicação pode ser executada em qualquer ambiente que suporte Node.js.

## Funcionalidades

- **Interface Web Simples**: Busca por data e nome do arquivo.
- **Busca Unificada**:
  1.  Primeiro, busca no bucket da AWS S3.
  2.  Se nada for encontrado, busca nos diretórios locais/rede (fallback).
- **Segurança**: Gera links de download seguros (URLs assinadas para S3 com tempo de expiração) ou links diretos para um endpoint local protegido.
- **Configuração Flexível**: Todos os caminhos de busca, credenciais da AWS e configurações do servidor são gerenciados através de um arquivo `.env`, portanto possui fácil manutenibilidade em casos de migrações de servidores ou configurações.



## Configuração do Ambiente

A configuração é feita através de um arquivo `.env` na raiz do projeto. Voce deve preencher as variáveis conforme o exemplo tendo como base a sua infraestrutura.

### Exemplo de arquivo `.env`

```bash
# Configurações do Servidor
PORT=80

# Configurações da AWS S3
AWS_ACCESS_KEY_ID=SUA_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=SUA_SECRET_KEY
AWS_REGION=SUA_REGIAO
AWS_BUCKET_NAME=NOME_DO_BUCKET

# --- Configurações da Busca Local ---
# Define os caminhos de busca para o ID '196'.
# Estrutura "especial": <caminho_base>,<subpasta1;subpasta2>
# A busca será feita em: \\10.1.1.196\gravacoes\pasta_A e \\10.1.1.196\gravacoes\pasta_B
PATH_196=\\10.1.1.196\gravacoes,pasta_A;pasta_B

# Mapeia anos para um ID de servidor/caminho.
# Ex: Anos 2023 e 2024 estão no servidor/configuração '196'
YEARS_196=2023,2024


# Estrutura "padrão": <caminho1;caminho2>
PATH_197=\\10.1.1.197\bkp_gravacoes

# Exemplo para outro servidor/ID
# Anos que estão no servidor/configuração '197'
YEARS_197=2021,2022


```

### Detalhes da Busca Local

O sistema de busca local é poderoso e permite configurar diferentes estruturas de diretórios.

- **`YEARS_<ID>`**: Associa um ou mais anos a um ID de configuração. Ex: `YEARS_SERVIDOR1=2023,2024`.
- **`PATH_<ID>`**: Define os caminhos para o ID correspondente.
  - **Estrutura Padrão**: `PATH_ID=C:\path`. A busca pela data `2023-10-26` será feita em `C:\path\2023\10\26` e `2024-02-14` em `C:\path\2024\02\14`.
  - **Estrutura Especial**: `PATH_ID=\\servidor\base,sub1;sub2`. A busca pela data `2023-10-26` será feita em `\\servidor\base\sub1\2023\10\26` e `\\servidor\base\sub2\2023\10\26`.

> **IMPORTANTE**: Use barras duplas `\\` para caminhos de rede no Windows ou barras simples `/` para caminhos no Linux, adapte para o seu sistema operacional.

## Preparando o Container LXC (ou Host)

Para que a busca em rede funcione corretamente, algumas configurações no sistema operacional do container são necessárias.

1.  **Dependências**: Instale o Node.js (v18 ou superior) e o `pm2`.
    ```bash
    # Exemplo para Debian/Ubuntu
    sudo apt update
    sudo apt install -y nodejs npm
    sudo npm install -g pm2
    ```

2.  **Acesso a Pastas de Rede (Credenciais)**: Se as pastas de rede são protegidas por senha, o sistema operacional do container precisa ter acesso a elas. A forma mais robusta é montar o compartilhamento de rede permanentemente via `cifs-utils`.

    - Instale o cliente CIFS:
      ```bash
      sudo apt install -y cifs-utils
      ```
    - Crie um arquivo de credenciais (mais seguro):
      ```bash
      sudo nano /etc/samba/credentials/meuservidor
      ```
      Adicione o seguinte conteúdo:
      ```
      username=SEU_USUARIO
      password=SUA_SENHA
      domain=SEU_DOMINIO # Opcional
      ```
    - Crie um ponto de montagem e adicione a entrada no `/etc/fstab` para montar o compartilhamento na inicialização do container.

3.  **Firewall**: Se o container LXC está em uma VLAN ou sub-rede diferente dos servidores de arquivos, certifique-se de que as regras de firewall (no Proxmox, no roteador ou no firewall da rede) permitem a comunicação nas portas e ips necessários.

## Instalação e Execução

1.  **Clone o repositório**:
    ```bash
    git clone <URL_DO_SEU_REPOSITORIO>
    cd s3-protoSearch
    ```

2.  **Instale as dependências do projeto**:
    ```bash
    npm install
    ```

3.  **Configure o arquivo `.env`**:
    Crie o arquivo `.env` e preencha com suas configurações da AWS e caminhos de rede.

4.  **Inicie a aplicação com PM2**:
    O `pm2` é um gerenciador de processos para Node.js que mantém a aplicação rodando em segundo plano e a reinicia automaticamente em caso de falhas.

    ```bash
    # Inicia a aplicação com o nome especificado no arquivo ecosystem.config.cjs
    pm2 start ecosystem.config.cjs 
    ```

### Comandos Úteis do PM2

- **Listar aplicações em execução**:
  ```bash
  pm2 list
  ```

- **Ver logs em tempo real**:
  ```bash
  pm2 logs protocol-searcher
  ```

- **Parar a aplicação**:
  ```bash
  pm2 stop protocol-searcher
  ```

- **Reiniciar a aplicação**:
  ```bash
  pm2 restart protocol-searcher
  ```

- **Configurar para iniciar com o sistema**:
  Execute o comando abaixo e siga as instruções exibidas. Isso garante que o `pm2` (e sua aplicação) iniciem automaticamente após um reboot do container.
  ```bash
  pm2 startup
  ```

Após iniciar, a aplicação estará acessível em `http://<IP_DO_CONTAINER>:<PORTA>`.
