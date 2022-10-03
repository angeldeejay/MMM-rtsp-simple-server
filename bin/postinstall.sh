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

rm -fr $SCRIPT_PATH/*.log
if [[ ! -f "$SCRIPT_PATH/rtsp-simple-server" ]]; then
  ARCH=$(dpkg --print-architecture | sed 's:^arm64$:arm64v8:')
  LOCAL_IP=$(hostname -I | awk '{print $1}')

  (curl -L "https://github.com/aler9/rtsp-simple-server/releases/download/v0.20.0/rtsp-simple-server_v0.20.0_linux_$ARCH.tar.gz" | tar xzf - -C $SCRIPT_PATH)
  chmod a+x $SCRIPT_PATH/rtsp-simple-server
fi

if [[ ! -f "$SCRIPT_PATH/rtsp.pem" || ! -f "$SCRIPT_PATH/rtsp-key.pem" ]]; then
  rm -fr $SCRIPT_PATH/rootCA*.pem
  CAROOT=$SCRIPT_PATH mkcert -cert-file $SCRIPT_PATH/rtsp.pem -key-file $SCRIPT_PATH/rtsp-key.pem localhost 127.0.0.1 ::1 $LOCAL_IP
fi
CAROOT=$SCRIPT_PATH mkcert -install
