# Worker antivirus Rilisin — kecil, tanpa dependensi npm.
FROM node:24-alpine
WORKDIR /app
COPY worker.mjs .
USER node
CMD ["node", "worker.mjs"]
