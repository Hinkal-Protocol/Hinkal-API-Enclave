import nacl from 'tweetnacl';
import { bytesToHex, ENCLAVE_API_URL, WaasHttpClient, WaasPolicyAction } from '@hinkal/common';

type PolicyRow = { policyId: string; userIds: string[]; actionType: string };
type PolicyMutationData = { organizationId: string; policies: PolicyRow[] };

describe('WAAS READ_ROOT_BALANCE policy (integration)', () => {
  jest.setTimeout(120_000);

  const client = new WaasHttpClient(ENCLAVE_API_URL);

  it('grants and revokes access to root balance via READ_ROOT_BALANCE policy', async () => {
    const rootKp = nacl.sign.keyPair();
    const user1Kp = nacl.sign.keyPair();
    const user2Kp = nacl.sign.keyPair();
    const orgName = `READ_ROOT_BALANCE test ${Date.now()}`;

    // 1) create organization — root gets a wallet automatically
    const org = await client.postJson<{
      organizationId: string;
      userId: string;
      addresses: { evm: string; tron: string; solana: string }[];
    }>('/waas/create-organization', { organizationName: orgName }, rootKp);

    const { organizationId } = org;
    const rootUserId = org.userId;
    const rootEvmAddress = org.addresses[0].evm;

    // 2) create user1 and user2 (no wallet needed for this test)
    const { userId: user1Id } = await client.postJson<{ userId: string }>(
      '/waas/create-user',
      { organizationId, publicKey: bytesToHex(user1Kp.publicKey) },
      rootKp,
    );

    const { userId: user2Id } = await client.postJson<{ userId: string }>(
      '/waas/create-user',
      { organizationId, publicKey: bytesToHex(user2Kp.publicKey) },
      rootKp,
    );

    // give user2 a wallet so we can test that READ_ROOT_BALANCE does NOT grant access to non-root wallets
    await client.postJson(
      '/waas/add-policy',
      { organizationId, policy: { userIds: [user2Id], actionType: WaasPolicyAction.CREATE_WALLET } },
      rootKp,
    );
    const { addresses: user2Addresses } = await client.postJson<{
      addresses: { evm: string };
    }>('/waas/create-wallet', { organizationId, userId: user2Id }, user2Kp);
    const user2EvmAddress = user2Addresses.evm;

    const balanceParams = (targetUserId: string, walletAddress: string) => ({
      organizationId,
      userId: targetUserId,
      walletAddress,
      chainId: '1',
    });

    // 3) user1 (no READ_ROOT_BALANCE) cannot read root's balance → 403
    const beforePolicyResult = await client.getRaw(
      '/waas/private-balance',
      balanceParams(rootUserId, rootEvmAddress),
      user1Kp,
    );
    expect(beforePolicyResult.status).toBe(403);

    // 4) add READ_ROOT_BALANCE policy for user1
    const addPolicyResp = await client.postJson<PolicyMutationData>(
      '/waas/add-policy',
      { organizationId, policy: { userIds: [user1Id], actionType: WaasPolicyAction.READ_ROOT_BALANCE } },
      rootKp,
    );
    const readRootPolicy = addPolicyResp.policies.find(
      (p) => p.actionType === WaasPolicyAction.READ_ROOT_BALANCE && p.userIds.includes(user1Id),
    );
    expect(readRootPolicy?.policyId).toBeDefined();

    // 5) user1 with READ_ROOT_BALANCE can now access root's balance (auth passes, regardless of data-fetch outcome)
    const afterPolicyResult = await client.getRaw(
      '/waas/private-balance',
      balanceParams(rootUserId, rootEvmAddress),
      user1Kp,
    );
    expect(afterPolicyResult.status).not.toBe(403);

    // 6) root can still read their own balance
    const rootSelfResult = await client.getRaw(
      '/waas/private-balance',
      balanceParams(rootUserId, rootEvmAddress),
      rootKp,
    );
    expect(rootSelfResult.status).not.toBe(403);

    // 7) READ_ROOT_BALANCE does NOT grant access to a non-root user's wallet → 403
    const nonRootResult = await client.getRaw(
      '/waas/private-balance',
      balanceParams(user2Id, user2EvmAddress),
      user1Kp,
    );
    expect(nonRootResult.status).toBe(403);

    // 8) remove READ_ROOT_BALANCE policy
    await client.postJson('/waas/remove-policy', { organizationId, policyId: readRootPolicy!.policyId }, rootKp);

    // 9) user1 can no longer read root's balance → 403
    const afterRemovalResult = await client.getRaw(
      '/waas/private-balance',
      balanceParams(rootUserId, rootEvmAddress),
      user1Kp,
    );
    expect(afterRemovalResult.status).toBe(403);
  });
});
