FROM node:18

# Create app directory
WORKDIR /usr/src/shopgoodwill-ical

RUN chown node:node /usr/src/shopgoodwill-ical

USER node
COPY package*.json ./
RUN npm ci

# Bundle app source
COPY . .

EXPOSE 3000

CMD [ "npm", "start" ]