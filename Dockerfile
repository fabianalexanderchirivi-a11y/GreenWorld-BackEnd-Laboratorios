FROM node:24-bookworm-slim
ENV NODE_ENV=production
ENV PORT=4000
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node src ./src
USER node
EXPOSE 4000
CMD ["node", "src/server.js"]
