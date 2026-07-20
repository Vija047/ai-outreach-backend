import { config } from 'dotenv';
import { PrismaClient, CreditReason, Plan } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

config();

const TEST_USER = {
  name: 'Vijay Kumar',
  email: 'vijay-test@outreach.test',
  password: 'password123',
};

async function main() {
  const connectionString =
    process.env.DATABASE_URL ??
    'postgresql://postgres:admin@localhost:5432/ai_outreach?schema=public';
  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const existing = await prisma.user.findUnique({
      where: { email: TEST_USER.email },
    });

    if (existing) {
      console.log('Test user already exists:', TEST_USER.email);
      return;
    }

    const passwordHash = await bcrypt.hash(TEST_USER.password, 10);

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: TEST_USER.name,
          email: TEST_USER.email,
          passwordHash,
          plan: Plan.FREE,
          profile: { create: {} },
        },
      });

      await tx.creditLedger.create({
        data: {
          userId: user.id,
          delta: 20,
          reason: CreditReason.SIGNUP_BONUS,
        },
      });
    });

    console.log('Test user created:');
    console.log('  Email:', TEST_USER.email);
    console.log('  Password:', TEST_USER.password);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
