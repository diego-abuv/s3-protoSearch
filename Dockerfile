# Usa uma versão estável e leve do Node
FROM node:20-alpine

# Define o diretório de trabalho
WORKDIR /app

# Copia apenas os arquivos de dependências para otimizar o cache
COPY package*.json ./

# Instala apenas dependências de produção
RUN npm install

# Copia o restante do código fonte
COPY . .

# Expõe a porta
EXPOSE 80

# Comando para iniciar a aplicação
CMD ["node", "src/server.js"]