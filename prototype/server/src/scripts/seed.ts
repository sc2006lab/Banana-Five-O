// Seed the data administrator and a demo registered user (credentials come from .env, never hard-coded).
import { prisma } from '../db.js';
import { ARGON2_PARAMS_LABEL, hashPassword } from '../account/passwords.js';
import { createWorkspace } from '../workspaces/service.js';

async function upsertAccount(email: string | undefined, password: string | undefined, displayName: string, role: 'REGISTERED_USER' | 'DATA_ADMINISTRATOR') {
  if (!email || !password) {
    console.warn(`[seed] skipping ${role}: email/password env vars not set`);
    return null;
  }
  const saltedHash = await hashPassword(password);
  const a = await prisma.userAccount.upsert({
    where: { email: email.toLowerCase() },
    create: {
      email: email.toLowerCase(),
      displayName,
      role,
      consentGivenAt: new Date(),
      credential: { create: { saltedHash, parameters: ARGON2_PARAMS_LABEL } },
      preference: { create: { familyStages: [], preferredAreas: [], confirmedWeights: [] } },
    },
    update: { role, credential: { upsert: { create: { saltedHash, parameters: ARGON2_PARAMS_LABEL }, update: { saltedHash } } } },
  });
  if (!(await prisma.workspace.findFirst({ where: { ownerId: a.id, personal: true } }))) {
    await prisma.$transaction(async (tx) => {
      const ws = await createWorkspace(tx, a.id, `${displayName}'s household`, true, 'household');
      await tx.userAccount.update({ where: { id: a.id }, data: { activeWorkspaceId: ws.id } });
    });
  }
  console.log(`[seed] ${role}: ${a.email}`);
  return a;
}

await upsertAccount(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD, 'Data Admin', 'DATA_ADMINISTRATOR');
const demo = await upsertAccount(process.env.DEMO_EMAIL, process.env.DEMO_PASSWORD, 'Demo Family', 'REGISTERED_USER');
if (demo) {
  await prisma.familyPreferenceProfile.update({
    where: { accountId: demo.id },
    data: {
      familyStages: ['preschool', 'primary_school'],
      preferredAreas: ['Bishan', 'Toa Payoh', 'Queenstown'],
      amenityThresholds: { childcare: 1000, primary_school: 1000 },
      wChildcare: 5,
      wSchools: 5,
      wGreenSpaces: 4,
      wCommute: 4,
      confirmedWeights: ['commute'],
      destinations: {
        deleteMany: {},
        create: [{ slot: 1, label: 'Work', queryText: 'Raffles Place MRT', address: 'Raffles Place MRT Station', lat: 1.28393, lng: 103.85143 }],
      },
    },
  });
  console.log('[seed] demo preferences saved');
}
await prisma.$disconnect();
