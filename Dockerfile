FROM node:18

WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy application code
COPY . .

# Install FFmpeg and AWS CLI
RUN apt-get update && apt-get install -y ffmpeg awscli

# Expose port
EXPOSE 5000

# Command to run the application
CMD ["node", "server.js"]