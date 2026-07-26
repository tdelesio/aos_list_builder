# Use official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package descriptors first to leverage Docker layer caching
COPY package*.json ./

# Install npm dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Expose port 8080 for Express
EXPOSE 8080

# Run in production mode by default (compose overrides for dev if needed)
CMD ["npm", "start"]
