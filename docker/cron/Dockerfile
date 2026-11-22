FROM alpine:3.21

RUN apk add --no-cache curl tzdata

COPY tick.sh /usr/local/bin/tick.sh
RUN chmod 0755 /usr/local/bin/tick.sh \
  && printf '0 * * * * /usr/local/bin/tick.sh\n' > /etc/crontabs/root

CMD ["crond", "-f", "-d", "8"]
