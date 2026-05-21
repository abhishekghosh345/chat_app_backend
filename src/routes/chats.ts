import { Router, Request, Response } from 'express';

import { authMiddleware } from '../middleware/auth';
import { ChatService } from '../services/ChatService';

const router = Router();

// Create (direct or group) chat
// For MVP: only group chat creation is explicit; direct chats are via getOrCreateDirectChat.
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { chatType, otherUserId, name, description, memberIds } = req.body as {
      chatType: 'direct' | 'group';
      otherUserId?: string;
      name?: string;
      description?: string;
      memberIds?: string[];
    };

    if (!chatType) return res.status(400).json({ error: 'chatType is required' });

    const userId = req.user!.userId;

    if (chatType === 'direct') {
      if (!otherUserId) return res.status(400).json({ error: 'otherUserId is required' });
      const chat = await ChatService.getOrCreateDirectChat(userId, otherUserId);
      return res.json({ chat });
    }

    if (chatType === 'group') {
      if (!name) return res.status(400).json({ error: 'name is required' });
      const members = Array.isArray(memberIds) ? memberIds : [];
      const { chat, group } = await ChatService.createGroupChat(name, description, userId, members);
      return res.json({ chat, group });
    }

    return res.status(400).json({ error: 'Invalid chatType' });
  } catch (err) {
    console.error('Create chat error:', err);
    return res.status(500).json({ error: 'Failed to create chat' });
  }
});

// List chats for current user
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chats = await ChatService.getUserChats(userId);
    return res.json({ chats });
  } catch (err) {
    console.error('Get chats error:', err);
    return res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

router.get('/:chatId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const chat = await ChatService.getChatById(req.params.chatId);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    const isMember = await ChatService.isUserInChat(req.params.chatId, req.user!.userId);
    if (!isMember) return res.status(403).json({ error: 'Not a chat participant' });
    const participants = await ChatService.getChatParticipants(req.params.chatId);
    return res.json({ chat, participants });
  } catch (err) {
    console.error('Get chat error:', err);
    return res.status(500).json({ error: 'Failed to fetch chat' });
  }
});

router.get('/:chatId/participants', authMiddleware, async (req: Request, res: Response) => {
  try {
    const isMember = await ChatService.isUserInChat(req.params.chatId, req.user!.userId);
    if (!isMember) return res.status(403).json({ error: 'Not a chat participant' });
    const participants = await ChatService.getChatParticipants(req.params.chatId);
    return res.json({ participants });
  } catch (err) {
    console.error('Get participants error:', err);
    return res.status(500).json({ error: 'Failed to fetch participants' });
  }
});

router.post('/:chatId/join', authMiddleware, async (req: Request, res: Response) => {
  // MVP placeholder for group membership join.
  // Proper membership/authorization should be implemented in Phase 1 hardening.
  try {
    const { chatId } = req.params;
    const userId = req.user!.userId;
    await ChatService.addParticipantToChat(chatId, userId);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Join chat error:', err);
    return res.status(500).json({ error: 'Failed to join chat' });
  }
});

export default router;

