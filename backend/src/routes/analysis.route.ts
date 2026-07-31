import { Router } from 'express';
import { StorageService } from '../services/storage.service.js';

export const analysisRouter: Router = Router();

// Get recent events
analysisRouter.get('/events', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const events = await StorageService.getRecentEvents(limit);
    res.json(events);
  } catch (error) {
    console.error('[SightAgent:Backend] Error fetching events:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific event details including analysis
analysisRouter.get('/events/:id', async (req, res) => {
  try {
    const event = await StorageService.getEvent(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json(event);
  } catch (error) {
    console.error(`[SightAgent:Backend] Error fetching event ${req.params.id}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
