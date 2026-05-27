import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { doctors as defaultDoctors, sampleAppointments, DOCTOR_EMAIL_MAP } from '../data/dummyData';
import toast from 'react-hot-toast';
import { sendBookingConfirmationEmail } from '../utils/emailNotification';
import { createGoogleCalendarEvent, getStoredGoogleToken } from '../utils/googleCalendar';

const GOOGLE_SHEET_URL = import.meta.env.VITE_GOOGLE_SHEET_WEBAPP_URL;

const AppContext = createContext();

export function AppProvider({ children }) {
  const [darkMode, setDarkMode] = useState(false);
  const [language, setLanguageState] = useState(() => localStorage.getItem('i18nextLng') || 'en');
  
  const setLanguage = (lng) => {
    import('../i18n').then((module) => {
      module.default.changeLanguage(lng);
    });
    setLanguageState(lng);
    localStorage.setItem('i18nextLng', lng);
  };
  const [demoMode, setDemoMode] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [doctors] = useState(defaultDoctors);
  const [appointments, setAppointments] = useState([]);
  const [localAppointments, setLocalAppointments] = useState(() => {
    const saved = localStorage.getItem('medi_ai_local_apts');
    return saved ? JSON.parse(saved) : [];
  });
  const [pendingBooking, setPendingBooking] = useState(null);
  const [syncStatus, setSyncStatus] = useState('connecting'); // connecting, synced, error, limited
  const [lastSync, setLastSync] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const [syncTrigger, setSyncTrigger] = useState(0);

  const refreshSync = () => {
    console.log("🔄 [Sync] Manual refresh triggered...");
    setSyncTrigger(prev => prev + 1);
    toast.loading("Refetching data...", { id: 'sync-toast' });
  };

  // Persist local appointments
  useEffect(() => {
    localStorage.setItem('medi_ai_local_apts', JSON.stringify(localAppointments));
  }, [localAppointments]);

  // Combined appointments list - Default sort by bookedAt (newest first for recent actions)
  const allAppointments = [...appointments, ...localAppointments].sort((a, b) => 
    new Date(b.bookedAt || 0) - new Date(a.bookedAt || 0)
  );

  // MongoDB Atlas Sync via Vercel Serverless Function
  useEffect(() => {
    let intervalId;
    const fetchAppointments = async () => {
      try {
        const res = await fetch('/api/appointments');
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const apts = await res.json();
        const now = new Date().toLocaleTimeString();
        setLastSync(now);
        setSyncStatus('synced');
        setSyncError(null);
        setAppointments(apts);
        toast.dismiss('sync-toast');
      } catch (error) {
        console.error("🔥 [Sync] MongoDB fetch error:", error);
        setSyncStatus('error');
        setSyncError(error.message);
        toast.dismiss('sync-toast');
      }
    };

    setSyncStatus('connecting');
    fetchAppointments();

    // Poll every 8 seconds for new bookings
    intervalId = setInterval(fetchAppointments, 8000);

    return () => clearInterval(intervalId);
  }, [syncTrigger]);

  // Auth state listener - this is the primary gate for loading
  useEffect(() => {
    let authResolved = false;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Fetch user profile from MongoDB Atlas via API
        let role = 'patient'; // Default
        let dbPhone = '';
        let dbName = '';
        try {
          const response = await fetch(`/api/users?uid=${user.uid}`);
          if (response.ok) {
            const data = await response.json();
            if (data.exists) {
              role = data.role || 'patient';
              dbPhone = data.phone || '';
              dbName = data.name || '';
            }
          }
        } catch (e) {
          console.error("Error fetching user profile:", e);
        }

        // Check if user is an authorized doctor by email
        const normalizedEmail = (user.email || '').trim().toLowerCase();
        const doctorProfile = doctors.find(d => d.email === normalizedEmail);
        
        if (doctorProfile) {
          role = 'doctor';
        }

        setCurrentUser({
          id: user.uid,
          name: dbName || user.displayName || 'Demo User',
          email: user.email,
          phone: dbPhone || user.phoneNumber || '+91 98765 43210',
          avatar: (dbName || user.displayName || user.email || 'U').charAt(0).toUpperCase(),
          role: role,
          doctorId: doctorProfile?.id || null 
        });
      } else {
        setCurrentUser(null);
      }
      authResolved = true;
      setLoading(false);
    });

    // Safety timeout: if auth doesn't resolve in 5 seconds, stop loading anyway
    // This prevents the white screen if Firebase is misconfigured or unreachable
    const timeout = setTimeout(() => {
      if (!authResolved) {
        console.warn("Auth state took too long to resolve. Proceeding without auth.");
        setLoading(false);
      }
    }, 5000);

    return () => { unsubscribe(); clearTimeout(timeout); };
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }, [darkMode]);

  const login = (userData) => {
    // Legacy support or for manual state updates
    if (userData) setCurrentUser(userData);
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setCurrentUser(null);
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };

  /**
   * Syncs appointment data to Google Sheets via Web App URL
   * @param {Object} data - Appointment data
   */
  const syncToGoogleSheet = async (data) => {
    if (!GOOGLE_SHEET_URL) {
      console.warn("⚠️ Google Sheet Web App URL missing from .env. Sync disabled.");
      return;
    }

    console.log("📡 Attempting to sync booking to Google Sheets...", data.patientName);

    try {
      // Find doctor name for the sheet if not already included
      const doc = doctors.find(d => d.id === data.doctorId);
      const syncData = {
        ...data,
        doctorName: data.doctorName || (doc ? doc.name : 'Unknown Doctor'),
        appointmentType: data.appointmentType || 'Consultation'
      };

      // We use 'text/plain' to keep it as a "Simple Request" and avoid 
      // CORS preflight (OPTIONS) which Google Apps Script doesn't support.
      // mode: 'no-cors' sends the request but we won't see the response content.
      fetch(GOOGLE_SHEET_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(syncData),
      });

      console.log("✅ Sync request sent to Google Sheets (no-cors mode). Check the sheet for data.");
    } catch (error) {
      console.error("❌ Error syncing to Google Sheet:", error);
    }
  };

  const bookAppointment = async (appointmentData) => {
    // Find doctor email if not provided
    let doctorEmail = appointmentData.doctorEmail;
    if (!doctorEmail && appointmentData.doctorId) {
      const doc = doctors.find(d => d.id === appointmentData.doctorId);
      doctorEmail = doc?.email;
    }

    const newAptData = {
      ...appointmentData,
      doctorEmail,
      status: 'pending',
      bookedAt: new Date().toISOString(),
      patientId: currentUser?.id || 'guest',
      patientEmail: currentUser?.email || '',   // store patient email for reference
    };

    // Helper: send confirmation email to patient
    const triggerConfirmationEmail = async (aptResult) => {
      const doctorObj = doctors.find(d => d.id === aptResult.doctorId);
      await sendBookingConfirmationEmail({
        toEmail:         currentUser?.email || '',
        toName:          aptResult.patientName || currentUser?.name || 'Patient',
        doctorName:      doctorObj?.name || aptResult.doctorName || 'Your Doctor',
        specialty:       doctorObj?.specialty || '',
        date:            aptResult.date,
        time:            aptResult.time,
        hospital:        doctorObj?.hospital || '',
        location:        doctorObj?.location || '',
        appointmentType: aptResult.appointmentType,
        symptoms:        aptResult.symptoms,
        bookingId:       aptResult.id,
        fee:             aptResult.fee || doctorObj?.fee,
      });
    };

    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAptData)
      });
      if (!response.ok) throw new Error('Failed to save to MongoDB Atlas');
      const result = await response.json();

      // 1️⃣ SYNC TO GOOGLE SHEET (fire-and-forget)
      syncToGoogleSheet(result);

      // 2️⃣ SEND BREVO CONFIRMATION EMAIL (fire-and-forget)
      triggerConfirmationEmail(result).catch(err =>
        console.error('Email notification error:', err)
      );

      // 3️⃣ AUTO-ADD TO PATIENT'S GOOGLE CALENDAR (fire-and-forget)
      const googleToken = getStoredGoogleToken();
      if (googleToken) {
        const doctorObj = doctors.find(d => d.id === result.doctorId);
        createGoogleCalendarEvent(result, doctorObj, googleToken)
          .then(event => {
            if (event) {
              toast.success(
                '📅 Added to your Google Calendar! Reminder emails set for 24h & 1h before.',
                { duration: 5000, icon: '📧' }
              );
            }
          })
          .catch(err => console.error('Google Calendar sync error:', err));
      }

      toast.success('Appointment booked and synced! 🏥✅');
      return result;
    } catch (e) {
      console.error('Error booking to Firestore:', e);

      // PERSISTENT FALLBACK
      const localId = `local_${Date.now()}`;
      const localApt = { id: localId, ...newAptData, isLocal: true };
      setLocalAppointments(prev => [localApt, ...prev]);

      syncToGoogleSheet(localApt);
      triggerConfirmationEmail(localApt).catch(err =>
        console.error('Email notification error (local):', err)
      );

      // Also try Google Calendar even for local appointments
      const googleToken = getStoredGoogleToken();
      if (googleToken) {
        const doctorObj = doctors.find(d => d.id === localApt.doctorId);
        createGoogleCalendarEvent(localApt, doctorObj, googleToken).catch(console.error);
      }

      if (e.code === 'permission-denied') {
        toast.error('Database access denied! Please check Firestore Rules. 🛡️', { duration: 5000 });
      } else {
        toast.error('Database connection limited. Saved locally! 📱', { duration: 4000 });
      }

      return localApt;
    }
  };

  const cancelAppointment = async (aptId) => {
    const apt = allAppointments.find(a => a.id === aptId);
    if (!apt) return;

    if (aptId.startsWith('local_')) {
      setLocalAppointments(prev => prev.map(a => a.id === aptId ? { ...a, status: 'cancelled' } : a));
    } else {
      try {
        const response = await fetch('/api/update-appointment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: aptId, status: 'cancelled' })
        });
        if (!response.ok) throw new Error('Failed to update status');
        refreshSync();
      } catch (e) {
        console.error("Error cancelling: ", e);
      }
    }
    
    // SYNC UPDATE TO GOOGLE SHEET
    syncToGoogleSheet({ ...apt, status: 'cancelled' });
  };

  const rescheduleAppointment = async (aptId, newDate, newTime) => {
    const apt = allAppointments.find(a => a.id === aptId);
    if (!apt) return;

    if (aptId.startsWith('local_')) {
      setLocalAppointments(prev => prev.map(a => a.id === aptId ? { ...a, date: newDate, time: newTime } : a));
    } else {
      try {
        const response = await fetch('/api/update-appointment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: aptId, date: newDate, time: newTime })
        });
        if (!response.ok) throw new Error('Failed to reschedule');
        refreshSync();
      } catch (e) {
        console.error("Error rescheduling: ", e);
      }
    }

    // SYNC UPDATE TO GOOGLE SHEET
    syncToGoogleSheet({ ...apt, date: newDate, time: newTime });
  };

  const updateAppointmentStatus = async (aptId, newStatus) => {
    const apt = allAppointments.find(a => a.id === aptId);
    if (!apt) return;

    if (aptId.startsWith('local_')) {
      setLocalAppointments(prev => prev.map(a => a.id === aptId ? { ...a, status: newStatus } : a));
    } else {
      try {
        const response = await fetch('/api/update-appointment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: aptId, status: newStatus })
        });
        if (!response.ok) throw new Error('Failed to update status');
        refreshSync();
      } catch (e) {
        console.error("Error updating status: ", e);
      }
    }

    // SYNC UPDATE TO GOOGLE SHEET
    syncToGoogleSheet({ ...apt, status: newStatus });
    
    if (newStatus === 'confirmed') {
      toast.success("Appointment accepted! ✅");
    } else if (newStatus === 'rejected') {
      toast.error("Appointment rejected. ❌");
    }
  };

  const getDoctorById = (id) => doctors.find(d => d.id === id);

  const getUpcomingAppointments = () => {
    // Use local date for "today" comparison to match user's perspective
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    
    const userId = currentUser?.id || 'guest';
    return allAppointments
      .filter(a => a.patientId === userId && (a.date >= todayStr) && a.status !== 'cancelled')
      .sort((a, b) => new Date(a.date + ' ' + (a.time || '00:00')) - new Date(b.date + ' ' + (b.time || '00:00')));
  };

  const getPastAppointments = () => {
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    
    const userId = currentUser?.id || 'guest';
    return allAppointments
      .filter(a => a.patientId === userId && ((a.date < todayStr) || a.status === 'cancelled'))
      .sort((a, b) => new Date(b.date + ' ' + (b.time || '00:00')) - new Date(a.date + ' ' + (a.time || '00:00')));
  };

  // NEW: Dynamically compute doctors with their updated bookedSlots based on real-time appointments
  const doctorsWithSlots = React.useMemo(() => {
    return defaultDoctors.map(doc => {
      // Start with static booked slots from dummyData
      const dynamicBookedSlots = { ...(doc.bookedSlots || {}) };

      // Add actual appointments from DB/Local
      allAppointments.forEach(apt => {
        if (apt.doctorId === doc.id && apt.status !== 'cancelled') {
          if (!dynamicBookedSlots[apt.date]) {
            dynamicBookedSlots[apt.date] = [];
          }
          if (!dynamicBookedSlots[apt.date].includes(apt.time)) {
            dynamicBookedSlots[apt.date].push(apt.time);
          }
        }
      });

      return { ...doc, bookedSlots: dynamicBookedSlots };
    });
  }, [allAppointments]);

  const value = {
    darkMode, setDarkMode,
    language, setLanguage,
    demoMode, setDemoMode,
    currentUser, loading, login, logout,
    doctors: doctorsWithSlots, // Use the dynamic list
    appointments: allAppointments,
    bookAppointment, cancelAppointment, rescheduleAppointment, updateAppointmentStatus,
    pendingBooking, setPendingBooking,
    getDoctorById,
    getUpcomingAppointments, getPastAppointments,
    syncStatus, lastSync, syncError, refreshSync
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
};
