FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:99 \
    WINEARCH=win64 \
    WINEDEBUG=-all \
    WINEPREFIX=/home/mt5/.wine

RUN dpkg --add-architecture i386 \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates curl fluxbox gnupg novnc python3 tini websockify winbind x11vnc xvfb \
    && mkdir -pm755 /etc/apt/keyrings \
    && curl --fail --location https://dl.winehq.org/wine-builds/winehq.key \
      | gpg --dearmor -o /etc/apt/keyrings/winehq-archive.key \
    && curl --fail --location \
      https://dl.winehq.org/wine-builds/debian/dists/bookworm/winehq-bookworm.sources \
      --output /etc/apt/sources.list.d/winehq-bookworm.sources \
    && apt-get update \
    && apt-get install -y --install-recommends winehq-staging \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 mt5 \
    && mkdir -p /home/mt5/.wine /tmp/.X11-unix \
    && chmod 1777 /tmp/.X11-unix \
    && chown -R mt5:mt5 /home/mt5

COPY --chown=mt5:mt5 TradeJournalExporter.mq5 bridge.py entrypoint.sh /opt/mt5/
RUN chmod +x /opt/mt5/entrypoint.sh

USER mt5
VOLUME /home/mt5/.wine
EXPOSE 6080
ENTRYPOINT ["tini", "--", "/opt/mt5/entrypoint.sh"]
