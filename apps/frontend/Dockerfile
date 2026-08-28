# Pinned by digest for the same supply-chain reason as the backend image.
#
# The obligation that pin creates: a digest freezes the OS packages inside the
# image until someone deliberately moves it. Worse, a version-specific tag line
# eventually stops being rebuilt at all - `1.27-alpine` no longer exists
# upstream, so it was stranded on alpine 3.21.3 and accumulated 33 HIGH and 2
# CRITICAL CVEs until the Trivy gate in CI refused the build. Refreshing the
# digest could not have helped; the whole tag line was dead.
#
# .github/dependabot.yml now owns this refresh and opens a PR when the tag is
# rebuilt or the line moves on. To do it by hand:
#   docker pull nginx:1.31-alpine
#   docker inspect --format='{{index .RepoDigests 0}}' nginx:1.31-alpine
FROM nginx:1.31-alpine@sha256:db35bfc6b2951e7f8a72db5db120288c127ffaeeb4a6d4b95a26fead017d5913

# The 1.31-alpine line is current, but openssl 3.5.7-r0 in it still carries
# CVE-2026-14456 (fixed in 3.5.8-r0), which is enough to fail the Trivy gate.
# Bumping the digest cannot help until upstream rebuilds the tag.
RUN apk upgrade --no-cache libssl3 libcrypto3


# Custom config: listens on 8080 and writes temp files under /tmp, so the
# container can run as a non-root user with a read-only root filesystem.
COPY nginx.conf /etc/nginx/nginx.conf
COPY index.html /usr/share/nginx/html/index.html

# nginx:alpine ships an `nginx` user (uid 101) but runs as root by default so it
# can bind :80. We listen on :8080 instead, which needs no privileges at all.
USER 101

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
