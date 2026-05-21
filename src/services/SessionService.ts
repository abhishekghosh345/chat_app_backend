import pool from '../db/connection';
import { Session } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class SessionService {
  static async createSession(
    userId: string,
    refreshToken: string,
    sessionId?: string,
    deviceName?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<Session> {
    const id = sessionId || uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const result = await pool.query(
      `INSERT INTO sessions (id, user_id, refresh_token, device_name, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, userId, refreshToken, deviceName, ipAddress, userAgent, expiresAt]
    );

    return result.rows[0];
  }

  static async getSessionByRefreshToken(refreshToken: string): Promise<Session | null> {
    const result = await pool.query(
      'SELECT * FROM sessions WHERE refresh_token = $1 AND expires_at > CURRENT_TIMESTAMP',
      [refreshToken]
    );
    return result.rows[0] || null;
  }

  static async getSessionById(sessionId: string): Promise<Session | null> {
    const result = await pool.query(
      'SELECT * FROM sessions WHERE id = $1 AND expires_at > CURRENT_TIMESTAMP',
      [sessionId]
    );
    return result.rows[0] || null;
  }

  static async getUserSessions(userId: string): Promise<Session[]> {
    const result = await pool.query(
      'SELECT * FROM sessions WHERE user_id = $1 AND expires_at > CURRENT_TIMESTAMP ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  static async deleteSession(sessionId: string): Promise<void> {
    await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
  }

  static async updateSessionRefreshToken(sessionId: string, refreshToken: string): Promise<void> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await pool.query(
      'UPDATE sessions SET refresh_token = $1, expires_at = $2 WHERE id = $3',
      [refreshToken, expiresAt, sessionId]
    );
  }

  static async deleteAllUserSessions(userId: string): Promise<void> {
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  }

  static async deleteExpiredSessions(): Promise<number> {
    const result = await pool.query('DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP');
    return result.rowCount || 0;
  }
}
