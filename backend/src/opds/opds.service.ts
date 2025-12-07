import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class OpdsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllBooks() {
    return this.prisma.book.findMany({
      include: { files: true },
      orderBy: { title: 'asc' },
    });
  }

  async getBook(id: string) {
    return this.prisma.book.findUnique({
      where: { id },
      include: { files: true },
    });
  }
}
