FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY nest-cli.json tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

RUN npx prisma generate
RUN npm run build

ENV NODE_ENV=production
ENV DATABASE_URL=file:/data/dev.db
ENV EBOOKS_DIR=/data/ebooks

VOLUME ["/data"]

CMD npx prisma migrate deploy && node dist/main.js
