import nacl from 'tweetnacl';
import { bytesToHex, ENCLAVE_API_URL, WaasHttpClient, WaasPolicyAction } from '@hinkal/common';

type PolicyRow = { policyId: string; userIds: string[]; actionType: string };

type PolicyMutationData = {
  organizationId: string;
  policies: PolicyRow[];
};

type UserPolicyResponse = {
  role: string;
  allowedActions: string[];
};

describe('WAAS policy lifecycle (integration)', () => {
  jest.setTimeout(240_000);

  const client = new WaasHttpClient(ENCLAVE_API_URL);

  it('steps 1–15: policy lifecycle with success and expected 403s', async () => {
    const rootKp = nacl.sign.keyPair();
    const user1Kp = nacl.sign.keyPair();
    const orgName = `Policy lifecycle ${Date.now()}`;

    // 1) create-organization (root)
    const org = await client.postJson<{
      organizationId: string;
      userId: string;
    }>('/waas/create-organization', { organizationName: orgName }, rootKp);
    const { organizationId } = org;

    // 2) create-user1 (root signs)
    const user1PubHex = bytesToHex(user1Kp.publicKey);
    const { userId: user1Id } = await client.postJson<{ userId: string }>(
      '/waas/create-user',
      { organizationId, publicKey: user1PubHex },
      rootKp,
    );

    // 3) add-policy: CREATE_WALLET for user1 (root)
    const addPolicy1 = await client.postJson<PolicyMutationData>(
      '/waas/add-policy',
      {
        organizationId,
        policy: {
          userIds: [user1Id],
          actionType: WaasPolicyAction.CREATE_WALLET,
        },
      },
      rootKp,
    );
    const policy1 = addPolicy1.policies.find(
      (p) => p.actionType === WaasPolicyAction.CREATE_WALLET && p.userIds.includes(user1Id),
    );
    expect(policy1?.policyId).toBeDefined();

    const user1PolicyAfterAdd = await client.getJson<UserPolicyResponse>(
      '/waas/get-user-policy',
      {
        organizationId,
        userId: user1Id,
      },
      rootKp,
    );
    expect(user1PolicyAfterAdd.allowedActions).toContain(WaasPolicyAction.CREATE_WALLET);

    // 4–5) create-wallet user1 (twice)
    await client.postJson('/waas/create-wallet', { organizationId, userId: user1Id }, user1Kp);
    await client.postJson('/waas/create-wallet', { organizationId, userId: user1Id }, user1Kp);

    // 6) create-user signed by non-root user1 -> 403
    const extraKp = nacl.sign.keyPair();
    const step6 = await client.postRaw(
      '/waas/create-user',
      { organizationId, publicKey: bytesToHex(extraKp.publicKey) },
      user1Kp,
    );
    expect(step6.status).toBe(403);

    // 7) remove-policy (root)
    await client.postJson('/waas/remove-policy', { organizationId, policyId: policy1!.policyId }, rootKp);

    const user1PolicyAfterRemoval = await client.getJson<UserPolicyResponse>(
      '/waas/get-user-policy',
      {
        organizationId,
        userId: user1Id,
      },
      rootKp,
    );
    expect(user1PolicyAfterRemoval.allowedActions).not.toContain(WaasPolicyAction.CREATE_WALLET);

    // 8) create-wallet after removal -> 403
    const step8 = await client.postRaw('/waas/create-wallet', { organizationId, userId: user1Id }, user1Kp);
    expect(step8.status).toBe(403);

    // 9) create-user3 (root)
    const user3Kp = nacl.sign.keyPair();
    const user3Id = (
      await client.postJson<{ userId: string }>(
        '/waas/create-user',
        { organizationId, publicKey: bytesToHex(user3Kp.publicKey) },
        rootKp,
      )
    ).userId;

    // 10) create-user4 (root)
    const user4Kp = nacl.sign.keyPair();
    const user4Id = (
      await client.postJson<{ userId: string }>(
        '/waas/create-user',
        { organizationId, publicKey: bytesToHex(user4Kp.publicKey) },
        rootKp,
      )
    ).userId;

    // 11) add-policy: CREATE_WALLET for user3 + user4 (root)
    const addPolicy2 = await client.postJson<PolicyMutationData>(
      '/waas/add-policy',
      {
        organizationId,
        policy: {
          userIds: [user3Id, user4Id],
          actionType: WaasPolicyAction.CREATE_WALLET,
        },
      },
      rootKp,
    );
    const policy2 = addPolicy2.policies.find(
      (p) =>
        p.actionType === WaasPolicyAction.CREATE_WALLET && p.userIds.includes(user3Id) && p.userIds.includes(user4Id),
    );
    expect(policy2?.policyId).toBeDefined();

    // 12) create-wallet user3 -> success
    await client.postJson('/waas/create-wallet', { organizationId, userId: user3Id }, user3Kp);

    // 13) update-policy: only user4 on CREATE_WALLET (root)
    await client.postJson(
      '/waas/update-policy',
      {
        organizationId,
        policyId: policy2!.policyId,
        newPolicy: {
          userIds: [user4Id],
          actionType: WaasPolicyAction.CREATE_WALLET,
        },
      },
      rootKp,
    );

    // 14) create-wallet user3 after removal from policy -> 403
    const step14 = await client.postRaw('/waas/create-wallet', { organizationId, userId: user3Id }, user3Kp);
    expect(step14.status).toBe(403);

    // 15) create-wallet user4 (still on policy) -> success
    await client.postJson('/waas/create-wallet', { organizationId, userId: user4Id }, user4Kp);
  });
});
