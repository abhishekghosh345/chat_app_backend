import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { CallService } from '../services/CallService';
import https from 'https';

const router = Router();

function fetchTurnApi(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', (err) => reject(err));
  });
}

router.get('/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const calls = await CallService.getCallsByUser(req.user!.userId);
    return res.json({ calls });
  } catch (error) {
    console.error('Get call history error:', error);
    return res.status(500).json({ error: 'Failed to fetch call history' });
  }
});

router.post('/start', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { receiverId, callType } = req.body;
    if (!callType || !['voice', 'video'].includes(callType)) {
      return res.status(400).json({ error: 'Invalid call type' });
    }

    const call = await CallService.createCallRecord(req.user!.userId, receiverId, callType);
    return res.json({ call });
  } catch (error) {
    console.error('Start call error:', error);
    return res.status(500).json({ error: 'Failed to start call' });
  }
});

router.post('/:callId/end', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { durationSeconds } = req.body;
    const { callId } = req.params;
    const call = await CallService.updateCallStatus(callId, 'ended', durationSeconds);
    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }
    return res.json({ call });
  } catch (error) {
    console.error('End call error:', error);
    return res.status(500).json({ error: 'Failed to end call' });
  }
});

router.get('/turn-credentials', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const turnApiUrl = process.env.TURN_API_URL;
    
    // If dynamic Metered TURN API is provided, fetch dynamic credentials
    if (turnApiUrl) {
      const data = await fetchTurnApi(turnApiUrl);
      if (Array.isArray(data)) {
        const turnServer = data.find((server: any) => server.username && server.credential);
        if (turnServer && Array.isArray(turnServer.urls)) {
          // Prefer secure turns: connection
          const url = turnServer.urls.find((u: string) => u.startsWith('turns:')) || turnServer.urls[0];
          return res.json({
            url: url,
            username: turnServer.username,
            credential: turnServer.credential,
          });
        }
      }
    }

    // Fallback to static credentials if TURN_API_URL is not set or fetch fails
    const turnUrl = process.env.TURN_URL || '';
    const turnUsername = process.env.TURN_USERNAME || '';
    const turnPassword = process.env.TURN_PASSWORD || '';
    
    return res.json({
      url: turnUrl,
      username: turnUsername,
      credential: turnPassword,
    });
  } catch (error) {
    console.error('Fetch TURN credentials error:', error);
    // Graceful fallback to static credentials if API fetch fails
    return res.json({
      url: process.env.TURN_URL || '',
      username: process.env.TURN_USERNAME || '',
      credential: process.env.TURN_PASSWORD || '',
    });
  }
});

export default router;
