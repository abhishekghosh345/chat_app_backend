import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { UserService } from '../services/UserService';

const router = Router();

router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await UserService.getUserById(req.user!.userId);
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
      lastSeen: user.last_seen,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.patch('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const updates = {
      display_name: req.body.displayName,
      bio: req.body.bio,
      profile_picture_url: req.body.profilePictureUrl,
    };

    const user = await UserService.updateUserProfile(req.user!.userId, updates);
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
      lastSeen: user.last_seen,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.post('/me/password', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword) {
      return res.status(400).json({ error: 'oldPassword is required' });
    }

    if (!newPassword) {
      return res.status(400).json({ error: 'newPassword is required' });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const oldValid = await UserService.verifyPassword(req.user!.userId, oldPassword);
    if (!oldValid) {
      return res.status(401).json({ error: 'Old password is incorrect' });
    }

    await UserService.updatePassword(req.user!.userId, newPassword);

    return res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ error: 'Failed to update password' });
  }
});


router.get('/search', authMiddleware, async (req: Request, res: Response) => {
  try {
    const query = String(req.query.q || '');
    if (!query.trim()) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }

    const users = await UserService.searchUsers(query);
    return res.json({ users });
  } catch (error) {
    console.error('Search users error:', error);
    return res.status(500).json({ error: 'Failed to search users' });
  }
});

router.get('/:userId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await UserService.getUserById(req.params.userId);
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
      lastSeen: user.last_seen,
    });
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;
