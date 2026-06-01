# Hinkal API Enclave - Attestations

This repository is published automatically on every deployment of Hinkal's enclave-api. It contains:

- `digest.txt` — SHA256 digest of the deployed Docker image + the git commit SHA it was built from (both signed together)
- `bundle.json` — Sigstore/cosign signature bundle proving the image was built by Hinkal's GitHub Actions
- `enclave-api-src/` — Full TypeScript source of the enclave-api at that commit
- `enclave-api-dist/` — Compiled JavaScript bundle (enclave-api + all shared libraries)
- `enclaveApiGcp.yaml` — The GitHub Actions workflow used to build, sign, and deploy

---

## Running locally

You can run the enclave-api locally from the compiled bundle to inspect its behavior.

### Prerequisites

- Node.js 20+
- A running MongoDB instance (local or remote)

### 1. Generate a local RSA key

The enclave-api encrypts all sensitive data at rest (user mnemonics, DB seeds) using RSA-OAEP. In local mode it uses a local RSA key instead of GCP KMS.

```bash
openssl genrsa -out local-rsa.pem 2048
```

### 2. Encrypt your DB URI and HMAC seed

Install dependencies first, then run the encryption helper:

```bash
cd enclave-api-dist
npm install
```

**Encrypt DB URI:**

```bash
node -e "
const forge = require('node-forge');
const pem = require('fs').readFileSync('../local-rsa.pem', 'utf8');
const key = forge.pki.privateKeyFromPem(pem);
const pub = forge.pki.setRsaPublicKey(key.n, key.e);
const encrypted = pub.encrypt('YOUR_MONGODB_URI', 'RSA-OAEP');
console.log('DB_URI_ENCRYPTED=' + Buffer.from(encrypted, 'binary').toString('base64'));
"
```

**Generate and encrypt HMAC seed** (any random 32 bytes — used to sign DB documents for integrity):

```bash
node -e "
const forge = require('node-forge');
const pem = require('fs').readFileSync('../local-rsa.pem', 'utf8');
const key = forge.pki.privateKeyFromPem(pem);
const pub = forge.pki.setRsaPublicKey(key.n, key.e);
const seed = forge.random.getBytesSync(32);
const encrypted = pub.encrypt(seed, 'RSA-OAEP');
console.log('ENCLAVE_HMAC_ENCRYPTED_SEED=' + Buffer.from(encrypted, 'binary').toString('base64'));
"
```

### 3. Create `.env` in `enclave-api-dist/`

```env
# Port the server listens on
PORT=8000

# Set to "development" to use local RSA key instead of GCP KMS
DEPLOYMENT_MODE=development

# MongoDB URI encrypted with your local RSA key (output from step 2)
DB_URI_ENCRYPTED=<base64 output from encrypt DB URI step>

# Random seed encrypted with your local RSA key, used for HMAC signing of DB documents
ENCLAVE_HMAC_ENCRYPTED_SEED=<base64 output from encrypt HMAC seed step>

# Your local RSA private key in PEM format with literal \n for newlines
LOCAL_RSA_PRIVATE_KEY_PEM="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
```

**Why is the RSA key needed?**
The enclave-api never stores plaintext secrets. Every user's wallet mnemonic and every sensitive config value is RSA-OAEP encrypted before being written to MongoDB. In production this uses GCP KMS. Locally, `DEPLOYMENT_MODE=development` switches to the RSA key you provide here.

### 4. Start the server

```bash
node -r dotenv/config main.js
```

The server starts on `http://localhost:8000`.

---

## Verifying the deployment

Every deployment produces three files that together prove what code is running in the Hinkal enclave.

### Files

| File | Purpose |
|------|---------|
| `digest.txt` | SHA256 digest of the Docker image + the git commit SHA it was built from (both signed together) |
| `bundle.json` | Sigstore bundle: signature + Fulcio certificate + Rekor inclusion proof |

### How it works

1. **Hinkal's GitHub Actions** builds the Docker image from the source at the commit recorded in `digest.txt` line 2, and records the resulting image digest in `digest.txt` line 1
2. **cosign** signs `digest.txt` using GitHub's OIDC token — Fulcio issues a short-lived certificate binding the signature to the `Hinkal-Protocol` GitHub Actions identity, and Rekor records it in a public transparency log
3. The signed digest, certificate, and Rekor inclusion proof are saved in `bundle.json`
4. When the enclave starts, **GCP Confidential Space** issues a JWT containing the digest of the actually running image in `submods.container.image_digest`

A user can verify the full chain:

```
Source code (enclave-api-src/ at commit SHA in digest.txt line 2)
    ↓ built by Hinkal-Protocol GitHub Actions (proven by bundle.json)
digest.txt (sha256:...)
    ↓ matches running enclave (proven by GCP JWT)
GET https://api.hinkal.io/attestation?nonce=<any-uuid> → imageDigest
```

### Step 1 — Verify the cosign bundle

Install cosign: https://docs.sigstore.dev/cosign/system_config/installation/

```bash
cosign verify-blob \
  --bundle bundle.json \
  --certificate-identity-regexp "https://github.com/Hinkal-Protocol/.*" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  digest.txt
```

**What this verifies:**
- Both the image digest and the commit SHA in `digest.txt` are exactly what was signed (not tampered with)
- The signature was produced by a GitHub Actions workflow in the `Hinkal-Protocol` org
- The Fulcio certificate was valid at signing time
- The signing event is recorded in Rekor's public transparency log

A successful result confirms: *Hinkal's GitHub Actions built the image whose digest is in `digest.txt` from the commit on line 2.*

### Step 2 — Verify the running enclave matches the digest

Call the attestation endpoint with any nonce (a UUID you generate yourself):

```bash
curl "https://api.hinkal.io/attestation?nonce=$(uuidgen)"
```

The response contains `imageDigest`, extracted from the `submods.container.image_digest` field of the decoded JWT. Compare it to `digest.txt` (you can verify the JWT signature itself in Step 3):

```bash
cat digest.txt
# sha256:01c6cb76481dd3601c5cdbd899d95c95a75e5874998360187219819b511767c4
```

If they match, the running enclave is the image whose provenance you verified in Step 1.

### Step 3 — Verify the JWT signature (optional)

The `jwt` field in the attestation response is signed by Google's Confidential Space attestation service. You can verify it against Google's public JWKS:

```bash
# decode and inspect the JWT payload
node -e "const p='<jwt>'.split('.')[1]; console.log(JSON.stringify(JSON.parse(Buffer.from(p,'base64url').toString()),null,2))"
```

The `submods.container.image_digest` field inside the JWT will match `digest.txt`. The JWT signature is verifiable against Google's OIDC keys at:
`https://confidentialcomputing.googleapis.com/.well-known/openid-configuration`
