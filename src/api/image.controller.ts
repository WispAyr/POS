import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';

@Controller('api/images')
export class ImageController {
  private readonly uploadDir: string;

  constructor() {
    this.uploadDir = path.join(process.cwd(), 'uploads', 'images');
  }

  @Get(':filename')
  getImage(@Param('filename') filename: string, @Res() res: Response) {
    // Sanitize filename to prevent directory traversal
    const sanitizedFilename = path.basename(filename);
    const filepath = path.join(this.uploadDir, sanitizedFilename);

    if (!fs.existsSync(filepath)) {
      throw new NotFoundException('Image not found');
    }

    // Determine content type from extension
    const ext = path.extname(sanitizedFilename).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };

    res.setHeader('Content-Type', contentTypes[ext] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

    const stream = fs.createReadStream(filepath);
    stream.pipe(res);
  }
}
