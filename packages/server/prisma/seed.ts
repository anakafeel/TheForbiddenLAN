// Seed script — creates initial admin user and test pilots
// Talkgroups and memberships now live on device-side SQLite, provisioned via admin ops.
// Run with: npx tsx prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Admin user (admin / admin)
  const adminHash = await bcrypt.hash('admin', 10);
  const admin = await prisma.user.upsert({
    where:  { username: 'admin' },
    update: { role: 'admin', password_hash: adminHash },
    create: { username: 'admin', password_hash: adminHash, role: 'admin' },
  });
  console.log(`admin user: ${admin.id}`);

  // Test pilot (pilot1 / test)
  const pilotHash = await bcrypt.hash('test', 10);
  const pilot = await prisma.user.upsert({
    where:  { username: 'pilot1' },
    update: {},
    create: { username: 'pilot1', password_hash: pilotHash, role: 'user' },
  });
  console.log(`pilot1 user: ${pilot.id}`);

  // Test pilot2 (pilot2 / test)
  const pilot2Hash = await bcrypt.hash('test', 10);
  const pilot2 = await prisma.user.upsert({
    where:  { username: 'pilot2' },
    update: {},
    create: { username: 'pilot2', password_hash: pilot2Hash, role: 'user' },
  });
  console.log(`pilot2 user: ${pilot2.id}`);

  // Seed a "Ground Ops" talkgroup via an operation in the log
  // This is how talkgroups are created in the distributed architecture
  const talkgroupId = crypto.randomUUID();
  const masterSecret = randomBytes(32).toString('base64');

  await prisma.operation.create({
    data: {
      type: 'ADMIN_CREATE_TALKGROUP',
      payload: { talkgroupId, name: 'Ground Ops', masterSecret },
      issued_by: admin.id,
      signature: 'auto', // hackathon mode — unsigned
    },
  });
  console.log(`seeded ADMIN_CREATE_TALKGROUP op for "Ground Ops" (id=${talkgroupId})`);

  // Add all three users to Ground Ops
  for (const u of [admin, pilot, pilot2]) {
    await prisma.operation.create({
      data: {
        type: 'ADMIN_ADD_MEMBER',
        payload: { talkgroupId, userId: u.id, site: 'default' },
        issued_by: admin.id,
        signature: 'auto',
      },
    });
  }
  console.log('seeded ADMIN_ADD_MEMBER ops for all users → Ground Ops');

  console.log('Done.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
