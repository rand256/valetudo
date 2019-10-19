FROM node:10-alpine

WORKDIR /
COPY . .

RUN npm install --quiet

ENTRYPOINT [ "npm", "run-script", "build" ]