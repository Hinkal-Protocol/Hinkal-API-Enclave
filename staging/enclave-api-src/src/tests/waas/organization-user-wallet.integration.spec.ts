import nacl from 'tweetnacl';
import { bytesToHex, ENCLAVE_API_URL, WaasHttpClient, WaasPolicyAction } from '@hinkal/common';

describe('WAAS organization, user, wallet (integration)', () => {
  jest.setTimeout(120_000);

  const client = new WaasHttpClient(ENCLAVE_API_URL);

  it('creates organization, user, wallet; GET endpoints reflect state', async () => {
    const rootKp = nacl.sign.keyPair();
    const userKp = nacl.sign.keyPair();
    const orgName = `WaaS integration ${Date.now()}`;

    const org = await client.postJson<{
      organizationId: string;
      userId: string;
      role: string;
      addresses: unknown[];
    }>('/waas/create-organization', { organizationName: orgName }, rootKp);

    expect(org.organizationId.length).toBeGreaterThan(0);
    expect(org.userId.length).toBeGreaterThan(0);
    expect(org.role).toBe('root');
    expect(Array.isArray(org.addresses)).toBe(true);

    const userPubHex = bytesToHex(userKp.publicKey);
    const createdUser = await client.postJson<{ userId: string; role: string }>(
      '/waas/create-user',
      { organizationId: org.organizationId, publicKey: userPubHex },
      rootKp,
    );
    expect(createdUser.userId.length).toBeGreaterThan(0);

    const orgView = await client.getJson<{
      name: string;
      policies: { policyId: string; userIds: string[]; actionType: string }[];
      users: { userId: string; role: string; publicKey: string }[];
    }>('/waas/get-organization', { organizationId: org.organizationId }, rootKp);

    expect(orgView.name).toBe(orgName);
    expect(orgView.users.map((u) => u.userId)).toEqual(expect.arrayContaining([org.userId, createdUser.userId]));

    const userView = await client.getJson<{
      role: string;
      publicKey: string;
      allowedActions: string[];
    }>(
      '/waas/get-user',
      {
        organizationId: org.organizationId,
        userId: createdUser.userId,
      },
      rootKp,
    );
    expect(userView.publicKey.toLowerCase()).toBe(userPubHex.toLowerCase());
    expect(userView.role).toBeTruthy();

    await client.postJson(
      '/waas/add-policy',
      {
        organizationId: org.organizationId,
        policy: {
          userIds: [createdUser.userId],
          actionType: WaasPolicyAction.CREATE_WALLET,
        },
      },
      rootKp,
    );

    const orgPolicy = await client.getJson<{
      organizationId: string;
      policies: { policyId: string; userIds: string[]; actionType: string }[];
    }>('/waas/get-organization-policy', { organizationId: org.organizationId }, rootKp);

    expect(orgPolicy.policies.some((p) => p.actionType === WaasPolicyAction.CREATE_WALLET)).toBe(true);

    const wallet = await client.postJson<{
      addresses: { evm: string; tron: string; solana: string };
    }>('/waas/create-wallet', { organizationId: org.organizationId, userId: createdUser.userId }, userKp);

    expect(wallet.addresses.evm).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(wallet.addresses.tron.length).toBeGreaterThan(0);
    expect(wallet.addresses.solana.length).toBeGreaterThan(0);

    const { wallets } = await client.getJson<{
      wallets: { evm?: string; tron?: string; solana?: string }[];
    }>(
      '/waas/get-wallets',
      {
        organizationId: org.organizationId,
        userId: createdUser.userId,
      },
      userKp,
    );

    expect(wallets.length).toBeGreaterThanOrEqual(1);
    expect(wallets.some((w) => w.evm?.toLowerCase() === wallet.addresses.evm.toLowerCase())).toBe(true);
  });
});
