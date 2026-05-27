import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true }, // Firebase UID
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, default: '' },
  role: { type: String, enum: ['patient', 'doctor', 'admin'], default: 'patient' },
  doctorId: { type: String, default: null }, // If role is doctor, link their doctor ID
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.User || mongoose.model('User', UserSchema);
