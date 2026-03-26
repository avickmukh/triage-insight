# Stage 1: Build the application
FROM node:18-alpine AS builder

# Set the working directory
WORKDIR /usr/src/app

# Copy root dependency management files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy prisma schema to generate client
COPY apps/api/prisma ./apps/api/prisma

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the monorepo source code
COPY . .

# Build the API application
RUN pnpm --filter api build

# Stage 2: Create the production image
FROM node:18-alpine AS production

# Set the working directory
WORKDIR /usr/src/app

# Copy the built application from the builder stage
COPY --from=builder /usr/src/app/apps/api/dist ./apps/api/dist

# Copy production node_modules
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/apps/api/node_modules ./apps/api/node_modules

# Copy prisma schema and client
COPY --from=builder /usr/src/app/apps/api/prisma ./apps/api/prisma

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD ["node", "apps/api/dist/main.js"]
