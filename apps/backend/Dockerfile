# Base images are pinned by digest, not just by tag.
#
# A tag like `node:22-alpine` is mutable - whoever controls the upstream repo can
# repoint it at different content tomorrow, and your build silently changes. That
# is a textbook supply-chain attack vector. A digest is content-addressed, so the
# bytes you build on are the bytes you reviewed.
#
# To refresh deliberately:
#   docker pull node:22-alpine && docker inspect --format='{{index .RepoDigests 0}}' node:22-alpine
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS deps

WORKDIR /app

# Copy only the manifests first so this layer caches until dependencies change.
COPY package.json package-lock.json ./

# `npm ci` installs exactly what package-lock.json pins and fails if the lockfile
# is out of sync with package.json. `npm install` would happily resolve new
# versions at build time - non-reproducible, and a way for a compromised
# transitive dependency to slip in.
RUN npm ci --omit=dev


FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runtime

ENV NODE_ENV=production
WORKDIR /app

# node:alpine ships an unprivileged `node` user (uid 1000). Use it.
# The k8s securityContext enforces this too, but defense in depth is cheap.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

USER node

EXPOSE 3000

# Exec form, so node is PID 1 and receives SIGTERM directly from the kubelet.
# The shell form would swallow the signal and force a 30s kill on every rollout.
CMD ["node", "src/server.js"]
