import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3001'),
  DATABASE_URL: z.string().default('file:./dev.db'),
  GEMINI_API_KEY: z.string().optional(),
  SCREENSHOT_STORAGE_DIR: z.string().default(path.join(process.cwd(), 'data', 'screenshots')),
});

const envParsed = envSchema.safeParse(process.env);

if (!envParsed.success) {
  console.error('❌ Invalid environment variables:', envParsed.error.format());
  process.exit(1);
}

export const config = envParsed.data;
