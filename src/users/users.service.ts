import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async updateAccount(
    id: string,
    data: { name?: string; email?: string },
  ): Promise<User> {
    const update: { name?: string; email?: string } = { ...data };
    if (update.email) {
      update.email = update.email.toLowerCase().trim();
    }
    return this.prisma.user.update({ where: { id }, data: update });
  }

  sanitizeUser(user: User) {
    const { passwordHash: _, ...safe } = user;
    return safe;
  }
}
