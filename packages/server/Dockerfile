FROM node:20-alpine
WORKDIR /app

COPY package.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
