import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { UserService } from '../services/UserService';
import { SessionService } from '../services/SessionService';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, verifyPassword } from '../utils/auth';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Register endpoint
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, password, displayName } = req.body;

    // Validation
    if (!username || !password || !displayName) {
      return res.status(400).json({ error: 'Username, password, and displayName are required' });
    }

    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({ error: 'Username must be between 3 and 30 characters' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if user exists
    const existingUser = await UserService.getUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    // Create user
    const user = await UserService.createUser(username, password, displayName);

    // Create session
    const sessionId = crypto.randomUUID ? crypto.randomUUID() : require('uuid').v4();
    const refreshToken = generateRefreshToken({
      userId: user.id,
      username: user.username,
      sessionId,
    });

    await SessionService.createSession(
      user.id,
      refreshToken,
      sessionId,
      String(req.headers['user-agent'] || '').split(' ')[0],
      req.ip || req.connection.remoteAddress,
      String(req.headers['user-agent'] || '')
    );

    const accessToken = generateAccessToken({
      userId: user.id,
      username: user.username,
      sessionId,
    });

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        profilePictureUrl: user.profile_picture_url,
        bio: user.bio,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

// Login endpoint
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Get user
    const user = await UserService.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Verify password
    const passwordValid = await verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Create session
    const sessionId = crypto.randomUUID ? crypto.randomUUID() : require('uuid').v4();
    const refreshToken = generateRefreshToken({
      userId: user.id,
      username: user.username,
      sessionId,
    });

    await SessionService.createSession(
      user.id,
      refreshToken,
      sessionId,
      String(req.headers['user-agent'] || '').split(' ')[0],
      req.ip || req.connection.remoteAddress,
      String(req.headers['user-agent'] || '')
    );

    const accessToken = generateAccessToken({
      userId: user.id,
      username: user.username,
      sessionId,
    });

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        profilePictureUrl: user.profile_picture_url,
        bio: user.bio,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// Refresh token endpoint
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Verify session exists
    const session = await SessionService.getSessionByRefreshToken(refreshToken);
    if (!session) {
      return res.status(401).json({ error: 'Session not found' });
    }

    // Rotate refresh token for improved session security
    const newRefreshToken = generateRefreshToken({
      userId: payload.userId,
      username: payload.username,
      sessionId: payload.sessionId,
    });

    await SessionService.updateSessionRefreshToken(payload.sessionId, newRefreshToken);

    const accessToken = generateAccessToken({
      userId: payload.userId,
      username: payload.username,
      sessionId: payload.sessionId,
    });

    return res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (error) {
    console.error('Refresh error:', error);
    return res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Session management endpoints
router.get('/sessions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const sessions = await SessionService.getUserSessions(req.user!.userId);
    return res.json({ sessions });
  } catch (error) {
    console.error('Get sessions error:', error);
    return res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

router.delete('/sessions/:sessionId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    await SessionService.deleteSession(sessionId);
    return res.json({ message: 'Session revoked' });
  } catch (error) {
    console.error('Revoke session error:', error);
    return res.status(500).json({ error: 'Failed to revoke session' });
  }
});

router.post('/revoke', authMiddleware, async (req: Request, res: Response) => {
  try {
    await SessionService.deleteAllUserSessions(req.user!.userId);
    return res.json({ message: 'All sessions revoked' });
  } catch (error) {
    console.error('Revoke all sessions error:', error);
    return res.status(500).json({ error: 'Failed to revoke sessions' });
  }
});

// Logout endpoint
router.post('/logout', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (req.sessionId) {
      await SessionService.deleteSession(req.sessionId);
    }

    return res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ error: 'Logout failed' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await UserService.getUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      profilePictureUrl: user.profile_picture_url,
      bio: user.bio,
      isOnline: user.is_online,
    });
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;
