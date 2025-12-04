FROM node:18-alpine
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev --ignore-scripts
COPY index.js ./
COPY proto ./proto
EXPOSE 8080
CMD ["node", "index.js"]
