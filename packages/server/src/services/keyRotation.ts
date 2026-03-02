// Key rotation service — increments counter in Postgres, logs audit record
import prisma from '../db/client.js';

export async function rotateGroupKey(talkgroupId: string): Promise<number> {
  const newCounter = await prisma.$transaction(async (tx) => {
    const updated = await tx.talkgroup.update({
      where: { id: talkgroupId },
      data: { rotation_counter: { increment: 1 } },
    });
    await tx.keyRotation.create({
      data: { talkgroup_id: talkgroupId, counter: updated.rotation_counter },
    });
    return updated.rotation_counter;
  });
  return newCounter;
}
