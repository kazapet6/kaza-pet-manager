FROM nginx:1.28.0-alpine
COPY legal/nginx.conf /etc/nginx/conf.d/default.conf
COPY legal/site/ /usr/share/nginx/html/
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
