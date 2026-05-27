import express from 'express';
import cors from 'cors';

// Import our serverless handlers
import appointmentsHandler from './api/appointments.js';
import appointmentHandler from './api/appointment.js';
import updateAppointmentHandler from './api/update-appointment.js';
import usersHandler from './api/users.js';
import sendEmailHandler from './api/send-email.js';

// MONGODB_URI loading handled automatically by db.js

const app = express();
app.use(cors());
app.use(express.json());

// Helper to wrap Vercel handlers to Express signatures
const vercelWrapper = (handler) => {
  return async (req, res) => {
    try {
      // Vercel handlers expect req.query and req.body, which Express already provides.
      // They also use res.status().json() and res.setHeader() which Express supports natively.
      await handler(req, res);
    } catch (err) {
      console.error('❌ Error executing handler:', err);
      res.status(500).json({ error: 'Internal Server Error', details: err.message });
    }
  };
};

// Mount routes mapped to the API files (as proxied by Vite)
app.all('/appointments', vercelWrapper(appointmentsHandler));
app.all('/appointment', vercelWrapper(appointmentHandler));
app.all('/update-appointment', vercelWrapper(updateAppointmentHandler));
app.all('/users', vercelWrapper(usersHandler));
app.all('/send-email', vercelWrapper(sendEmailHandler));

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🔌 Local Serverless API running at http://localhost:${PORT}`);
});
