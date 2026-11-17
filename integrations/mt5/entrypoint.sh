#!/bin/bash
set -euo pipefail

ingest_token="${MT5_INGEST_TOKEN:-}"
if ((${#ingest_token} < 32)); then
  echo "MT5_INGEST_TOKEN must contain at least 32 characters."
  exit 1
fi

children=()
cleanup() {
  for pid in "${children[@]}"; do kill "$pid" 2>/dev/null || true; done
  wineserver -k 2>/dev/null || true
}
trap cleanup EXIT INT TERM

rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
Xvfb "$DISPLAY" -screen 0 1280x800x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &
children+=("$!")
sleep 1
fluxbox >/tmp/fluxbox.log 2>&1 &
children+=("$!")
x11vnc -display "$DISPLAY" -forever -shared -nopw -rfbport 5900 >/tmp/x11vnc.log 2>&1 &
children+=("$!")
websockify --web=/usr/share/novnc 6080 localhost:5900 >/tmp/novnc.log 2>&1 &
children+=("$!")

if ! wineboot -u >/tmp/wineboot.log 2>&1; then
  cat /tmp/wineboot.log
  exit 1
fi
if ! winecfg -v=win11 >/tmp/winecfg.log 2>&1; then
  cat /tmp/winecfg.log
  exit 1
fi

terminal="${MT5_TERMINAL_PATH:-}"
if [[ -z "$terminal" || ! -f "$terminal" ]]; then
  terminal="$(find "$WINEPREFIX/drive_c/Program Files" -iname terminal64.exe -print -quit 2>/dev/null || true)"
fi

if [[ -z "$terminal" ]]; then
  if [[ ! -f "$WINEPREFIX/.webview2-installed" ]]; then
    webview=/home/mt5/webview2.exe
    echo "Installing the WebView2 runtime required by MT5..."
    curl --fail --location \
      "${MT5_WEBVIEW_INSTALLER_URL:-https://go.microsoft.com/fwlink/?linkid=2124701}" \
      --output "$webview"
    if ! timeout 15m wine "$webview" /silent /install >/tmp/webview2-install.log 2>&1; then
      cat /tmp/webview2-install.log
      exit 1
    fi
    rm -f "$webview"
    touch "$WINEPREFIX/.webview2-installed"
  fi

  installer=/home/mt5/mt5setup.exe
  echo "Downloading the MT5 installer..."
  curl --fail --location \
    "${MT5_INSTALLER_URL:-https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe}" \
    --output "$installer"
  echo "Installing MT5. Open http://localhost:6080/vnc.html if the installer needs input."
  timeout 10m wine "$installer" /auto >/tmp/mt5-install.log 2>&1 || true
  wineserver -k 2>/dev/null || true
  wineserver -w 2>/dev/null || true
  rm -f "$installer"
  terminal="$(find "$WINEPREFIX/drive_c/Program Files" -iname terminal64.exe -print -quit 2>/dev/null || true)"
fi

if [[ -z "$terminal" || ! -f "$terminal" ]]; then
  [[ -f /tmp/mt5-install.log ]] && cat /tmp/mt5-install.log
  echo "MT5 was not installed. Check /tmp/mt5-install.log through docker compose logs."
  exit 1
fi

terminal_dir="$(dirname "$terminal")"
expert_dir="$terminal_dir/MQL5/Experts"
mkdir -p "$expert_dir" "$terminal_dir/MQL5/Files"
expert_source="$expert_dir/TradeJournalExporter.mq5"
expert_binary="$expert_dir/TradeJournalExporter.ex5"

if [[ ! -f "$expert_source" ]] || ! cmp -s /opt/mt5/TradeJournalExporter.mq5 "$expert_source"; then
  cp /opt/mt5/TradeJournalExporter.mq5 "$expert_source"
  rm -f "$expert_binary"
fi

if [[ ! -f "$expert_binary" ]]; then
  editor="$(find "$terminal_dir" -maxdepth 1 -iname metaeditor64.exe -print -quit || true)"
  if [[ -z "$editor" ]]; then
    echo "MetaEditor was not installed with this MT5 terminal."
    exit 1
  fi
  source_windows="$(winepath -w "$expert_source")"
  echo "Compiling the Trade Journal exporter..."
  timeout 2m wine "$editor" "/compile:$source_windows" /log >/tmp/metaeditor.log 2>&1 || true
fi

if [[ ! -f "$expert_binary" ]]; then
  log="${expert_source%.mq5}.log"
  [[ -f "$log" ]] && iconv -f UTF-16LE -t UTF-8 "$log" || true
  echo "The Trade Journal exporter did not compile."
  exit 1
fi

startup=/home/mt5/mt5-startup.ini
startup_text=/home/mt5/mt5-startup.txt
cat >"$startup_text" <<EOF
[Experts]
Enabled=1
AllowLiveTrading=0
AllowDllImport=0

[StartUp]
Expert=TradeJournalExporter
Symbol=${MT5_STARTUP_SYMBOL:-EURUSD}
Period=M1
EOF
printf '\xff\xfe' >"$startup"
iconv -f UTF-8 -t UTF-16LE "$startup_text" >>"$startup"
rm -f "$startup_text"

export MT5_EXPORT_FILE="$terminal_dir/MQL5/Files/TradeJournalDeals.tsv"
python3 /opt/mt5/bridge.py &
children+=("$!")

startup_windows="$(winepath -w "$startup")"
echo "Starting MT5. Browser console: http://localhost:6080/vnc.html?autoconnect=1&resize=scale"
wine "$terminal" /portable "/config:$startup_windows" &
terminal_pid=$!
children+=("$terminal_pid")
wait "$terminal_pid"
