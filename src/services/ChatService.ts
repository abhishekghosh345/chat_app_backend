import pool from '../db/connection';
import { Chat, ChatParticipant, Group } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class ChatService {
  // Direct message chats
  static async getOrCreateDirectChat(userId1: string, userId2: string): Promise<Chat> {
    // Check if direct chat exists
    const existing = await pool.query(
      `SELECT c.* FROM chats c
       JOIN chat_participants cp1 ON c.id = cp1.chat_id AND cp1.user_id = $1
       JOIN chat_participants cp2 ON c.id = cp2.chat_id AND cp2.user_id = $2
       WHERE c.chat_type = 'direct'
       LIMIT 1`,
      [userId1, userId2]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    // Create new chat
    return this.createDirectChat(userId1, userId2);
  }

  static async createDirectChat(userId1: string, userId2: string): Promise<Chat> {
    const chatId = uuidv4();

    const result = await pool.query(
      `INSERT INTO chats (id, chat_type, created_by)
       VALUES ($1, 'direct', $2)
       RETURNING *`,
      [chatId, userId1]
    );

    const chat = result.rows[0];

    // Add both participants
    await pool.query(
      `INSERT INTO chat_participants (chat_id, user_id)
       VALUES ($1, $2), ($1, $3)`,
      [chatId, userId1, userId2]
    );

    return chat;
  }

  // Group chats
  static async createGroupChat(
    name: string,
    description: string | undefined,
    ownerId: string,
    memberIds: string[]
  ): Promise<{ chat: Chat; group: Group }> {
    const chatId = uuidv4();
    const groupId = uuidv4();

    const chatResult = await pool.query(
      `INSERT INTO chats (id, chat_type, created_by)
       VALUES ($1, 'group', $2)
       RETURNING *`,
      [chatId, ownerId]
    );

    const chat = chatResult.rows[0];

    const groupResult = await pool.query(
      `INSERT INTO groups (id, chat_id, name, description, owner_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [groupId, chatId, name, description, ownerId]
    );

    const group = groupResult.rows[0];

    // Add members safely with parameterized values
    const participants = Array.from(new Set([ownerId, ...memberIds]));
    const placeholders: string[] = [];
    const values: any[] = [];

    participants.forEach((userId) => {
      placeholders.push(`($${values.length + 1}, $${values.length + 2}, $${values.length + 3})`);
      values.push(uuidv4(), chatId, userId);
    });

    if (placeholders.length > 0) {
      await pool.query(
        `INSERT INTO chat_participants (id, chat_id, user_id) VALUES ${placeholders.join(',')}`,
        values
      );
    }

    return { chat, group };
  }

  static async getUserChats(userId: string): Promise<Chat[]> {
    const result = await pool.query(
      `SELECT DISTINCT c.id, c.chat_type, c.created_by, c.created_at, c.updated_at,
               COALESCE(g.name, c.name) as name
       FROM chats c
       LEFT JOIN groups g ON c.id = g.chat_id
       JOIN chat_participants cp ON c.id = cp.chat_id
       WHERE cp.user_id = $1 AND cp.left_at IS NULL
       ORDER BY c.updated_at DESC`,
      [userId]
    );

    return result.rows;
  }

  static async getChatById(chatId: string): Promise<Chat | null> {
    const result = await pool.query(
      `SELECT c.id, c.chat_type, c.created_by, c.created_at, c.updated_at,
              COALESCE(g.name, c.name) as name
       FROM chats c
       LEFT JOIN groups g ON c.id = g.chat_id
       WHERE c.id = $1`,
      [chatId]
    );
    return result.rows[0] || null;
  }

  static async getChatParticipants(chatId: string): Promise<any[]> {
    const result = await pool.query(
      `SELECT u.id, u.username, u.display_name, u.profile_picture_url, u.bio, u.is_online, u.last_seen 
       FROM chat_participants cp
       JOIN users u ON cp.user_id = u.id
       WHERE cp.chat_id = $1 AND cp.left_at IS NULL
       ORDER BY cp.joined_at ASC`,
      [chatId]
    );

    return result.rows;
  }

  static async addParticipantToChat(chatId: string, userId: string): Promise<ChatParticipant> {
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO chat_participants (id, chat_id, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (chat_id, user_id) DO UPDATE 
       SET left_at = NULL
       RETURNING *`,
      [id, chatId, userId]
    );

    return result.rows[0];
  }

  static async removeParticipantFromChat(chatId: string, userId: string): Promise<void> {
    await pool.query(
      `UPDATE chat_participants 
       SET left_at = CURRENT_TIMESTAMP 
       WHERE chat_id = $1 AND user_id = $2`,
      [chatId, userId]
    );
  }

  static async getGroupById(groupId: string): Promise<Group | null> {
    const result = await pool.query('SELECT * FROM groups WHERE id = $1', [groupId]);
    return result.rows[0] || null;
  }

  static async updateGroupInfo(
    groupId: string,
    updates: {
      name?: string;
      description?: string;
      icon_url?: string;
    }
  ): Promise<Group | null> {
    const fields: string[] = [];
    const values: any[] = [groupId];
    let paramCount = 2;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(updates.name);
    }

    if (updates.description !== undefined) {
      fields.push(`description = $${paramCount++}`);
      values.push(updates.description);
    }

    if (updates.icon_url !== undefined) {
      fields.push(`icon_url = $${paramCount++}`);
      values.push(updates.icon_url);
    }

    if (fields.length === 0) return this.getGroupById(groupId);

    fields.push('updated_at = CURRENT_TIMESTAMP');

    const result = await pool.query(
      `UPDATE groups SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );

    return result.rows[0] || null;
  }

  static async isUserInChat(chatId: string, userId: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT 1 FROM chat_participants 
       WHERE chat_id = $1 AND user_id = $2 AND left_at IS NULL
       LIMIT 1`,
      [chatId, userId]
    );

    return result.rows.length > 0;
  }
}
