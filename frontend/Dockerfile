FROM node:20-alpine

WORKDIR /app

ARG APP_VERSION
ENV NEXT_PUBLIC_APP_VERSION=${APP_VERSION}

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8137
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "8137"]