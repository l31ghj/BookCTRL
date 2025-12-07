FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY nest-cli.json tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

RUN npx prisma generate
RUN npx nest build

ENV NODE_ENV=production
ENV EBOOKS_DIR=/data/ebooks

CMD ["node", "dist/main.js"]
