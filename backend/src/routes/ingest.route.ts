import { Router } from 'express';
import { CapturePayloadSchema } from '../utils/validation.js';
import { StorageService } from '../services/storage.service.js';
import { LangChainService } from '../services/langchain.service.js';
import { config } from '../utils/config.js';
import LZString from 'lz-string';

export const ingestRouter: Router = Router();

ingestRouter.post('/ingest', async (req, res) => {
  try {
    let payload = req.body;

    // Check compression headers or body flag
    if (req.headers['x-sightagent-compressed'] === 'lz-string' || payload.compressed) {
      if (typeof payload.domSnapshot === 'string') {
        const decompressed = LZString.decompressFromBase64(payload.domSnapshot);
        if (decompressed) {
          payload.domSnapshot = JSON.parse(decompressed);
        } else {
          return res.status(400).json({ error: 'Failed to decompress domSnapshot' });
        }
      }
    }

    // Validate payload
    const parsed = CapturePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      console.warn('[SightAgent:Backend] Invalid ingest payload', parsed.error.format());
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.format() });
    }

    const validatedPayload = parsed.data;

    // Save event and screenshot
    const event = await StorageService.saveEvent(validatedPayload);
    console.log(`[SightAgent:Backend] Ingested event ${event.id} from ${event.url}`);

    // If configured with an API key, trigger async analysis in background
    if (config.GEMINI_API_KEY) {
      // Fire and forget, don't await
      LangChainService.analyzePayload(validatedPayload)
        .then(result => {
          return StorageService.saveAnalysis(event.id, {
            vlmResponse: result.content,
            model: 'gemini-1.5-flash',
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens
          });
        })
        .then(() => console.log(`[SightAgent:Backend] Analysis completed for event ${event.id}`))
        .catch(err => console.error(`[SightAgent:Backend] Analysis failed for event ${event.id}`, err));
    }

    res.status(200).json({ success: true, eventId: event.id });
  } catch (error) {
    console.error('[SightAgent:Backend] Error in ingest route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
