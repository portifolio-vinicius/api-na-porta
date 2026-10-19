FROM nginx:1.28-alpine@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236
COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf
USER 101:101
EXPOSE 8443
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/proxy-health || exit 1
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
