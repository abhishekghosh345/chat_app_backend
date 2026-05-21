import pool from '../db/connection';
import { Message, MessageReaction, ReadReceipt } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class MessageService {
  static async sendMessage(
    senderId: string,
    chatId: string,
    content: string,
    messageType: 'text' | 'image' | 'video' | 'file' | 'call' = 'text',
    mediaUrl?: string,
    encryptedPayload?: string,
    replyToMessageId?: string,
    mediaExpiration?: Date
  ): Promise<Message> {
    const id = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    if (['image', 'video', 'file'].includes(messageType) && !mediaExpiration) {
      mediaExpiration = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    const result = await pool.query(
      `INSERT INTO messages (id, sender_id, chat_id, content, encrypted_payload, reply_to, message_type, media_url, media_expiration, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        id,
        senderId,
        chatId,
        content,
        encryptedPayload || null,
        replyToMessageId || null,
        messageType,
        mediaUrl || null,
        mediaExpiration || null,
        expiresAt,
      ]
    );

    // Update chat timestamp
    await pool.query('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [chatId]);

    return result.rows[0];
  }

  static async getMessagesByChat(
    chatId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Message[]> {
    const result = await pool.query(
      `SELECT * FROM messages 
       WHERE chat_id = $1 AND is_deleted = false AND expires_at > CURRENT_TIMESTAMP
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [chatId, limit, offset]
    );

    return result.rows.reverse();
  }

  static async getMessageById(messageId: string): Promise<Message | null> {
    const result = await pool.query(
      'SELECT * FROM messages WHERE id = $1 AND is_deleted = false AND expires_at > CURRENT_TIMESTAMP',
      [messageId]
    );
    return result.rows[0] || null;
  }

  static async deleteMessage(messageId: string): Promise<void> {
    await pool.query('UPDATE messages SET is_deleted = true WHERE id = $1', [messageId]);
  }

  static async addReaction(
    messageId: string,
    userId: string,
    emoji: string
  ): Promise<MessageReaction> {
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO message_reactions (id, message_id, user_id, emoji)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (message_id, user_id, emoji) DO NOTHING
       RETURNING *`,
      [id, messageId, userId, emoji]
    );

    if (result.rows.length === 0) {
      // Already exists, fetch it
      const existing = await pool.query(
        `SELECT * FROM message_reactions 
         WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
        [messageId, userId, emoji]
      );
      return existing.rows[0];
    }

    return result.rows[0];
  }

  static async removeReaction(messageId: string, userId: string, emoji: string): Promise<void> {
    await pool.query(
      `DELETE FROM message_reactions 
       WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [messageId, userId, emoji]
    );
  }

  static async getMessageReactions(messageId: string): Promise<MessageReaction[]> {
    const result = await pool.query(
      `SELECT * FROM message_reactions WHERE message_id = $1`,
      [messageId]
    );

    return result.rows;
  }

  static async markAsRead(messageId: string, userId: string): Promise<ReadReceipt> {
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO read_receipts (id, message_id, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id) DO NOTHING
       RETURNING *`,
      [id, messageId, userId]
    );

    if (result.rows.length === 0) {
      const existing = await pool.query(
        `SELECT * FROM read_receipts WHERE message_id = $1 AND user_id = $2`,
        [messageId, userId]
      );
      return existing.rows[0];
    }

    return result.rows[0];
  }

  static async getReadReceipts(messageId: string): Promise<ReadReceipt[]> {
    const result = await pool.query(
      `SELECT * FROM read_receipts WHERE message_id = $1`,
      [messageId]
    );

    return result.rows;
  }

  static async deleteExpiredMessages(): Promise<number> {
    const result = await pool.query(
      `UPDATE messages SET is_deleted = true 
       WHERE expires_at < CURRENT_TIMESTAMP AND is_deleted = false`
    );

    return result.rowCount || 0;
  }

  static async permanentlyDeleteExpiredMessages(): Promise<number> {
    const result = await pool.query(
      `DELETE FROM messages WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '1 hour'`
    );

    return result.rowCount || 0;
  }

  static async cleanupExpiredMedia(): Promise<number> {
    const result = await pool.query(
      `UPDATE messages SET media_url = NULL 
       WHERE media_expiration IS NOT NULL 
       AND media_expiration < CURRENT_TIMESTAMP`
    );

    return result.rowCount || 0;
  }
}
