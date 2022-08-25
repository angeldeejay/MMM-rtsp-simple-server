#!/usr/bin/env bash
pushd . >/dev/null
SCRIPT_PATH="${BASH_SOURCE[0]}"
while ([ -h "${SCRIPT_PATH}" ]); do
  cd "$(dirname "${SCRIPT_PATH}")"
  SCRIPT_PATH="$(readlink "$(basename "${SCRIPT_PATH}")")"
done
cd "$(dirname "${SCRIPT_PATH}")" >/dev/null
SCRIPT_PATH="$(pwd)"
popd >/dev/null

ARCH=$(dpkg --print-architecture | sed 's:^arm64$:arm64v8:')

rm -fr $SCRIPT_PATH/*.pem $SCRIPT_PATH/*.log
(curl -L "https://github.com/aler9/rtsp-simple-server/releases/download/v0.20.0/rtsp-simple-server_v0.20.0_linux_$ARCH.tar.gz" | tar xzf - -C $SCRIPT_PATH) && rm -fr $SCRIPT_PATH/*.yml
