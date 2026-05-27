import connectDB from './utils/db.js';
import User from './models/User.js';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    await connectDB();

    // 1. GET USER PROFILE BY UID
    if (req.method === 'GET') {
      const { uid } = req.query;
      if (!uid) {
        return res.status(400).json({ error: 'uid query parameter is required' });
      }

      const user = await User.findOne({ uid });
      if (!user) {
        return res.status(200).json({ exists: false });
      }

      const obj = user.toObject();
      return res.status(200).json({ exists: true, ...obj });
    }

    // 2. CREATE OR UPDATE USER PROFILE
    if (req.method === 'POST') {
      const { uid, name, email, phone, role, doctorId } = req.body || {};

      if (!uid) {
        return res.status(400).json({ error: 'uid is required in request body' });
      }

      const userProfile = await User.findOneAndUpdate(
        { uid },
        { 
          $set: { 
            name, 
            email, 
            phone: phone || '', 
            role: role || 'patient',
            doctorId: doctorId || null
          } 
        },
        { new: true, upsert: true }
      );

      const obj = userProfile.toObject();
      return res.status(200).json({ success: true, ...obj });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    console.error('API Error in /api/users:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
