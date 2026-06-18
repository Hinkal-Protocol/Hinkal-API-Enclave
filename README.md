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

The response contains `imageDigest`, extracted from the `submods.container.image_digest` field of the decoded JWT, `verificationPublicKey` — the enclave's EC P-256 public key generated at startup and embedded in the JWT's `aud` claim — and `nonce`, echoing your request nonce back (covered by `x-hinkal-response-signature`, proving the response was not replayed):

```json
{
  "imageDigest": "sha256:01c6cb76481dd3601c5cdbd899d95c95a75e5874998360187219819b511767c4",
  "jwt": "<google-signed-jwt>",
  "verificationPublicKey": "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...\n-----END PUBLIC KEY-----\n",
  "nonce": "06B7204C-6FF2-4BF4-A4DE-6DFB09E2EFEA"
}
```

You can confirm `verificationPublicKey` is genuine by decoding the JWT and checking that its `aud` claim matches the returned `verificationPublicKey` — since the JWT is signed by Google, this proves the key was generated inside the TEE:

```bash
node -e "const p='<jwt>'.split('.')[1]; console.log(JSON.parse(Buffer.from(p,'base64url').toString()).aud)"
```

Compare `imageDigest` to line 1 of `digest.txt` in this repository:

```bash
cat digest.txt
# sha256:01c6cb76481dd3601c5cdbd899d95c95a75e5874998360187219819b511767c4
# <git-commit-sha>
```

Or do it in one command:

```bash
EXPECTED=$(head -1 digest.txt)
ACTUAL=$(curl -s "https://api.hinkal.io/attestation?nonce=$(uuidgen)" | jq -r '.imageDigest')

if [ "$EXPECTED" = "$ACTUAL" ]; then
  echo "✓ Digest matches: $ACTUAL"
else
  echo "✗ Mismatch — expected: $EXPECTED, got: $ACTUAL"
fi
```

If they match, the running enclave is the image whose provenance you verified in Step 1.

### Step 3 — Verify the JWT signature

The `jwt` field is signed by Google's Confidential Space attestation service using RS256. You can verify the signature in Node.js:

```js
import { createVerify } from 'crypto';

const jwt = '<jwt from /attestation response>';
const [header64, payload64, sig64] = jwt.split('.');

// find the key by kid
const { kid } = JSON.parse(Buffer.from(header64, 'base64url').toString());
const { keys } = await fetch(
  'https://www.googleapis.com/service_accounts/v1/metadata/jwk/signer@confidentialspace-sign.iam.gserviceaccount.com'
).then(r => r.json());
const jwk = keys.find(k => k.kid === kid);
if (!jwk) throw new Error('signing key not found');

// verify
const { createPublicKey } = await import('crypto');
const key = createPublicKey({ key: jwk, format: 'jwk' });
const verify = createVerify('SHA256');
verify.update(`${header64}.${payload64}`);
const valid = verify.verify(key, sig64, 'base64url');

// inspect payload
const payload = JSON.parse(Buffer.from(payload64, 'base64url').toString());
console.log(payload.submods.container.image_digest); // matches digest.txt line 1
console.log(payload.aud);                            // matches verificationPublicKey from /attestation
console.log(payload.eat_nonce);                      // matches your nonce
```

The JWT's `aud` claim contains the enclave's `verificationPublicKey`. Because the JWT is signed by Google, this proves the key was generated inside the TEE.

### Using the public key to verify Hinkal API responses

The enclave signs every response with the EC P-256 private key corresponding to `verificationPublicKey`. The signature is returned in the `x-hinkal-response-signature` response header.

To verify a response:

```js
import { createVerify } from 'crypto';

// 1. fetch verificationPublicKey from /attestation (verifying the JWT proves it came from the TEE)
const { verificationPublicKey } = await fetch('https://api.hinkal.io/attestation?nonce=<uuid>').then(r => r.json());

// 2. call any Hinkal API endpoint, keeping the raw body string
const myNonce = 'E692124A-DCFE-4656-A0F5-9D348A003706';
const response = await fetch('https://api.hinkal.io/deposit', { method: 'POST', body: ... });
const rawBody = await response.text();
const signature = response.headers.get('x-hinkal-response-signature');

// 3. verify signature
const verify = createVerify('SHA256');
verify.update(rawBody);
const valid = verify.verify({ key: verificationPublicKey, dsaEncoding: 'ieee-p1363' }, signature, 'base64');

// 4. verify echoed nonce — proves the response corresponds to your request, not a replay
const responseJson = JSON.parse(rawBody);
if (responseJson.nonce !== myNonce) throw new Error('nonce mismatch — possible replay');
```
