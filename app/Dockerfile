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
# Estampille de build : UN SEUL `ARG GIT_SHA` alimente les quatre canaux —
# bundle Vite, `/version.json`, en-tête nginx, label OCI (D-01). Les quatre
# lectures sont faites dans la même exécution de build : diverger exigerait de
# casser ce Dockerfile. `${GIT_SHA:-unknown}` à CHAQUE expansion n'est pas
# décoratif : Compose transmet TOUJOURS l'argument, VIDE quand la variable est
# absente, donc le défaut d'`ARG` ne s'applique jamais par la voie Compose.
ARG GIT_SHA
ENV VITE_APP_VERSION=${GIT_SHA:-unknown}
# Un seul RUN = une seule couche : `/version.json` a exactement le même âge que
# le reste de `dist`, que le `COPY --from=build` final dépose tel quel. L'ordre
# n'est pas décoratif non plus : Vite vide `dist/` au build (`emptyOutDir`) —
# un `printf` écrit AVANT le build disparaîtrait en silence, avec un âge
# différent de celui du bundle.
RUN npm run build && printf '{"version":"%s"}\n' "${GIT_SHA:-unknown}" > dist/version.json

# Nginx non privilégié : écoute sur 8080, aucun privilège requis.
FROM nginxinc/nginx-unprivileged:1.30.5-alpine3.24@sha256:4714e0b1b2577eaa1a6131d07c958b67f0eb68e6d0521e90c6e5287db8cf0bc5
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Re-déclaration obligatoire : un `ARG` d'un stage ne traverse pas `FROM`.
# Le `sed` va APRÈS le `COPY` du nginx.conf (substituer un fichier non encore
# copié n'aurait aucun effet) et AVANT le `COPY` de `dist` (sans effet sur lui).
# La valeur est VALIDÉE avant substitution : dans un remplacement `sed`, `&`
# insère le texte apparié et `\` échappe — `GIT_SHA=dead&beef` produirait
# l'en-tête `dead__APP_GIT_SHA__beef` alors que `/version.json` et le label
# OCI porteraient `dead&beef` : divergence inter-canaux silencieuse (D-01),
# conteneur démarrant quand même. Une valeur invalide échoue donc bruyamment
# au build, avant tout `sed` — cette validation remplace l'acceptation du
# risque T-24-02. `unknown` est accepté explicitement : c'est le repli voulu
# quand l'argument est vide, le rejeter interdirait le build Compose avec la
# variable absente.
ARG GIT_SHA
RUN sha="${GIT_SHA:-unknown}"; \
    printf '%s' "$sha" | grep -qxE '[0-9a-f]{7,40}|unknown' || { echo "GIT_SHA invalide: $sha" >&2; exit 1; }; \
    sed -i "s/__APP_GIT_SHA__/$sha/g" /etc/nginx/conf.d/default.conf
# Nom défini par la spécification OCI : « Source control revision identifier
# for the packaged software ».
LABEL org.opencontainers.image.revision="${GIT_SHA:-unknown}"
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
