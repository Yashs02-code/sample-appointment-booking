import mongoose from 'mongoose';

const AppointmentSchema = new mongoose.Schema({
  patientId: { type: String, required: true },
  patientName: { type: String, required: true },
  patientEmail: { type: String, default: '' },
  doctorId: { type: String, required: true },
  doctorName: { type: String, default: '' },
  doctorEmail: { type: String, default: '' },
  date: { type: String, required: true }, // Format: YYYY-MM-DD
  time: { type: String, required: true }, // Format: HH:MM
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'rejected', 'cancelled'], 
    default: 'pending' 
  },
  appointmentType: { type: String, default: 'Consultation' },
  symptoms: { type: String, default: '' },
  fee: { type: Number },
  bookedAt: { type: Date, default: Date.now }
});

export default mongoose.models.Appointment || mongoose.model('Appointment', AppointmentSchema);
