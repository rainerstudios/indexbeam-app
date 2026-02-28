FROM node:20-alpine AS base
RUN apk add --no-cache openssl

FROM base AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci && npm cache clean --force
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma
COPY worker.ts ./worker.ts
COPY app/jobs ./app/jobs
COPY app/services ./app/services
COPY app/lib ./app/lib
COPY app/db.server.ts ./app/db.server.ts

EXPOSE 3000
CMD ["npm", "run", "docker-start"]
