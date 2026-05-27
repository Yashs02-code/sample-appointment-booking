// Direct Firestore imports removed
import toast from 'react-hot-toast';
import SkeletonLoader from '../components/SkeletonLoader';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Calendar, Clock, MapPin, Home, Share2, Download, FileText } from 'lucide-react';
import PageWrapper from '../components/PageWrapper';
import ConfettiWrapper from '../components/ConfettiWrapper';
import NotificationBanner from '../components/NotificationBanner';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

export default function Confirmation() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { darkMode, appointments, getDoctorById, loading: contextLoading, currentUser } = useApp();
  const [showConfetti, setShowConfetti] = useState(true);
  const [localApt, setLocalApt] = useState(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    const fetchApt = async () => {
      // First check local state
      const found = appointments.find(a => a.id === id);
      if (found) {
        setLocalApt(found);
        setFetching(false);
        return;
      }

      // Fallback: fetch directly from MongoDB Atlas API
      try {
        const res = await fetch(`/api/appointment?id=${id}`);
        if (res.ok) {
          const data = await res.json();
          setLocalApt(data);
        }
      } catch (err) {
        console.error("Error fetching appointment:", err);
      } finally {
        setFetching(false);
      }
    };

    fetchApt();
  }, [id, appointments]);

  useEffect(() => {
    if (localApt) {
      toast.success(t('confirmation.booking_success_toast'), { duration: 4000 });
    }
  }, [localApt, t]);

  const apt = localApt;
  const doctor = apt ? getDoctorById(apt.doctorId) : null;

  if (fetching || (contextLoading && !apt)) {
    return (
      <PageWrapper>
        <div style={{ padding: '100px 24px', maxWidth: 540, margin: '0 auto', textAlign: 'center' }}>
          <SkeletonLoader count={1} />
          <p style={{ marginTop: 20, color: '#64748b' }}>{t('confirmation.confirming')}</p>
        </div>
      </PageWrapper>
    );
  }

  if (!apt || !doctor) {
    return (
      <PageWrapper>
        <div style={{ padding: '100px 24px', maxWidth: 540, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 20 }}>❓</div>
          <h2 style={{ color: darkMode ? '#e2e8f0' : '#0f172a' }}>{t('confirmation.not_found')}</h2>
          <p style={{ color: '#64748b', marginTop: 10 }}>{t('confirmation.not_found_desc')}</p>
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/appointments')}
            style={{
              marginTop: 30, padding: '12px 24px', borderRadius: 12, border: 'none',
              background: '#2563eb', color: 'white', fontWeight: 700, cursor: 'pointer'
            }}
          >
            {t('confirmation.go_bookings')}
          </motion.button>
        </div>
      </PageWrapper>
    );
  }

  // 'doctor' variable is already set above

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: t('confirmation.title'),
        text: t('confirmation.banner_push', { doctor: doctor.name, time: apt.time, date: apt.date }),
        url: window.location.href,
      }).catch(console.error);
    } else {
      toast(t('confirmation.copied'));
    }
  };

  const downloadPrescription = async () => {
    const loadingToast = toast.loading(t('confirmation.confirming'));
    try {
      const docPdf = new jsPDF();
      const qrData = window.location.href;
      const qrDataUrl = await QRCode.toDataURL(qrData);

      // --- PDF STYLING ---
      // Primary Color
      const primaryColor = [37, 99, 235]; // #2563eb
      
      // Header: Branding
      docPdf.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      docPdf.rect(0, 0, 210, 40, 'F');
      
      // Clinic Logo Placeholder (Circle with M)
      docPdf.setFillColor(255, 255, 255);
      docPdf.circle(25, 20, 10, 'F');
      docPdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      docPdf.setFontSize(14);
      docPdf.setFont("helvetica", "bold");
      docPdf.text("M", 22, 22);

      // Clinic Info
      docPdf.setTextColor(255, 255, 255);
      docPdf.setFontSize(22);
      docPdf.text("Medi AI Clinic", 40, 22);
      docPdf.setFontSize(10);
      docPdf.setFont("helvetica", "normal");
      docPdf.text("Autonomous Healthcare Orchestration", 40, 30);
      docPdf.text("Phone: +91 8928024884", 150, 30);

      // Prescription Title
      docPdf.setTextColor(0, 0, 0);
      docPdf.setFontSize(18);
      docPdf.setFont("helvetica", "bold");
      docPdf.text(t('confirmation.digital_prescription').toUpperCase(), 105, 55, { align: 'center' });
      
      // Divider
      docPdf.setDrawColor(200, 200, 200);
      docPdf.line(20, 60, 190, 60);

      // Section 1: Patient Details
      docPdf.setFontSize(11);
      docPdf.setTextColor(100, 100, 100);
      docPdf.text(t('confirmation.patient_name'), 20, 75);
      docPdf.setTextColor(0, 0, 0);
      docPdf.setFontSize(13);
      docPdf.text(apt.patientName, 20, 82);

      docPdf.setFontSize(11);
      docPdf.setTextColor(100, 100, 100);
      docPdf.text(t('confirmation.booking_id'), 130, 75);
      docPdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      docPdf.setFontSize(13);
      docPdf.text(id.slice(-8).toUpperCase(), 130, 82);

      // Section 2: Doctor Details
      docPdf.setFontSize(11);
      docPdf.setTextColor(100, 100, 100);
      docPdf.text(t('confirmation.doctor_name'), 20, 100);
      docPdf.setTextColor(0, 0, 0);
      docPdf.setFontSize(13);
      docPdf.text(doctor.name, 20, 107);

      docPdf.setFontSize(11);
      docPdf.setTextColor(100, 100, 100);
      docPdf.text(t('confirmation.specialty'), 130, 100);
      docPdf.setTextColor(0, 0, 0);
      docPdf.setFontSize(13);
      docPdf.text(doctor.specialty, 130, 107);

      // Section 3: Appointment Details
      docPdf.setFontSize(11);
      docPdf.setTextColor(100, 100, 100);
      docPdf.text(t('confirmation.date'), 20, 125);
      docPdf.setTextColor(0, 0, 0);
      docPdf.setFontSize(13);
      docPdf.text(apt.date, 20, 132);

      docPdf.setFontSize(11);
      docPdf.setTextColor(100, 100, 100);
      docPdf.text(t('confirmation.time'), 130, 125);
      docPdf.setTextColor(0, 0, 0);
      docPdf.setFontSize(13);
      docPdf.text(apt.time, 130, 132);

      // Hospital Location
      docPdf.setFontSize(11);
      docPdf.setTextColor(100, 100, 100);
      docPdf.text("Venue", 20, 150);
      docPdf.setTextColor(0, 0, 0);
      docPdf.setFontSize(12);
      docPdf.text(`${doctor.hospital}, ${doctor.location}`, 20, 157);

      // Divider
      docPdf.setDrawColor(200, 200, 200);
      docPdf.line(20, 170, 190, 170);

      // Prescription Body Placeholder
      docPdf.setFontSize(10);
      docPdf.setTextColor(150, 150, 150);
      docPdf.text(t('confirmation.prescription_desc'), 20, 180);

      // QR Code for Verification
      docPdf.setTextColor(0, 0, 0);
      docPdf.setFontSize(10);
      docPdf.text(t('confirmation.verified'), 160, 195, { align: 'center' });
      docPdf.addImage(qrDataUrl, 'PNG', 150, 200, 20, 20);

      // Footer
      docPdf.setFontSize(9);
      docPdf.setTextColor(150, 150, 150);
      const footerText = "This is a computer-generated document and does not require a physical signature.";
      docPdf.text(footerText, 105, 280, { align: 'center' });

      // Save
      docPdf.save(`Prescription_${id.slice(-8).toUpperCase()}.pdf`);
      toast.success(t('confirmation.booking_success_toast'), { id: loadingToast });
    } catch (err) {
      console.error("PDF generation error:", err);
      toast.error("Failed to generate PDF", { id: loadingToast });
    }
  };

  return (
    <PageWrapper>
      {showConfetti && <ConfettiWrapper />}
      <NotificationBanner 
        type="push" 
        message={t('confirmation.banner_push', { doctor: doctor.name, time: apt.time, date: apt.date })} 
        duration={6000}
      />
      <NotificationBanner 
        type="sms" 
        message={t('confirmation.banner_sms', { name: apt.patientName, doctor: doctor.name, hospital: doctor.hospital })} 
        duration={5000}
      />

      <div style={{ padding: '40px 24px', maxWidth: 540, margin: '0 auto', textAlign: 'center' }}>
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 15, stiffness: 100 }}
          style={{
            width: 100, height: 100, borderRadius: '50%',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
            boxShadow: '0 20px 40px rgba(16,185,129,0.3)',
          }}
        >
          <CheckCircle size={56} color="white" />
        </motion.div>

        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          style={{ fontSize: 32, fontWeight: 900, color: darkMode ? '#e2e8f0' : '#0f172a', marginBottom: 12 }}
        >
          {t('confirmation.title')}
        </motion.h1>
        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          style={{ color: '#64748b', fontSize: 16, marginBottom: 40 }}
        >
          {t('confirmation.subtitle')}
        </motion.p>

        {/* Appointment Card */}
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          style={{
            background: darkMode ? 'rgba(20,30,60,0.7)' : 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(30px)',
            borderRadius: 24, padding: 32, textAlign: 'left',
            border: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(148,163,184,0.2)',
            boxShadow: '0 30px 60px rgba(0,0,0,0.1)',
            marginBottom: 32,
          }}
        >
          <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: `linear-gradient(135deg, ${doctor.avatarColor}, ${doctor.avatarColor}88)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: 800, fontSize: 18, flexShrink: 0
            }}>
              {doctor.avatar}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18, color: darkMode ? '#e2e8f0' : '#0f172a' }}>{doctor.name}</div>
              <div style={{ fontSize: 14, color: '#64748b' }}>{doctor.specialty}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Calendar size={18} color="#2563eb" />
              <div style={{ fontSize: 15, fontWeight: 600, color: darkMode ? '#cbd5e1' : '#475569' }}>{apt.date}</div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Clock size={18} color="#10b981" />
              <div style={{ fontSize: 15, fontWeight: 600, color: darkMode ? '#cbd5e1' : '#475569' }}>{apt.time}</div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <MapPin size={18} color="#ef4444" />
              <div style={{ fontSize: 15, fontWeight: 600, color: darkMode ? '#cbd5e1' : '#475569' }}>{doctor.hospital}, {doctor.location}</div>
            </div>
          </div>

            <div style={{
              marginTop: 28, padding: '16px 20px', borderRadius: 16,
              background: darkMode ? 'rgba(37,99,235,0.1)' : 'rgba(37,99,235,0.05)',
              border: apt?.isLocal ? '1px dashed #10b981' : '1px dashed #2563eb',
              position: 'relative'
            }}>
              {apt?.isLocal && (
                <div style={{
                  position: 'absolute', top: -10, right: 10,
                  background: '#10b981', color: 'white',
                  padding: '2px 10px', borderRadius: 10,
                  fontSize: 10, fontWeight: 900, textTransform: 'uppercase'
                }}>Local Demo Mode</div>
              )}
              <div style={{ fontSize: 11, color: apt?.isLocal ? '#10b981' : '#2563eb', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{t('confirmation.booking_id')}</div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '2px', color: darkMode ? '#e2e8f0' : (apt?.isLocal ? '#10b981' : '#2563eb') }}>{id.slice(-8).toUpperCase()}</div>
            </div>
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div style={{ display: 'flex', gap: 12 }}>
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/home')}
              style={{
                flex: 1, padding: '16px', borderRadius: 16, border: 'none',
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: 'white', fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: '0 10px 30px rgba(37,99,235,0.3)',
              }}
            >
              <Home size={18} /> {t('confirmation.go_dashboard')}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={handleShare}
              style={{
                width: 56, height: 56, borderRadius: 16,
                background: darkMode ? 'rgba(255,255,255,0.08)' : 'white',
                border: darkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(148,163,184,0.3)',
                color: darkMode ? '#e2e8f0' : '#475569',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            >
              <Share2 size={20} />
            </motion.button>
          </div>

          {/* ── Smart Scheduling Status Card (patients only) ── */}
          {/* ── Smart Scheduling Status Card (patients only) ── */}
          {currentUser?.role === 'patient' && (
            <div style={{
              borderRadius: 20,
              border: darkMode ? '1px solid rgba(255,215,0,0.3)' : '1px solid rgba(255,215,0,0.2)',
              background: darkMode ? 'rgba(255,215,0,0.05)' : 'rgba(255,215,0,0.03)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              textAlign: 'center'
            }}>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: '#10b981', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(16,185,129,0.3)'
                }}>
                   <Calendar size={20} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: darkMode ? '#fcd34d' : '#854d0e' }}>
                    Auto-Scheduled! ⚡
                  </div>
                  <div style={{ fontSize: 12, color: darkMode ? '#94a3b8' : '#64748b', fontWeight: 500 }}>
                    Synced to your Google Calendar
                  </div>
                </div>
              </div>

              <div style={{
                background: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.6)',
                padding: '12px', borderRadius: 12,
                fontSize: 12, color: darkMode ? '#cbd5e1' : '#475569',
                lineHeight: 1.5, border: darkMode ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(0,0,0,0.05)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, justifyContent: 'center' }}>
                  <span style={{ fontSize: 14 }}>📧</span> 
                  <strong>Automatic Reminders Set:</strong>
                </div>
                Detailed confirmation sent to <strong>{currentUser?.email}</strong>. Reminders set for 24h & 1h before visit.
              </div>
            </div>
          )}
          
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={downloadPrescription}
            style={{
              padding: '16px', borderRadius: 16, border: darkMode ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(16,185,129,0.2)',
              background: darkMode ? 'rgba(16,185,129,0.1)' : 'rgba(16,185,129,0.05)',
              color: '#10b981', fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Download size={18} /> {t('confirmation.download_prescription')}
          </motion.button>
        </motion.div>
      </div>
    </PageWrapper>
  );
}
