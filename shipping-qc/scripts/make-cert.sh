#!/usr/bin/env bash
# Creates a self-signed TLS certificate for the QC server so tablets/phones can use camera, GPS and offline mode.
# Usage: scripts/make-cert.sh qc.mycompany.local 192.168.1.50
# Then:  QC_TLS_CERT=data/tls/cert.pem QC_TLS_KEY=data/tls/key.pem npm start
# Each device must trust data/tls/cert.pem once (install it as a trusted CA/profile), or use a real certificate / Caddy / mkcert instead.
set -euo pipefail
HOST="${1:?hostname, e.g. qc.shop.local}"; IP="${2:-}"
DIR="$(dirname "$0")/../data/tls"; mkdir -p "$DIR"
SAN="DNS:$HOST,DNS:localhost"; [ -n "$IP" ] && SAN="$SAN,IP:$IP"
openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes -keyout "$DIR/key.pem" -out "$DIR/cert.pem" \
  -subj "/CN=$HOST" -addExt "subjectAltName=$SAN" 2>/dev/null || \
openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes -keyout "$DIR/key.pem" -out "$DIR/cert.pem" \
  -subj "/CN=$HOST" -addext "subjectAltName=$SAN"
chmod 600 "$DIR/key.pem"; echo "Wrote $DIR/cert.pem and key.pem (valid for: $SAN)"
