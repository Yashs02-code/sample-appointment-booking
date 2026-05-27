import connectDB from './utils/db.js';
import Appointment from './models/Appointment.js';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { id, status, date, time } = req.body || {};

  if (!id) {
    return res.status(400).json({ error: 'id is required in request body' });
  }

  try {
    await connectDB();

    const updateFields = {};
    if (status !== undefined) updateFields.status = status;
    if (date !== undefined) updateFields.date = date;
    if (time !== undefined) updateFields.time = time;

    const updatedApt = await Appointment.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true } // Return the updated document
    );

    if (!updatedApt) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const obj = updatedApt.toObject();
    return res.status(200).json({ ...obj, id: obj._id.toString() });
  } catch (error) {
    console.error('API Error in /api/update-appointment:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
