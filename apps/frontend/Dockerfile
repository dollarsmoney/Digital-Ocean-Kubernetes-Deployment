# Pinned by digest for the same supply-chain reason as the backend image.
FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10

# Custom config: listens on 8080 and writes temp files under /tmp, so the
# container can run as a non-root user with a read-only root filesystem.
COPY nginx.conf /etc/nginx/nginx.conf
COPY index.html /usr/share/nginx/html/index.html

# nginx:alpine ships an `nginx` user (uid 101) but runs as root by default so it
# can bind :80. We listen on :8080 instead, which needs no privileges at all.
USER 101

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
