FROM node:14-alpine

WORKDIR /
COPY . .

RUN apk update && apk add -q git && npm install --quiet

ENTRYPOINT [ "npm", "run-script", "build" ]
