import pool from '../db/connection';
import { Call } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class CallService {
  static async createCallRecord(
    initiatorId: string,
    receiverId: string | undefined,
    callType: 'voice' | 'video'
  ): Promise<Call> {
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO calls (id, initiator_id, receiver_id, call_type, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [id, initiatorId, receiverId || null, callType]
    );

    return result.rows[0];
  }

  static async updateCallStatus(callId: string, status: 'pending' | 'active' | 'ended' | 'missed', durationSeconds?: number): Promise<Call | null> {
    const updates: string[] = ['status = $2'];
    const values: any[] = [callId, status];
    let param = 3;

    if (status === 'active') {
      updates.push(`started_at = CURRENT_TIMESTAMP`);
    }

    if (status === 'ended') {
      updates.push(`ended_at = CURRENT_TIMESTAMP`);
    }

    if (typeof durationSeconds === 'number') {
      updates.push(`duration_seconds = $${param++}`);
      values.push(durationSeconds);
    }

    const result = await pool.query(
      `UPDATE calls SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );

    return result.rows[0] || null;
  }

  static async getCallsByUser(userId: string): Promise<Call[]> {
    const result = await pool.query(
      `SELECT * FROM calls
       WHERE initiator_id = $1 OR receiver_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );
    return result.rows;
  }
}
