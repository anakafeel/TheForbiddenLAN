// Seed script — creates initial admin user, test pilot, and Ground Ops talkgroup
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
    update: {},
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

  // Ground Ops talkgroup
  const talkgroup = await prisma.talkgroup.upsert({
    where:  { name: 'Ground Ops' },
    update: {},
    create: { name: 'Ground Ops', master_secret: randomBytes(32), rotation_counter: 0 },
  });
  console.log(`talkgroup: ${talkgroup.id}`);

  // Both users as members of Ground Ops
  await prisma.membership.upsert({
    where:  { user_id_talkgroup_id: { user_id: admin.id, talkgroup_id: talkgroup.id } },
    update: {},
    create: { user_id: admin.id, talkgroup_id: talkgroup.id, site: 'default' },
  });
  await prisma.membership.upsert({
    where:  { user_id_talkgroup_id: { user_id: pilot.id, talkgroup_id: talkgroup.id } },
    update: {},
    create: { user_id: pilot.id, talkgroup_id: talkgroup.id, site: 'default' },
  });
  console.log('Both users added to Ground Ops');

  console.log('Done.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
