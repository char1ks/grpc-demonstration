FROM node:18-alpine
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev --ignore-scripts
COPY server.js ./
COPY proto ./proto
EXPOSE 50051 3001
CMD ["node", "server.js"]
