FROM node:18

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Install FFmpeg and AWS CLI
RUN apt-get update && apt-get install -y ffmpeg awscli

EXPOSE 5000
CMD ["node", "server.js"]