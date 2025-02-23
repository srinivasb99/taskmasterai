// api/processYouTube.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { processYouTube } from '../../src/lib/youtube-processor';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  try {
    const { url, userId, huggingFaceApiKey } = req.body;

    // Call the processing function and log progress updates
    const processedData = await processYouTube(url, userId, huggingFaceApiKey, (progress) => {
      console.log('Progress update:', progress);
    });

    res.status(200).json(processedData);
  } catch (error: any) {
    console.error('Error processing YouTube video:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
