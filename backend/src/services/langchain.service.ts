import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { config } from '../utils/config.js';
import type { CapturePayload } from '../utils/validation.js';

let visionModel: ChatOpenAI | null = null;

if (config.OPENAI_API_KEY) {
  visionModel = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0,
    openAIApiKey: config.OPENAI_API_KEY,
  });
}

export class LangChainService {
  /**
   * Format the captured payload into a LangChain HumanMessage.
   * If a screenshot is provided, it's attached as an image_url.
   */
  static formatMessage(payload: CapturePayload): HumanMessage {
    const content: any[] = [];
    
    // Add context and DOM info as text
    const textContext = `
Page URL: ${payload.url}
Page Title: ${payload.title}
Timestamp: ${new Date(payload.timestamp).toISOString()}
Trigger: ${payload.domSnapshot.trigger}

Interactive Elements (DOM Snapshot):
${JSON.stringify(payload.domSnapshot.elements.slice(0, 50), null, 2)}
    `.trim();

    content.push({
      type: 'text',
      text: textContext
    });

    // Add screenshot if available
    if (payload.screenshotB64) {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${payload.screenshotB64}`,
          detail: 'high',
        },
      });
    }

    return new HumanMessage({ content });
  }

  /**
   * Analyze the payload using the configured VLM.
   */
  static async analyzePayload(payload: CapturePayload) {
    if (!visionModel) {
      throw new Error('VLM not configured (missing OPENAI_API_KEY)');
    }

    const systemMsg = new SystemMessage(
      'You are a visual AI agent analyzing user interactions on a webpage. ' +
      'Given the screenshot and the interactive DOM elements, describe what the user is likely doing or trying to do.'
    );

    const humanMsg = this.formatMessage(payload);

    const response = await visionModel.invoke([systemMsg, humanMsg]);
    
    return {
      content: response.content.toString(),
      usage: response.response_metadata?.tokenUsage || {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      }
    };
  }
}
