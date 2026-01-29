#!/bin/bash
# SSL Certificate Generator for POS Application
# Generates self-signed certificates for local/internal HTTPS

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSL_DIR="$SCRIPT_DIR/../ssl"
DOMAIN="${1:-processing-two.parkwise.noc}"
DAYS="${2:-365}"

# Create ssl directory if it doesn't exist
mkdir -p "$SSL_DIR"

# Check if certs already exist
if [ -f "$SSL_DIR/cert.pem" ] && [ -f "$SSL_DIR/key.pem" ]; then
    EXPIRY=$(openssl x509 -in "$SSL_DIR/cert.pem" -noout -enddate 2>/dev/null | cut -d= -f2)
    echo "Existing certificates found."
    echo "Expiry: $EXPIRY"
    read -p "Regenerate? (y/N): " CONFIRM
    if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
        echo "Keeping existing certificates."
        exit 0
    fi
    # Backup existing certs
    BACKUP_DIR="$SSL_DIR/backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    mv "$SSL_DIR/cert.pem" "$BACKUP_DIR/"
    mv "$SSL_DIR/key.pem" "$BACKUP_DIR/"
    echo "Backed up old certs to $BACKUP_DIR"
fi

echo "Generating SSL certificates..."
echo "  Domain: $DOMAIN"
echo "  Validity: $DAYS days"

# Generate private key and certificate
openssl req -x509 -newkey rsa:4096 \
    -keyout "$SSL_DIR/key.pem" \
    -out "$SSL_DIR/cert.pem" \
    -days "$DAYS" \
    -nodes \
    -subj "/CN=$DOMAIN" \
    -addext "subjectAltName=DNS:$DOMAIN,DNS:localhost,DNS:*.parkwise.noc,IP:127.0.0.1"

# Set permissions
chmod 600 "$SSL_DIR/key.pem"
chmod 644 "$SSL_DIR/cert.pem"

echo ""
echo "Certificates generated successfully:"
echo "  Key:  $SSL_DIR/key.pem"
echo "  Cert: $SSL_DIR/cert.pem"
echo ""
echo "Certificate details:"
openssl x509 -in "$SSL_DIR/cert.pem" -noout -dates -subject
echo ""
echo "To trust this certificate on macOS:"
echo "  sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain $SSL_DIR/cert.pem"
