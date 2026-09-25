# Contexte de build : `app/` (déclaré dans compose.app.yaml).
# Version de Node.js et de Nginx alignées sur le contrat de versions : toute
# montée met à jour ensemble la version, le digest, le lockfile npm et la
# chaîne de tests.
FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM dependencies AS build
# Vite fige ces valeurs dans le bundle : un `env_file` du conteneur Nginx ne
# fonctionnerait pas pour elles.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY}
COPY . .
RUN npm run build

# Nginx non privilégié : écoute sur 8080, aucun privilège requis.
FROM nginxinc/nginx-unprivileged:1.30.5-alpine3.24@sha256:4714e0b1b2577eaa1a6131d07c958b67f0eb68e6d0521e90c6e5287db8cf0bc5
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
