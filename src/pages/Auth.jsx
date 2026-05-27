import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Eye, EyeOff, Mail, Lock, User, Phone, AlertCircle } from 'lucide-react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { GoogleAuthProvider } from 'firebase/auth';
import { useApp } from '../context/AppContext';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ALLOWED_DOCTOR_EMAILS } from '../data/dummyData';
import { saveGoogleAccessToken } from '../utils/googleCalendar';

export default function Auth() {
  const { t } = useTranslation();
  const { darkMode } = useApp();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [role, setRole] = useState('patient');
  const [showRoleSelection, setShowRoleSelection] = useState(false);
  const [googleUser, setGoogleUser] = useState(null);
  const [phoneTouched, setPhoneTouched] = useState(false);

  // ------- Phone validation helper -------
  const isPhoneValid = (p) => /^[0-9]{10}$/.test(p);
  const phoneError = phoneTouched && !isPhoneValid(form.phone);

  // Handle phone input: digits only, max 10
  const handlePhoneChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
    setForm({ ...form, phone: digits });
  };

  // ------- getRedirectResult: catch Google redirect on page load -------
  useEffect(() => {
    const handleRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (!result) return;
        const user = result.user;

        // Save Google OAuth token for Calendar API
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) saveGoogleAccessToken(credential.accessToken);

        setLoading(true);
        const res = await fetch(`/api/users?uid=${user.uid}`);
        const userProfile = res.ok ? await res.json() : { exists: false };
        if (!userProfile.exists) {
          setGoogleUser(user);
          setShowRoleSelection(true);
        } else {
          toast.success(t('auth.google_success'));
          navigate(userProfile.role === 'doctor' ? '/doctor-dashboard' : '/home');
        }
      } catch (err) {
        if (err.code !== 'auth/no-current-user') {
          console.error('Redirect result error:', err);
        }
      } finally {
        setLoading(false);
      }
    };
    handleRedirectResult();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate phone for registration
    if (mode === 'register') {
      setPhoneTouched(true);
      if (!isPhoneValid(form.phone)) {
        toast.error('Please enter a valid 10-digit mobile number.');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, form.email, form.password);
        toast.success(t('auth.welcome_back'));
      } else {
        // Restrict Doctor registration to whitelist
        if (role === 'doctor' && !ALLOWED_DOCTOR_EMAILS.includes(form.email.toLowerCase())) {
          setLoading(false);
          toast.error('This email is not authorized for Doctor access.');
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, form.email, form.password);
        await updateProfile(userCredential.user, { displayName: form.name });

        // Save user profile to MongoDB Atlas via API
        const userProfileRes = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: userCredential.user.uid,
            name: form.name,
            email: form.email,
            phone: form.phone,
            role: role
          })
        });

        if (!userProfileRes.ok) {
          throw new Error('Failed to save profile to database');
        }

        toast.success(t('auth.account_created'));
      }

      // Check user role for redirection
      const user = auth.currentUser;
      if (user) {
        const res = await fetch(`/api/users?uid=${user.uid}`);
        const userProfile = res.ok ? await res.json() : { exists: false };
        const finalRole = userProfile.exists ? userProfile.role : 'patient';
        navigate(finalRole === 'doctor' ? '/doctor-dashboard' : '/home');
      }
    } catch (error) {
      console.error(error);
      toast.error(error.message.replace('Firebase:', '').trim() || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 768;

    try {
      if (isMobile) {
        // Use redirect for mobile to avoid popup blockers on Vercel/iOS
        googleProvider.addScope('email');
        googleProvider.addScope('profile');
        await signInWithRedirect(auth, googleProvider);
        // Result handled by getRedirectResult in useEffect above
        return;
      }

      // Desktop — use popup
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // Save Google OAuth access token for Calendar API (used when booking appointments)
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) saveGoogleAccessToken(credential.accessToken);

      // Check if user exists in MongoDB Atlas via API
      const res = await fetch(`/api/users?uid=${user.uid}`);
      const userProfile = res.ok ? await res.json() : { exists: false };
      if (!userProfile.exists) {
        // New user — show role selection
        setGoogleUser(user);
        setShowRoleSelection(true);
        setLoading(false);
        return;
      }

      toast.success(t('auth.google_success'));
      navigate(userProfile.role === 'doctor' ? '/doctor-dashboard' : '/home');
    } catch (error) {
      console.error('Google Sign-In error:', error);
      if (error.code === 'auth/popup-blocked') {
        toast.error('Popup was blocked. Trying redirect...');
        await signInWithRedirect(auth, googleProvider);
      } else if (error.code !== 'auth/cancelled-popup-request') {
        toast.error('Google Sign-In failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSelection = async (selectedRole) => {
    if (!googleUser) return;
    
    // Restrict Doctor registration to whitelist
    if (selectedRole === 'doctor' && !ALLOWED_DOCTOR_EMAILS.includes(googleUser.email.toLowerCase())) {
      toast.error("This Google account is not authorized for Doctor access.");
      setShowRoleSelection(false);
      setGoogleUser(null);
      return;
    }

    setLoading(true);
    try {
      const userProfileRes = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: googleUser.uid,
          name: googleUser.displayName,
          email: googleUser.email,
          phone: googleUser.phoneNumber || '',
          role: selectedRole
        })
      });

      if (!userProfileRes.ok) {
        throw new Error('Failed to save profile to database');
      }

      toast.success(t('auth.account_created'));
      setShowRoleSelection(false);
      navigate(selectedRole === 'doctor' ? '/doctor-dashboard' : '/home');
    } catch (error) {
      console.error(error);
      toast.error("Failed to set role");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      toast.error(t('auth.email_address')); // Reusing or should I add a specific message?
      return;
    }
    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail.trim());
      toast.success(t('auth.reset_email_sent'));
      setShowForgot(false);
      setResetEmail('');
    } catch (error) {
      console.error(error);
      toast.error(error.message.replace('Firebase:', '').trim() || 'Failed to send reset email');
    } finally {
      setResetLoading(false);
    }
  };

  const bg = darkMode
    ? 'linear-gradient(135deg, #0a0f1e 0%, #0d1a3e 100%)'
    : 'linear-gradient(135deg, #f0f4ff 0%, #e8f5e9 100%)';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ minHeight: '100vh', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      {/* Background orbs */}
      <div style={{ position: 'fixed', top: '10%', left: '5%', width: 350, height: 350, borderRadius: '50%', background: 'radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)', filter: 'blur(50px)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '10%', right: '5%', width: 250, height: 250, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)', filter: 'blur(50px)', pointerEvents: 'none' }} />

      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        style={{
          width: '100%', maxWidth: 440,
          background: darkMode ? 'rgba(15,25,55,0.8)' : 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(30px)',
          borderRadius: 28,
          border: darkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(148,163,184,0.25)',
          padding: 40,
          boxShadow: darkMode ? '0 30px 80px rgba(0,0,0,0.5)' : '0 30px 80px rgba(37,99,235,0.15)',
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #2563eb, #10b981)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Activity size={22} color="white" />
            </div>
            <span style={{ fontWeight: 800, fontSize: 22, background: 'linear-gradient(135deg, #2563eb, #10b981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>MediAI</span>
          </div>
          <p style={{ color: '#64748b', fontSize: 14 }}>{t('auth.companion')}</p>
        </div>

        {/* Role Selection (Registration only) */}
        {mode === 'register' && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            {['patient', 'doctor'].map(r => (
              <motion.button key={r} type="button" onClick={() => setRole(r)}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 14, cursor: 'pointer',
                  border: role === r ? '2px solid #2563eb' : darkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
                  background: role === r ? (darkMode ? 'rgba(37,99,235,0.15)' : 'rgba(37,99,235,0.05)') : 'transparent',
                  color: role === r ? '#2563eb' : '#64748b',
                  fontSize: 14, fontWeight: 700, textTransform: 'capitalize',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6
                }}>
                <span style={{ fontSize: 20 }}>{r === 'patient' ? '🏥' : '👨‍⚕️'}</span>
                {t(`auth.role_${r}`) || r}
              </motion.button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <AnimatePresence mode="wait">
            {mode === 'register' && (
              <motion.div key="name" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', marginBottom: 14 }}>
                <div style={{ position: 'relative' }}>
                  <User size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input className="input-field" style={{ paddingLeft: 42 }} placeholder={t('auth.full_name')} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ marginBottom: 14 }}>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input className="input-field" style={{ paddingLeft: 42 }} type="email" placeholder={t('auth.email_address')} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
            </div>
          </div>

          <AnimatePresence mode="wait">
            {mode === 'register' && (
              <motion.div key="phone" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', marginBottom: 14 }}>
                <div style={{ position: 'relative' }}>
                  <Phone size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: phoneError ? '#ef4444' : '#94a3b8' }} />
                  <input
                    className="input-field"
                    style={{
                      paddingLeft: 42,
                      paddingRight: form.phone.length > 0 ? 42 : 16,
                      borderColor: phoneError ? '#ef4444' : undefined,
                      boxShadow: phoneError ? '0 0 0 3px rgba(239,68,68,0.15)' : undefined,
                    }}
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="10-digit mobile number"
                    value={form.phone}
                    onChange={handlePhoneChange}
                    onBlur={() => setPhoneTouched(true)}
                  />
                  {form.phone.length > 0 && (
                    <div style={{
                      position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                      fontSize: 11, fontWeight: 700,
                      color: isPhoneValid(form.phone) ? '#10b981' : '#ef4444',
                    }}>
                      {form.phone.length}/10
                    </div>
                  )}
                </div>
                {phoneError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, paddingLeft: 4 }}>
                    <AlertCircle size={13} color="#ef4444" />
                    <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 500 }}>Must be exactly 10 digits, no letters</span>
                  </div>
                )}
                {!phoneError && isPhoneValid(form.phone) && (
                  <div style={{ fontSize: 12, color: '#10b981', fontWeight: 500, marginTop: 6, paddingLeft: 4 }}>✓ Valid mobile number</div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ marginBottom: mode === 'login' ? 8 : 24 }}>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input className="input-field" style={{ paddingLeft: 42, paddingRight: 42 }} type={showPass ? 'text' : 'password'} placeholder={t('auth.password')} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
              <button type="button" onClick={() => setShowPass(!showPass)}
                style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {mode === 'login' && (
            <div style={{ textAlign: 'right', marginBottom: 20 }}>
              <button
                type="button"
                onClick={() => { setResetEmail(form.email); setShowForgot(true); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  background: 'linear-gradient(135deg, #2563eb, #10b981)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  padding: 0, letterSpacing: '0.01em',
                }}
              >
               {`🔓 ${t('auth.forgot_password')}`}
              </button>
            </div>
          )}

          <motion.button type="submit" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            disabled={loading}
            style={{
              width: '100%', padding: '14px', borderRadius: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              background: loading ? '#94a3b8' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: 'white', fontWeight: 700, fontSize: 16,
              boxShadow: loading ? 'none' : '0 6px 24px rgba(37,99,235,0.4)',
              transition: 'all 0.3s',
            }}
          >
            {loading ? `⏳ ${t('auth.please_wait')}` : mode === 'login' ? `🔑 ${t('auth.sign_in')}` : `🚀 ${t('auth.create_account')}`}
          </motion.button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
          <div style={{ flex: 1, height: 1, background: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(148,163,184,0.3)' }} />
          <span style={{ color: '#94a3b8', fontSize: 13 }}>{t('auth.or')}</span>
          <div style={{ flex: 1, height: 1, background: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(148,163,184,0.3)' }} />
        </div>

        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleGoogle}
          style={{
            width: '100%', padding: '13px', borderRadius: 14, cursor: 'pointer', fontWeight: 600, fontSize: 15,
            background: darkMode ? 'rgba(255,255,255,0.07)' : 'white',
            border: darkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(148,163,184,0.3)',
            color: darkMode ? '#e2e8f0' : '#0f172a',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {t('auth.continue_google')}
        </motion.button>

        <p style={{ textAlign: 'center', marginTop: 20, color: '#64748b', fontSize: 13 }}>
          {mode === 'login' ? t('auth.dont_have_account') : t('auth.already_have_account')}
          <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontWeight: 600 }}>
            {mode === 'login' ? t('auth.register') : t('auth.sign_in')}
          </button>
        </p>
      </motion.div>

      {/* ── Forgot Password Modal ── */}
      <AnimatePresence>
        {showForgot && (
          <motion.div
            key="forgot-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowForgot(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 999,
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(6px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 24,
            }}
          >
            <motion.div
              key="forgot-card"
              initial={{ scale: 0.85, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 30 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 400,
                background: darkMode ? 'rgba(13,22,50,0.95)' : 'rgba(255,255,255,0.97)',
                backdropFilter: 'blur(30px)',
                borderRadius: 24,
                border: darkMode ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(148,163,184,0.25)',
                padding: 36,
                boxShadow: darkMode ? '0 40px 100px rgba(0,0,0,0.6)' : '0 40px 100px rgba(37,99,235,0.18)',
              }}
            >
              {/* Modal Header */}
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px',
                  background: 'linear-gradient(135deg, #2563eb22, #10b98122)',
                  border: '1px solid rgba(37,99,235,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 26,
                }}>
                  🔑
                </div>
                <h2 style={{
                  margin: 0, fontSize: 20, fontWeight: 800,
                  background: 'linear-gradient(135deg, #2563eb, #10b981)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>
                  {t('auth.reset_password')}
                </h2>
                <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: 13, lineHeight: 1.5 }}>
                  {t('auth.reset_desc')}
                </p>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleForgotPassword}>
                <div style={{ position: 'relative', marginBottom: 20 }}>
                  <Mail size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    className="input-field"
                    style={{ paddingLeft: 42 }}
                    type="email"
                    placeholder={t('auth.email_address')}
                    value={resetEmail}
                    onChange={e => setResetEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <motion.button
                  type="submit"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={resetLoading}
                  style={{
                    width: '100%', padding: '13px', borderRadius: 14, border: 'none',
                    cursor: resetLoading ? 'not-allowed' : 'pointer',
                    background: resetLoading ? '#94a3b8' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                    color: 'white', fontWeight: 700, fontSize: 15,
                    boxShadow: resetLoading ? 'none' : '0 6px 24px rgba(37,99,235,0.4)',
                    transition: 'all 0.3s', marginBottom: 12,
                  }}
                >
                  {resetLoading ? `⏳ ${t('auth.please_wait')}` : `📧 ${t('auth.send_reset_link')}`}
                </motion.button>

                <button
                  type="button"
                  onClick={() => setShowForgot(false)}
                  style={{
                    width: '100%', padding: '11px', borderRadius: 14, border: 'none',
                    cursor: 'pointer', fontWeight: 600, fontSize: 14,
                    background: darkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                    color: '#64748b', transition: 'all 0.2s',
                  }}
                >
                  {t('auth.cancel')}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Role Selection Modal (First-time Google) ── */}
      <AnimatePresence>
        {showRoleSelection && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              style={{ 
                width: '100%', maxWidth: 440, background: darkMode ? '#1e293b' : 'white', borderRadius: 32, padding: 40, textAlign: 'center',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
              }}
            >
              <h2 style={{ fontSize: 24, fontWeight: 900, color: darkMode ? 'white' : '#0f172a', marginBottom: 12 }}>One Last Step! 🚀</h2>
              <p style={{ color: '#64748b', fontSize: 15, marginBottom: 32 }}>Welcome to MediAI! Please select your role to continue.</p>
              
              <div style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
                {['patient', 'doctor'].map(r => (
                  <motion.button key={r} onClick={() => handleRoleSelection(r)}
                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    style={{
                      flex: 1, padding: '24px 16px', borderRadius: 24, cursor: 'pointer',
                      border: '2px solid', 
                      borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                      background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                      color: darkMode ? '#e2e8f0' : '#0f172a',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12
                    }}>
                    <span style={{ fontSize: 40 }}>{r === 'patient' ? '🏥' : '👨‍⚕️'}</span>
                    <span style={{ fontWeight: 800, fontSize: 16, textTransform: 'capitalize' }}>{t(`auth.role_${r}`) || r}</span>
                  </motion.button>
                ))}
              </div>
              <p style={{ color: '#94a3b8', fontSize: 12 }}>You can change this later in your profile settings.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
