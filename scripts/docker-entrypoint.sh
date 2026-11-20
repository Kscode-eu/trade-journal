#!/bin/sh
set -eu

# Mounted directories replace the ownership established during the image build.
# Repair them before dropping privileges; never replace the encryption secret.
if [ "$(id -u)" = "0" ]; then
  data_dir="${JOURNAL_DATA_DIR:-/data}"
  mkdir -p "$data_dir"
  chown -R node:node "$data_dir"
  if [ -f "$data_dir/.secret" ]; then
    chmod 600 "$data_dir/.secret"
  fi
  exec gosu node "$@"
fi

# Allow deployments that explicitly supply their own non-root container user.
exec "$@"
