import http from 'http';
import { Logger } from '@hinkal/common';
import { enclavePublicKey } from '../enclaveKeypair';

const TEE_SERVER_SOCK = '/run/container_launcher/teeserver.sock';

const TOKEN_FETCH_TIMEOUT = 15_000;

export interface AttestationResult {
  jwt: string;
  imageDigest: string;
}

class AttestationService {
  async fetchAttestation(nonce: string): Promise<AttestationResult> {
    const jwt = await this.fetchTokenViaSock(nonce);
    const imageDigest = this.extractImageDigest(jwt);
    return { jwt, imageDigest };
  }

  private extractImageDigest(jwt: string): string {
    try {
      const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()) as {
        submods?: { container?: { image_digest?: string } };
      };
      return payload.submods?.container?.image_digest ?? '';
    } catch (err) {
      Logger.error('[attestation] failed to parse JWT payload', err);
      return '';
    }
  }

  private fetchTokenViaSock(nonce: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        audience: enclavePublicKey,
        token_type: 'OIDC',
        nonces: [nonce],
      });

      const req = http.request(
        {
          socketPath: TEE_SERVER_SOCK,
          path: '/v1/token',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: TOKEN_FETCH_TIMEOUT,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const token = Buffer.concat(chunks).toString().trim();
            if (res.statusCode !== 200) {
              reject(new Error(`TEE server responded ${res.statusCode}: ${token.slice(0, 200)}`));
              return;
            }
            resolve(token);
          });
        },
      );

      req.on('timeout', () => {
        req.destroy(new Error('TEE server socket request timed out after 15s'));
      });
      req.on('error', (err: Error) => {
        reject(err);
      });

      req.write(body);
      req.end();
    });
  }
}

export const attestationService = new AttestationService();
