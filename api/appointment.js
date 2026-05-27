import connectDB from './utils/db.js';
import Appointment from './models/Appointment.js';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'id query parameter is required' });
  }

  try {
    await connectDB();

    if (req.method === 'GET') {
      // Find by _id (if valid ObjectId) or otherwise return 404
      let appointment = null;
      try {
        appointment = await Appointment.findById(id);
      } catch (err) {
        // If not a valid ObjectId, search by dynamic id if needed or fail
      }

      if (!appointment) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      const obj = appointment.toObject();
      return res.status(200).json({ ...obj, id: obj._id.toString() });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    console.error('API Error in /api/appointment:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
