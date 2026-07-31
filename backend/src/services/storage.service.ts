import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../utils/config.js';
import type { CapturePayload } from '../utils/validation.js';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Ensure screenshot directory exists
async function ensureStorageDir() {
  try {
    await fs.mkdir(config.SCREENSHOT_STORAGE_DIR, { recursive: true });
  } catch (err) {
    console.error('[SightAgent:Storage] Failed to create screenshot directory', err);
  }
}

// Call once on module load
ensureStorageDir();

export class StorageService {
  /**
   * Save an ingested payload to the database, saving the screenshot to disk if present.
   */
  static async saveEvent(payload: CapturePayload) {
    let screenshotPath: string | null = null;

    if (payload.screenshotB64) {
      const fileName = `${payload.timestamp}-${crypto.randomBytes(4).toString('hex')}.jpg`;
      const fullPath = path.join(config.SCREENSHOT_STORAGE_DIR, fileName);
      
      // Save base64 to file
      await fs.writeFile(fullPath, Buffer.from(payload.screenshotB64, 'base64'));
      screenshotPath = fileName;
    }

    const event = await prisma.event.create({
      data: {
        url: payload.url,
        title: payload.title,
        timestamp: new Date(payload.timestamp),
        eventType: payload.domSnapshot.trigger,
        domSnapshot: JSON.stringify(payload.domSnapshot),
        screenshotPath,
        metadata: payload.metadata ? JSON.stringify(payload.metadata) : '{}',
        compressed: payload.compressed,
      },
    });

    return event;
  }

  /**
   * Get an event by ID
   */
  static async getEvent(id: string) {
    return prisma.event.findUnique({
      where: { id },
      include: { analyses: true }
    });
  }
  
  /**
   * Get recent events
   */
  static async getRecentEvents(limit = 20) {
    return prisma.event.findMany({
      orderBy: { timestamp: 'desc' },
      take: limit
    });
  }

  /**
   * Get the full screenshot path for an event
   */
  static getScreenshotFullPath(fileName: string) {
    return path.join(config.SCREENSHOT_STORAGE_DIR, fileName);
  }
  
  /**
   * Save analysis result
   */
  static async saveAnalysis(eventId: string, result: {
    vlmResponse: string,
    model: string,
    promptTokens: number,
    completionTokens: number,
    totalTokens: number
  }) {
    return prisma.analysis.create({
      data: {
        eventId,
        ...result
      }
    });
  }
}
