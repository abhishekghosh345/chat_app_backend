import { Router, Request, Response } from 'express';

import { authMiddleware } from '../middleware/auth';
import { MessageService } from '../services/MessageService';
import { ChatService } from '../services/ChatService';

const router = Router();

router.get('/chats/:chatId/messages', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

    const isMember = await ChatService.isUserInChat(chatId, req.user!.userId);
    if (!isMember) return res.status(403).json({ error: 'Not a chat participant' });

    const messages = await MessageService.getMessagesByChat(chatId, limit, offset);
    return res.json({ messages });
  } catch (err) {
    console.error('Get messages error:', err);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.post('/chats/:chatId/messages', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { content, messageType, encryptedPayload, mediaUrl, replyTo, mediaExpiration } = req.body as {
      content: string;
      messageType?: 'text' | 'image' | 'video' | 'file' | 'call';
      encryptedPayload?: string;
      mediaUrl?: string;
      replyTo?: string;
      mediaExpiration?: string;
    };

    const userId = req.user!.userId;

    const isMember = await ChatService.isUserInChat(chatId, userId);
    if (!isMember) return res.status(403).json({ error: 'Not a chat participant' });

    const msg = await MessageService.sendMessage(
      userId,
      chatId,
      content,
      messageType || 'text',
      mediaUrl,
      encryptedPayload,
      replyTo,
      mediaExpiration ? new Date(mediaExpiration) : undefined
    );

    return res.json({ message: msg });
  } catch (err) {
    console.error('Send message error:', err);
    return res.status(500).json({ error: 'Failed to send message' });
  }
});

router.post('/messages/:messageId/read', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const userId = req.user!.userId;
    const receipt = await MessageService.markAsRead(messageId, userId);
    return res.json({ receipt });
  } catch (err) {
    console.error('Mark read error:', err);
    return res.status(500).json({ error: 'Failed to mark read' });
  }
});

router.post('/messages/:messageId/reactions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body as { emoji: string };
    const userId = req.user!.userId;

    if (!emoji || typeof emoji !== 'string') {
      return res.status(400).json({ error: 'emoji is required' });
    }

    const reaction = await MessageService.addReaction(messageId, userId, emoji);
    return res.json({ reaction });
  } catch (err) {
    console.error('Add reaction error:', err);
    return res.status(500).json({ error: 'Failed to react' });
  }
});

export default router;

