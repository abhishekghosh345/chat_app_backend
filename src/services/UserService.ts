import pool from '../db/connection';
import { User } from '../types';
import { hashPassword, verifyPassword } from '../utils/auth';
import { v4 as uuidv4 } from 'uuid';

export class UserService {
  static async getUserById(userId: string): Promise<User | null> {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    return result.rows[0] || null;
  }

  static async getUserByUsername(username: string): Promise<User | null> {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return result.rows[0] || null;
  }

  static async createUser(
    username: string,
    password: string,
    displayName: string
  ): Promise<User> {
    const id = uuidv4();
    const passwordHash = await hashPassword(password);

    const result = await pool.query(
      `INSERT INTO users (id, username, display_name, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, username, displayName, passwordHash]
    );

    return result.rows[0];
  }

  static async updateUserProfile(
    userId: string,
    updates: {
      display_name?: string;
      bio?: string;
      profile_picture_url?: string;
    }
  ): Promise<User | null> {
    const fields: string[] = [];
    const values: any[] = [userId];
    let paramCount = 2;

    if (updates.display_name !== undefined) {
      fields.push(`display_name = $${paramCount++}`);
      values.push(updates.display_name);
    }

    if (updates.bio !== undefined) {
      fields.push(`bio = $${paramCount++}`);
      values.push(updates.bio);
    }

    if (updates.profile_picture_url !== undefined) {
      fields.push(`profile_picture_url = $${paramCount++}`);
      values.push(updates.profile_picture_url);
    }

    if (fields.length === 0) return this.getUserById(userId);

    fields.push(`updated_at = CURRENT_TIMESTAMP`);

    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );

    return result.rows[0] || null;
  }

  static async setUserOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
    await pool.query(
      `UPDATE users SET is_online = $1, last_seen = CURRENT_TIMESTAMP WHERE id = $2`,
      [isOnline, userId]
    );
  }

  static async getUsersOnlineStatus(userIds: string[]): Promise<{ [key: string]: boolean }> {
    if (userIds.length === 0) return {};

    const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await pool.query(
      `SELECT id, is_online FROM users WHERE id IN (${placeholders})`,
      userIds
    );

    const statusMap: { [key: string]: boolean } = {};
    result.rows.forEach((row: { id: string; is_online: boolean }) => {
      statusMap[row.id] = row.is_online;
    });

    return statusMap;
  }

  static async searchUsers(query: string, limit: number = 20): Promise<User[]> {
    const result = await pool.query(
      `SELECT id, username, display_name, profile_picture_url, bio, is_online, last_seen, created_at, updated_at
       FROM users
       WHERE username ILIKE $1 OR display_name ILIKE $1
       LIMIT $2`,
      [`%${query}%`, limit]
    );

    return result.rows;
  }

  static async verifyPassword(userId: string, password: string): Promise<boolean> {
    const user = await this.getUserById(userId);
    if (!user) return false;
    return verifyPassword(password, user.password_hash);
  }

  static async updatePassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await hashPassword(newPassword);
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, userId]
    );
  }
}
