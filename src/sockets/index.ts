import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/auth';
import { MessageService } from '../services/MessageService';
import { ChatService } from '../services/ChatService';
import { CallService } from '../services/CallService';
import { UserService } from '../services/UserService';

const presenceCounts = new Map<string, number>();

async function setUserOnline(userId: string, io: SocketIOServer) {
  const count = (presenceCounts.get(userId) || 0) + 1;
  presenceCounts.set(userId, count);

  if (count === 1) {
    await UserService.setUserOnlineStatus(userId, true);
    const chats = await ChatService.getUserChats(userId);
    chats.forEach((chat) => io.to(`chat:${chat.id}`).emit('online_status', { userId, isOnline: true }));
  }
}

async function setUserOffline(userId: string, io: SocketIOServer) {
  const count = (presenceCounts.get(userId) || 0) - 1;
  if (count <= 0) {
    presenceCounts.delete(userId);
    await UserService.setUserOnlineStatus(userId, false);
    const chats = await ChatService.getUserChats(userId);
    chats.forEach((chat) => io.to(`chat:${chat.id}`).emit('online_status', { userId, isOnline: false }));
  } else {
    presenceCounts.set(userId, count);
  }
}

export function attachSocketHandlers(httpServer: HttpServer) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || process.env.CLIENT_URL || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.use((socket: Socket, next: (err?: Error) => void) => {
    try {
      const accessToken = socket.handshake.auth?.accessToken;
      if (!accessToken || typeof accessToken !== 'string') {
        return next(new Error('Missing accessToken'));
      }

      const payload = verifyAccessToken(accessToken);
      if (!payload) {
        return next(new Error('Invalid accessToken'));
      }

      (socket as any).user = payload;
      next();
    } catch (err) {
      next(new Error('Socket auth failed'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const payload = (socket as any).user as { userId: string } | undefined;
    const userId = payload?.userId;

    if (!userId) {
      socket.disconnect(true);
      return;
    }

    socket.join(`user:${userId}`);
    await setUserOnline(userId, io);
    socket.emit('connected', { userId });

    socket.on('chat_join', async (data: any) => {
      const chatId = data?.chatId;
      if (!chatId || typeof chatId !== 'string') return;

      const isMember = await ChatService.isUserInChat(chatId, userId);
      if (!isMember) return;

      socket.join(`chat:${chatId}`);
    });

    socket.on('typing', async (data: any) => {
      const chatId = data?.chatId;
      const isTyping = !!data?.isTyping;
      if (!chatId || typeof chatId !== 'string') return;

      const isMember = await ChatService.isUserInChat(chatId, userId);
      if (!isMember) return;

      io.to(`chat:${chatId}`).emit('typing', {
        chatId,
        userId,
        isTyping,
        timestamp: Date.now(),
      });
    });

    socket.on('message_send', async (data: any) => {
      const chatId = data?.chatId;
      const content = data?.content;
      const messageType = data?.messageType || 'text';
      const encryptedPayload = data?.encryptedPayload;
      const mediaUrl = data?.mediaUrl;
      const replyTo = data?.replyTo;
      const mediaExpiration = data?.mediaExpiration ? new Date(data.mediaExpiration) : undefined;

      if (!chatId || typeof chatId !== 'string') return;
      if (typeof content !== 'string') return;

      const isMember = await ChatService.isUserInChat(chatId, userId);
      if (!isMember) return;

      const message = await MessageService.sendMessage(
        userId,
        chatId,
        content,
        messageType,
        mediaUrl,
        encryptedPayload,
        replyTo,
        mediaExpiration
      );

      io.to(`chat:${chatId}`).emit('message_receive', {
        chatId,
        message,
      });
    });

    socket.on('message_read', async (data: any) => {
      const messageId = data?.messageId;
      if (!messageId || typeof messageId !== 'string') return;
      if (!data?.chatId) return;

      await MessageService.markAsRead(messageId, userId);
      io.to(`chat:${data.chatId}`).emit('message_read', {
        chatId: data.chatId,
        messageId,
        userId,
      });
    });

    socket.on('reaction', async (data: any) => {
      const { messageId, emoji, chatId } = data || {};
      if (!messageId || !emoji || !chatId) return;

      const reaction = await MessageService.addReaction(messageId, userId, emoji);
      io.to(`chat:${chatId}`).emit('reaction_update', { chatId, reaction });
    });

    socket.on('call_offer', async (data: any) => {
      const { chatId, callType, offer, receiverId } = data || {};
      if (!chatId || !callType || !offer) return;

      const call = await CallService.createCallRecord(userId, receiverId, callType);
      io.to(`chat:${chatId}`).emit('call_offer', {
        chatId,
        call,
        offer,
      });
    });

    socket.on('call_answer', async (data: any) => {
      const { chatId, callId, answer } = data || {};
      if (!chatId || !callId || !answer) return;

      await CallService.updateCallStatus(callId, 'active');
      io.to(`chat:${chatId}`).emit('call_answer', { chatId, callId, answer });
    });

    socket.on('call_end', async (data: any) => {
      const { chatId, callId, durationSeconds } = data || {};
      if (!chatId || !callId) return;

      await CallService.updateCallStatus(callId, 'ended', durationSeconds);
      io.to(`chat:${chatId}`).emit('call_end', { chatId, callId, durationSeconds });
    });

    socket.on('ice_candidate', async (data: any) => {
      const { chatId, candidate } = data || {};
      if (!chatId || !candidate) return;
      
      // Relay the ICE candidate to the other participants in the chat
      socket.to(`chat:${chatId}`).emit('ice_candidate', { chatId, candidate, userId });
    });

    socket.on('screen_share_start', (data: any) => {
      const chatId = data?.chatId;
      if (!chatId) return;
      socket.to(`chat:${chatId}`).emit('screen_share_start', { chatId, userId });
    });

    socket.on('screen_share_stop', (data: any) => {
      const chatId = data?.chatId;
      if (!chatId) return;
      socket.to(`chat:${chatId}`).emit('screen_share_stop', { chatId, userId });
    });

    socket.on('disconnect', async () => {
      await setUserOffline(userId, io);
    });
  });

  return io;
}

