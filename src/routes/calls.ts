import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { CallService } from '../services/CallService';

const router = Router();

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
    const turnUrl = process.env.TURN_URL || '';
    const turnUsername = process.env.TURN_USERNAME || '';
    const turnPassword = process.env.TURN_PASSWORD || '';
    
    return res.json({
      url: turnUrl,
      username: turnUsername,
      credential: turnPassword,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch TURN credentials' });
  }
});

export default router;
