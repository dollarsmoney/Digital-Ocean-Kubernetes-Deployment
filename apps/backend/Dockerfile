# Base images are pinned by digest, not just by tag.
#
# A tag like `node:22-alpine` is mutable - whoever controls the upstream repo can
# repoint it at different content tomorrow, and your build silently changes. That
# is a textbook supply-chain attack vector. A digest is content-addressed, so the
# bytes you build on are the bytes you reviewed.
#
# To refresh deliberately:
#   docker pull node:22-alpine && docker inspect --format='{{index .RepoDigests 0}}' node:22-alpine
FROM node:26-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3 AS deps

WORKDIR /app

# Copy only the manifests first so this layer caches until dependencies change.
COPY package.json package-lock.json ./

# `npm ci` installs exactly what package-lock.json pins and fails if the lockfile
# is out of sync with package.json. `npm install` would happily resolve new
# versions at build time - non-reproducible, and a way for a compromised
# transitive dependency to slip in.
RUN npm ci --omit=dev


FROM node:26-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3 AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Two things the digest pin cannot fix on its own:
#
# 1. openssl 3.5.7-r0 in this layer has CVE-2026-14456 (fixed in 3.5.8-r0), and
#    the node:22-alpine tag has not been rebuilt since it was pinned - the
#    current tag still resolves to this exact digest. So patch it here.
#
# 2. npm ships ~11 HIGH/CRITICAL CVEs inside its OWN bundled dependencies
#    (tar, pacote, sigstore, brace-expansion, picomatch, ip-address). None of
#    them are reachable from this app, but a scanner cannot know that, and the
#    honest fix is not to suppress them - it is to delete npm. This container
#    runs `node src/server.js`; it never needs a package manager at runtime.
#    The deps stage above still has npm, and that stage is discarded.
#
# apk upgrade does reintroduce some build-time nondeterminism, which is the
# real trade-off against a fully frozen digest. Pinning plus a narrow,
# deliberate upgrade is the usual compromise.
RUN apk upgrade --no-cache libssl3 libcrypto3 \
 && rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/bin/npm \
           /usr/local/bin/npx

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
