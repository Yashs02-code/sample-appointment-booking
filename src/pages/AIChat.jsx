import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Mic, MicOff, Bot, User, Activity, Star, Calendar, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { symptomsToDoctorMap } from '../data/dummyData';
import { format } from 'date-fns';
import PageWrapper from '../components/PageWrapper';
import SlotPicker from '../components/SlotPicker';
import DoctorCard from '../components/DoctorCard';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';


const STEPS = ['mode', 'name', 'age', 'gender', 'symptoms', 'doctor', 'type', 'date', 'slot', 'confirm'];

// ─── Name Validation ─────────────────────────────────────────────────────────
const FAKE_NAME_BLOCKLIST = [
  'yyy', 'xyz', 'xyx', 'abc', 'aaa', 'bbb', 'ccc', 'zzz', 'xxx',
  'qwe', 'qwerty', 'asdf', 'zxcv', 'test', 'testing', 'demo', 'fake', 'dummy',
  'hello', 'user', 'name', 'someone', 'nobody', 'anonymous', 'temp', 'null', 'none',
  'nnn', 'mmm', 'lll', 'kkk', 'jjj', 'iii', 'hhh', 'ggg', 'fff', 'eee', 'ddd',
  'john', 'jane', 'test1', 'admin', 'root', 'pass', 'password', 'asdf', 'qwerty',
];

function validateNameStrict(val) {
  const trimmed = (val || '').trim();
  
  // Check minimum length
  if (trimmed.length < 5) {
    return { valid: false, reason: 'too_short' };
  }
  
  // Must contain only letters, spaces, hyphens, apostrophes
  if (!/^[a-zA-Z\s'\-\.]+$/.test(trimmed)) {
    return { valid: false, reason: 'invalid_chars' };
  }
  
  const words = trimmed.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  
  // Must have at least 2 words (first name + last name)
  if (words.length < 2) {
    return { valid: false, reason: 'needs_full_name' };
  }
  
  // Check each word
  for (const word of words) {
    // Word minimum 2 chars (but typically real names are 3+)
    if (word.length < 2) {
      return { valid: false, reason: 'word_too_short' };
    }
    
    // Check if word is in blocklist
    if (FAKE_NAME_BLOCKLIST.includes(word)) {
      return { valid: false, reason: 'blocked_word' };
    }
    
    // Reject purely repeated characters (e.g. "aaa", "zzz")
    if (word.length >= 2 && new Set(word).size === 1) {
      return { valid: false, reason: 'repeated_chars' };
    }
    
    // Reject excessive character repetition (more than 50% same char)
    const charCounts = {};
    for (const char of word) {
      charCounts[char] = (charCounts[char] || 0) + 1;
    }
    const maxCount = Math.max(...Object.values(charCounts));
    if (maxCount / word.length > 0.5) {
      return { valid: false, reason: 'too_many_repeats' };
    }
    
    // Check for at least one vowel and one consonant (realistic names)
    const hasVowel = /[aeiou]/.test(word);
    const hasConsonant = /[bcdfghjklmnpqrstvwxyz]/.test(word);
    if (!hasVowel || !hasConsonant) {
      return { valid: false, reason: 'unrealistic_pattern' };
    }
    
    // First letter must be uppercase in original input, but accept if user forgot
    // We'll be lenient here
  }
  
  return { valid: true, reason: null };
}

function isValidName(val) {
  return validateNameStrict(val).valid;
}

function getNameErrorMessage(reason) {
  const messages = {
    too_short: '⚠️ Please enter your **full name** (at least 5 characters). Example: Rahul Sharma',
    invalid_chars: '⚠️ Name should only contain letters, spaces, hyphens, and apostrophes. Please remove numbers or special characters.',
    needs_full_name: '⚠️ Please enter your **first name AND last name**. Example: John Doe, Priya Mehta, or Raj Kumar',
    word_too_short: '⚠️ Each name part should be at least 2 characters. Example: Jo Smith, not J Smith',
    blocked_word: '⚠️ This doesn\'t appear to be a real name. Please enter your **actual full name**.',
    repeated_chars: '⚠️ Names shouldn\'t have repeated characters. Example: "Aaa" is not valid. Please enter a **real name**.',
    too_many_repeats: '⚠️ Your name has too many repeated characters. Please enter a **real, authentic name**. Example: Rohit Sharma',
    unrealistic_pattern: '⚠️ This doesn\'t look like a real name pattern. Please enter your **actual full name**. Example: Rahul, Priya, or Rohan',
  };
  return messages[reason] || '⚠️ Please enter your **valid real name**. Example: Your First Name + Last Name';
}

function getAIMessage(step, t, ctx = {}) {
  const msgs = {
    mode: t('aichat.select_action') || 'What would you like to do today?',
    name: t('aichat.steps.name'),
    age: t('aichat.steps.age', { name: ctx.name }),
    gender: t('aichat.steps.gender'),
    symptoms: t('aichat.steps.symptoms'),
    doctor: t('aichat.steps.doctor'),
    type: t('aichat.steps.type'),
    date: t('aichat.steps.date'),
    slot: t('aichat.steps.slot', { doctor: ctx.doctor?.name || 'doctor', date: ctx.date }),
    confirm: t('aichat.steps.confirm'),
  };
  return msgs[step] || t('aichat.complete');
}

function AITyping() {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '12px 16px', alignItems: 'center' }}>
      {[0,1,2].map(i => <div key={i} className="typing-dot" style={{ animationDelay: `${i * 0.2}s` }} />)}
    </div>
  );
}

function formatMessage(text) {
  // Bold markers
  return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

export default function AIChat() {
  const { t } = useTranslation();
  const { darkMode, doctors, bookAppointment, currentUser, getUpcomingAppointments, cancelAppointment, rescheduleAppointment } = useApp();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [step, setStep] = useState('mode');
  const [ctx, setCtx] = useState({});
  const [isTyping, setIsTyping] = useState(false);
  const [suggestedDoctor, setSuggestedDoctor] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [listening, setListening] = useState(false);
  const [done, setDone] = useState(false);
  const [mode, setMode] = useState(null); // 'book', 'reschedule', 'cancel'
  const [userAppointments, setUserAppointments] = useState([]);
  const [selectedAptId, setSelectedAptId] = useState(null);

  const scrollRef = useRef();
  const inputRef = useRef();
  const recogRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Initial greeting
  useEffect(() => {
    addAI(getAIMessage('mode', t), 600);
  }, []);

  function addAI(text, delay = 400) {
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setMessages(prev => [...prev, { role: 'ai', text, ts: Date.now() }]);
    }, delay);
  }

  function addUser(text) {
    setMessages(prev => [...prev, { role: 'user', text, ts: Date.now() }]);
  }

  function detectDoctors(symptoms) {
    const lower = symptoms.toLowerCase();
    let specialtyMatch = '';
    for (const [key, [specialty]] of Object.entries(symptomsToDoctorMap)) {
      if (lower.includes(key)) {
        specialtyMatch = specialty;
        break;
      }
    }
    
    const specialties = [{name: 'General Physician'}, {name: 'Cardiologist'}, {name: 'Dermatologist'}, {name: 'Pediatrician'}];
    let candidates = specialties.map(s => doctors.find(d => d.specialty === s.name && d.available)).filter(Boolean);
    
    if (specialtyMatch) {
      const bestMatch = doctors.find(d => d.specialty === specialtyMatch && d.available);
      if (bestMatch) {
        // Put best match first
        candidates = [bestMatch, ...candidates.filter(d => d.id !== bestMatch.id)];
      }
    } else {
      // Default to Dr. Priya Sharma if no specialty match and she's available
      const priya = doctors.find(d => d.id === 'd1');
      if (priya) {
        candidates = [priya, ...candidates.filter(d => d.id !== 'd1')];
      }
    }
    
    return candidates.slice(0, 5); // Show up to 5 diverse options
  }

  function getDateOptions() {
    const opts = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      opts.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
    }
    return opts;
  }

  const handleSend = () => {
    const val = input.trim();
    if (!val || done) return;
    setInput('');
    addUser(val);
    processStep(val.trim());
  };

  const quickReply = (val) => {
    if (done) return;
    setInput('');
    addUser(val);
    processStep(val);
  };

  function processStep(val) {
    if (step === 'mode') {
      const lowerVal = val.toLowerCase();
      if (lowerVal.includes('book')) {
        setMode('book');
        setStep('name');
        addAI(getAIMessage('name', t), 1000);
      } else if (lowerVal.includes('reschedule')) {
        setMode('reschedule');
        const upcoming = getUpcomingAppointments();
        setUserAppointments(upcoming);
        if (upcoming.length === 0) {
          setDone(true);
          addAI('📅 You don\'t have any upcoming appointments to reschedule.', 800);
        } else {
          setStep('doctor');
          addAI(`📅 You have **${upcoming.length}** upcoming appointment(s). Please select which one you'd like to reschedule:`, 800);
        }
      } else if (lowerVal.includes('cancel')) {
        setMode('cancel');
        const upcoming = getUpcomingAppointments();
        setUserAppointments(upcoming);
        if (upcoming.length === 0) {
          setDone(true);
          addAI('❌ You don\'t have any upcoming appointments to cancel.', 800);
        } else {
          setStep('doctor');
          addAI(`❌ You have **${upcoming.length}** upcoming appointment(s). Please select which one you'd like to cancel:`, 800);
        }
      } else if (lowerVal.includes('check') || lowerVal.includes('available')) {
        setMode('check');
        setStep('doctor');
        addAI('🏥 Which doctor would you like to check available slots for?', 1000);
      } else {
        addAI('😊 Please choose: **Book**, **Reschedule**, **Cancel**, or **Check** available slots.', 800);
      }
    } else if (step === 'name') {
      const validation = validateNameStrict(val);
      if (!validation.valid) {
        const errorMsg = getNameErrorMessage(validation.reason);
        addAI(errorMsg, 800);
        return;
      }
      const newCtx = { ...ctx, name: val };
      setCtx(newCtx);
      setStep('age');
      addAI(getAIMessage('age', t, newCtx), 1000);
    } else if (step === 'age') {
      const newCtx = { ...ctx, age: val };
      setCtx(newCtx);
      setStep('gender');
      addAI(getAIMessage('gender', t, newCtx), 1000);
    } else if (step === 'gender') {
      const newCtx = { ...ctx, gender: val };
      setCtx(newCtx);
      setStep('symptoms');
      addAI(getAIMessage('symptoms', t, newCtx), 1000);
    } else if (step === 'symptoms') {
      const candidates = detectDoctors(val);
      const newCtx = { ...ctx, symptoms: val, candidates };
      setCtx(newCtx);
      setStep('doctor');
      addAI(t('aichat.search_docs', { name: candidates[0].name }), 1000);
    } else if (step === 'doctor') {
      if (mode === 'reschedule' || mode === 'cancel') {
        // Selecting an appointment to reschedule or cancel
        const aptIndex = parseInt(val) - 1;
        if (isNaN(aptIndex) || aptIndex < 0 || aptIndex >= userAppointments.length) {
          addAI('❌ Invalid selection. Please select a valid appointment number.', 800);
          return;
        }
        const selectedApt = userAppointments[aptIndex];
        setSelectedAptId(selectedApt.id);
        const doctor = doctors.find(d => d.id === selectedApt.doctorId);
        if (mode === 'reschedule') {
          addAI(`✅ You selected your appointment with **${doctor?.name}** on **${selectedApt.date}** at **${selectedApt.time}**.\n\nWhat new date would you like?`, 1000);
          setStep('date');
        } else {
          addAI(`✅ You selected your appointment with **${doctor?.name}** on **${selectedApt.date}** at **${selectedApt.time}**.\n\nAre you sure you want to cancel this appointment?`, 1000);
          setStep('confirm');
        }
      } else if (mode === 'check') {
        // Selecting a doctor to check slots
        const normalizedInput = val.toLowerCase().replace('dr.', '').trim();
        const doc = doctors.find(d => 
          d.id.toLowerCase() === normalizedInput || 
          d.name.toLowerCase().replace('dr.', '').trim() === normalizedInput ||
          d.name.toLowerCase().trim() === val.toLowerCase().trim()
        );
        if (!doc) {
          addAI(t('aichat.invalid_doctor') || "I couldn't find that doctor. Please pick one from the list above.");
          return;
        }
        setSuggestedDoctor(doc);
        setCtx({ ...ctx, doctor: doc });
        setStep('date');
        addAI(`✅ Checking available slots for **${doc.name}**. What date would you like?`, 1000);
      } else {
        // Normal booking flow - selecting a doctor
        const normalizedInput = val.toLowerCase().replace('dr.', '').trim();
        const doc = doctors.find(d => 
          d.id.toLowerCase() === normalizedInput || 
          d.name.toLowerCase().replace('dr.', '').trim() === normalizedInput ||
          d.name.toLowerCase().trim() === val.toLowerCase().trim()
        );
        
        if (!doc) {
          addAI(t('aichat.invalid_doctor') || "I couldn't find that doctor. Please pick one from the list above.");
          return;
        }

        const newCtx = { ...ctx, doctor: doc };
        setCtx(newCtx);
        setSuggestedDoctor(doc);
        setStep('type');
        addAI(t('aichat.doc_choice', { name: doc.name }), 1000);
      }
    } else if (step === 'type') {
      const newCtx = { ...ctx, appointmentType: val };
      setCtx(newCtx);
      setStep('date');
      addAI(getAIMessage('date', t, newCtx), 1000);
    } else if (step === 'date') {
      if (mode === 'check') {
        const doctor = ctx.doctor;
        const slots = doctor?.slots?.[val] || ['09:00', '10:30', '11:00', '14:00', '15:30'];
        const bSlots = doctor?.bookedSlots?.[val] || [];
        const availableCount = slots.filter(s => !bSlots.includes(s)).length;
        addAI(
          `📊 On **${val}**, Dr. ${doctor.name} has **${availableCount}** available slot(s) out of ${slots.length}:\n\n${slots.map((s, i) => `${bSlots.includes(s) ? '❌' : '✅'} ${s}`).join('\n')}`,
          1000
        );
        setDone(true);
      } else if (mode === 'reschedule') {
        const selectedApt = userAppointments.find(a => a.id === selectedAptId);
        const doctor = selectedApt ? doctors.find(d => d.id === selectedApt.doctorId) : ctx.doctor;
        const slots = doctor?.slots?.[val] || ['09:00', '10:30', '11:00', '14:00', '15:30'];
        const bSlots = doctor?.bookedSlots?.[val] || [];
        const newCtx = { ...ctx, date: val };
        setCtx(newCtx);
        setAvailableSlots(slots);
        setBookedSlots(bSlots);
        setStep('slot');
        addAI(`🕐 Select a new time slot for **${val}**:`, 1000);
      } else {
        const doctor = ctx.doctor;
        const slots = doctor?.slots?.[val] || ['09:00', '10:30', '11:00', '14:00', '15:30'];
        const bSlots = doctor?.bookedSlots?.[val] || [];
        const newCtx = { ...ctx, date: val };
        setCtx(newCtx);
        setAvailableSlots(slots);
        setBookedSlots(bSlots);
        setStep('slot');
        addAI(getAIMessage('slot', t, { ...newCtx }), 1000);
      }
    } else if (step === 'slot') {
      if (bookedSlots.includes(val)) {
        const nextAvailable = availableSlots.find(s => !bookedSlots.includes(s) && s !== val);
        if (nextAvailable) {
          addAI(
            `⏰ The selected time slot **${val}** is already booked.\n\nI have found the next available slot at **${nextAvailable}**. Would you like to book it instead?`,
            800
          );
          setSelectedSlot(nextAvailable);
        } else {
          addAI(
            `⚠️ Sorry, all slots for this date are fully booked. Please go back and choose a different date.`,
            800
          );
        }
        return;
      }
      if (mode === 'reschedule') {
        // Rescheduling - confirm the new time
        setStep('confirm');
        const apt = userAppointments.find(a => a.id === selectedAptId);
        const doctor = doctors.find(d => d.id === apt.doctorId);
        addAI(
          `📅 **New appointment details:**\n\n🏥 Doctor: **${doctor?.name}**\n📅 Date: **${ctx.date}**\n⏰ Time: **${val}**\n\nConfirm rescheduling?`,
          1000
        );
        const newCtx = { ...ctx, time: val };
        setCtx(newCtx);
      } else {
        // Normal booking
        const newCtx = { ...ctx, time: val };
        setCtx(newCtx);
        setSelectedSlot(val);
        setStep('confirm');
        addAI(
          t('aichat.summary', {
            name: newCtx.name,
            age: newCtx.age,
            gender: newCtx.gender,
            doctor: newCtx.doctor.name,
            hospital: newCtx.doctor.hospital,
            type: newCtx.appointmentType,
            date: newCtx.date,
            time: newCtx.time,
            fee: newCtx.doctor.fee
          }),
          1400
        );
      }
    } else if (step === 'confirm') {
      if (mode === 'reschedule') {
        if (val.toLowerCase().startsWith('y') || val.toLowerCase() === 'ok' || val.toLowerCase().includes('यश') || val.toLowerCase().includes('हो')) {
          processReschedule();
        } else {
          setDone(true);
          addAI('❌ Rescheduling cancelled.', 700);
        }
      } else if (mode === 'cancel') {
        if (val.toLowerCase().startsWith('y') || val.toLowerCase() === 'ok' || val.toLowerCase().includes('यश') || val.toLowerCase().includes('हो')) {
          processCancel();
        } else {
          setDone(true);
          addAI('❌ Cancellation cancelled.', 700);
        }
      } else {
        // Normal booking
        if (val.toLowerCase().startsWith('y') || val.toLowerCase() === 'ok' || val.toLowerCase().includes('यश') || val.toLowerCase().includes('हो')) {
          processBooking();
        } else {
          setDone(true);
          addAI(t('aichat.cancelled'), 700);
        }
      }
    }
  }

  async function processBooking() {
    console.log("🚀 Initiating booking for Doctor ID:", ctx.doctor.id, "Name:", ctx.doctor.name);
    
    const aptPromise = bookAppointment({
      doctorId: ctx.doctor.id,
      doctorEmail: ctx.doctor.email,
      patientName: ctx.name,
      age: parseInt(ctx.age),
      gender: ctx.gender,
      symptoms: ctx.symptoms,
      appointmentType: ctx.appointmentType,
      date: ctx.date,
      time: ctx.time,
      fee: ctx.doctor.fee,
    });
    
    setDone(true);
    addAI(t('aichat.confirmed', { doctor: ctx.doctor.name, date: ctx.date, time: ctx.time }), 600);
    
    toast.success(`Booking sent to ${ctx.doctor.name} (ID: ${ctx.doctor.id})`, {
      icon: '📡',
      duration: 5000
    });
    
    const apt = await aptPromise;
    if (apt) {
      setTimeout(() => navigate(`/confirmation/${apt.id}`), 2500);
    } else {
      toast.error("Failed to book appointment. Please try again.");
    }
  }

  async function processReschedule() {
    setDone(true);
    addAI(`✅ Your appointment has been rescheduled to **${ctx.date}** at **${ctx.time}**. You'll receive a confirmation email shortly.`, 800);
    
    toast.success('Appointment rescheduled! ✅', { icon: '📅', duration: 5000 });
    
    await rescheduleAppointment(selectedAptId, ctx.date, ctx.time);
    
    setTimeout(() => navigate('/appointments'), 2500);
  }

  async function processCancel() {
    setDone(true);
    addAI(`✅ Your appointment has been cancelled. You'll receive a confirmation email shortly.`, 800);
    
    toast.success('Appointment cancelled! ❌', { icon: '🔄', duration: 5000 });
    
    await cancelAppointment(selectedAptId);
    
    setTimeout(() => navigate('/appointments'), 2500);
  }

  // Voice input
  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast.error('Voice input not supported in this browser'); return; }
    const r = new SR();
    r.lang = 'en-IN';
    r.onresult = (e) => { setInput(e.results[0][0].transcript); setListening(false); };
    r.onend = () => setListening(false);
    r.start();
    recogRef.current = r;
    setListening(true);
    toast(`🎤 ${t('aichat.listening')}`);
  };

  const dateOptions = getDateOptions();
  const genderOptions = ['Male', 'Female', 'Other'];

  const bg = darkMode ? '#0a0f1e' : '#f0f4ff';
  const cardBg = darkMode ? 'rgba(20,30,60,0.9)' : 'rgba(255,255,255,0.95)';

  return (
    <PageWrapper style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: bg }}>
        {/* Header */}
        <div style={{
          padding: '16px 24px', borderBottom: darkMode ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(148,163,184,0.2)',
          background: darkMode ? 'rgba(10,15,30,0.9)' : 'rgba(255,255,255,0.9)',
          backdropFilter: 'blur(20px)',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg, #2563eb, #10b981)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <Bot size={24} color="white" />
            <div style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: '50%', background: '#10b981', border: '2px solid white' }} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: darkMode ? '#e2e8f0' : '#0f172a' }}>{t('aichat.assistant_name')}</div>
            <div style={{ fontSize: 12, color: '#10b981', fontWeight: 500 }}>● {t('aichat.online_status')}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, overflow: 'hidden' }}>
            {STEPS.map((s, i) => (
              <div key={s} style={{
                width: 8, height: 8, borderRadius: '50%',
                background: STEPS.indexOf(step) >= i ? '#2563eb' : (darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'),
                transition: 'all 0.3s',
              }} />
            ))}
          </div>
        </div>

        {/* Messages area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Quick-action cards shown before conversation starts */}
          {messages.length === 0 && !isTyping && (
            <motion.div initial={{ opacity: 0, y:10 }} animate={{ opacity: 1, y:0 }}
              style={{ padding: '20px 0 8px' }}>
              <p style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginBottom: 12, textAlign: 'center' }}>What would you like to do?</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { icon: '🗓', label: t('appointments_list.book_with_ai'), color: '#2563eb', action: 'I want to book an appointment' },
                  { icon: '🔄', label: t('appointments.reschedule'), color: '#7c3aed', action: 'I want to reschedule my appointment' },
                  { icon: '❌', label: t('appointments.cancel'), color: '#ef4444', action: 'I want to cancel my appointment' },
                  { icon: '🔍', label: t('appointments_list.search_placeholder').split(' ')[0], color: '#10b981', action: 'I want to check available slots' },
                ].map(qa => (
                  <motion.button key={qa.label}
                    whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                    onClick={() => { addUser(qa.action); processStep(qa.action.replace('I want to ','').split(' ')[0] === 'book' ? 'skip-to-name' : qa.action); setStep('name'); addAI(getAIMessage('name', t), 800); }}
                    style={{
                      padding: '16px', borderRadius: 16, border: `1.5px solid ${qa.color}30`,
                      background: darkMode ? `${qa.color}12` : `${qa.color}08`,
                      cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                      boxShadow: `0 4px 16px ${qa.color}15`,
                    }}
                  >
                    <span style={{ fontSize: 28 }}>{qa.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: qa.color }}>{qa.label}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          <AnimatePresence>
            {messages.map((msg, i) => (
              <motion.div key={msg.ts}
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3 }}
                style={{ display: 'flex', gap: 10, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', alignItems: 'flex-end' }}
              >
                {msg.role === 'ai' && (
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, #2563eb, #10b981)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: 4 }}>
                    <Bot size={16} color="white" />
                  </div>
                )}
                <div style={{ maxWidth: '75%' }}>
                  <div
                    className={msg.role === 'user' ? 'chat-user' : 'chat-ai'}
                    style={{ padding: '12px 16px', fontSize: 14, lineHeight: 1.6, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
                    dangerouslySetInnerHTML={{ __html: formatMessage(msg.text).replace(/\n/g, '<br/>') }}
                  />
                </div>
                {msg.role === 'user' && (
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, #7c3aed, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: 4, color: 'white', fontWeight: 700, fontSize: 12 }}>
                    {currentUser?.avatar || 'U'}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {isTyping && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, #2563eb, #10b981)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bot size={16} color="white" />
              </div>
              <div className="chat-ai" style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
                <AITyping />
              </div>
            </motion.div>
          )}

          {/* Doctor suggestion card */}
          {suggestedDoctor && step !== 'name' && step !== 'age' && step !== 'gender' && step !== 'symptoms' && step !== 'doctor' && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ marginLeft: 42, maxWidth: '75%' }}>
              <DoctorCard doctor={suggestedDoctor} />
            </motion.div>
          )}

          {/* Slot picker */}
          {step === 'slot' && availableSlots.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginLeft: 42 }}>
              <SlotPicker
                slots={availableSlots}
                bookedSlots={bookedSlots}
                selectedSlot={selectedSlot}
                onSelect={(s) => { setSelectedSlot(s); processStep(s); }}
              />
            </motion.div>
          )}

          {/* Quick reply chips */}
          {!done && !isTyping && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginLeft: 42, display: 'flex', flexWrap: 'wrap', gap: 8, flexDirection: 'column' }}>
              {step === 'mode' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxWidth: 350 }}>
                  {[
                    { icon: '🗓', label: 'Book', color: '#2563eb', action: 'book' },
                    { icon: '🔄', label: 'Reschedule', color: '#7c3aed', action: 'reschedule' },
                    { icon: '❌', label: 'Cancel', color: '#ef4444', action: 'cancel' },
                    { icon: '🔍', label: 'Check Slots', color: '#10b981', action: 'check' },
                  ].map(qa => (
                    <motion.button key={qa.action}
                      whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.95 }}
                      onClick={() => { addUser(qa.label); processStep(qa.action); }}
                      style={{
                        padding: '16px', borderRadius: 16, border: `2px solid ${qa.color}40`,
                        background: darkMode ? `${qa.color}12` : `${qa.color}08`,
                        cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                        boxShadow: `0 4px 16px ${qa.color}15`,
                      }}
                    >
                      <span style={{ fontSize: 24 }}>{qa.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: qa.color }}>{qa.label}</span>
                    </motion.button>
                  ))}
                </div>
              )}
              {step === 'gender' && genderOptions.map(g => (
                <motion.button key={g} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => quickReply(g)}
                  style={{ padding: '8px 18px', borderRadius: 20, border: '1.5px solid #2563eb', background: 'transparent', color: '#2563eb', cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'Inter' }}>
                  {g}
                </motion.button>
              ))}
              {step === 'doctor' && mode === 'book' && ctx.candidates && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 350 }}>
                  {ctx.candidates.map((doc, idx) => (
                    <motion.div key={doc.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      whileHover={{ x: 5, scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => quickReply(doc.name)}
                      style={{
                        padding: '16px', borderRadius: 20, background: cardBg,
                        border: idx === 0 ? '2px solid #2563eb' : `1px solid ${darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(37,99,235,0.1)'}`,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14,
                        boxShadow: idx === 0 ? '0 8px 32px rgba(37,99,235,0.15)' : '0 8px 32px rgba(0,0,0,0.06)',
                        backdropFilter: 'blur(10px)',
                        position: 'relative',
                        overflow: 'hidden'
                      }}>
                      {idx === 0 && (
                        <div style={{ 
                          position: 'absolute', top: 0, right: 0, 
                          background: '#2563eb', color: 'white', 
                          padding: '2px 10px', fontSize: 9, fontWeight: 900,
                          borderBottomLeftRadius: 12, textTransform: 'uppercase'
                        }}>{t('aichat.recommended')}</div>
                      )}
                      <div style={{ 
                        width: 48, height: 48, borderRadius: 12, 
                        background: `linear-gradient(135deg, ${doc.avatarColor}, ${doc.avatarColor}88)`,
                        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16
                      }}>{doc.avatar}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: darkMode ? '#f1f5f9' : '#0f172a' }}>{doc.name}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{doc.specialty} • {doc.experience}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#2563eb' }}>₹{doc.fee}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end', marginTop: 4 }}>
                          <Star size={10} color="#fbbf24" fill="#fbbf24" />
                          <span style={{ fontSize: 10, fontWeight: 800, color: '#d97706' }}>{doc.rating}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  <button onClick={() => setStep('symptoms')} style={{ 
                    background: 'none', border: 'none', color: '#64748b', 
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', 
                    marginTop: 4, textAlign: 'center', width: '100%' 
                  }}>{t('aichat.none_of_these')}</button>
                </div>
              )}
              {step === 'doctor' && (mode === 'reschedule' || mode === 'cancel') && userAppointments.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 380 }}>
                  {userAppointments.map((apt, idx) => {
                    const doctor = doctors.find(d => d.id === apt.doctorId);
                    const isCancel = mode === 'cancel';
                    const actionColor = isCancel ? '#ef4444' : '#7c3aed';
                    return (
                      <motion.div key={apt.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        whileHover={{ x: 5, scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => quickReply((idx + 1).toString())}
                        style={{
                          padding: '14px', borderRadius: 16, background: cardBg,
                          border: `1.5px solid ${actionColor}40`,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                          boxShadow: `0 4px 16px ${actionColor}10`,
                        }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: 10,
                          background: `linear-gradient(135deg, ${actionColor}, ${actionColor}66)`,
                          color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0
                        }}>{idx + 1}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: darkMode ? '#f1f5f9' : '#0f172a' }}>{doctor?.name}</div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>📅 {apt.date} at {apt.time}</div>
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: actionColor }}>
                          {isCancel ? '❌ Cancel' : '🔄 Reschedule'}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
              {step === 'doctor' && mode === 'check' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 350 }}>
                  {doctors.slice(0, 5).map((doc, idx) => (
                    <motion.div key={doc.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      whileHover={{ x: 5, scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => quickReply(doc.name)}
                      style={{
                        padding: '14px', borderRadius: 16, background: cardBg,
                        border: `1px solid ${darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(37,99,235,0.1)'}`,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                      }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: `linear-gradient(135deg, ${doc.avatarColor}, ${doc.avatarColor}88)`,
                        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0
                      }}>{doc.avatar}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: darkMode ? '#f1f5f9' : '#0f172a' }}>{doc.name}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{doc.specialty}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981' }}>₹{doc.fee}</div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
              {step === 'type' && ['Check-up', 'Consultation'].map(type => (
                <motion.button key={type} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => quickReply(type)}
                  style={{ padding: '8px 18px', borderRadius: 20, border: '1.5px solid #7c3aed', background: 'transparent', color: '#7c3aed', cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'Inter' }}>
                  {type === 'Check-up' ? '🩺 ' : '💬 '}{type === 'Check-up' ? t('aichat.check_up') : t('aichat.consultation')}
                </motion.button>
              ))}
              {step === 'date' && dateOptions.map(d => (
                <motion.button key={d} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => quickReply(d)}
                  style={{ padding: '8px 16px', borderRadius: 20, border: '1.5px solid #10b981', background: 'transparent', color: '#10b981', cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'Inter' }}>
                  📅 {d}
                </motion.button>
              ))}
              {step === 'confirm' && (mode === 'book' || !mode) && [t('aichat.yes_confirm'), t('aichat.no_cancel')].map(c => (
                <motion.button key={c} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => quickReply(c)}
                  style={{
                    padding: '10px 20px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    background: c === t('aichat.yes_confirm') ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(239,68,68,0.15)',
                    color: c === t('aichat.yes_confirm') ? 'white' : '#ef4444',
                    fontWeight: 700, fontSize: 14, fontFamily: 'Inter',
                    boxShadow: c === t('aichat.yes_confirm') ? '0 4px 16px rgba(16,185,129,0.4)' : 'none',
                  }}>
                  {c === t('aichat.yes_confirm') ? '✅ ' : '❌ '}{c}
                </motion.button>
              ))}
              {step === 'confirm' && (mode === 'reschedule' || mode === 'cancel') && ['Yes', 'No'].map(c => (
                <motion.button key={c} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => quickReply(c)}
                  style={{
                    padding: '10px 20px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    background: c === 'Yes' ? (mode === 'cancel' ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #7c3aed, #6d28d9)') : 'rgba(239,68,68,0.15)',
                    color: c === 'Yes' ? 'white' : '#ef4444',
                    fontWeight: 700, fontSize: 14, fontFamily: 'Inter',
                    boxShadow: c === 'Yes' ? `0 4px 16px ${mode === 'cancel' ? 'rgba(239,68,68,0.4)' : 'rgba(124,58,237,0.4)'}` : 'none',
                  }}>
                  {c === 'Yes' ? '✅ ' : '❌ '}{c}
                </motion.button>
              ))}
            </motion.div>
          )}

          <div ref={scrollRef} />
        </div>

        {/* Input bar */}
        <div style={{
          padding: '12px 16px',
          background: darkMode ? 'rgba(10,15,30,0.95)' : 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(20px)',
          borderTop: darkMode ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(148,163,184,0.2)',
          display: 'flex', gap: 10, alignItems: 'center',
        }}>
          <motion.button
            whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
            onClick={startVoice}
            style={{
              width: 44, height: 44, borderRadius: 14, border: 'none', cursor: 'pointer',
              background: listening ? 'linear-gradient(135deg, #ef4444, #dc2626)' : (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: listening ? 'white' : '#64748b', flexShrink: 0,
            }}
          >
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
          </motion.button>

          {/* Voice AI coming soon badge */}
          {!listening && (
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)',
                fontSize: 8, fontWeight: 800, color: '#7c3aed', whiteSpace: 'nowrap',
                background: 'rgba(124,58,237,0.12)', padding: '1px 6px', borderRadius: 6,
                border: '1px solid rgba(124,58,237,0.3)' }}>{t('aichat.voice_ai')}</div>
            </div>
          )}

          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder={done ? t('aichat.complete') : t('aichat.placeholder')}
            disabled={done || step === 'slot'}
            className="input-field"
            style={{ flex: 1 }}
          />

          <motion.button
            whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
            onClick={handleSend}
            disabled={!input.trim() || done}
            style={{
              width: 44, height: 44, borderRadius: 14, border: 'none', cursor: 'pointer',
              background: input.trim() && !done ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: input.trim() && !done ? 'white' : '#94a3b8', flexShrink: 0,
              boxShadow: input.trim() && !done ? '0 4px 16px rgba(37,99,235,0.4)' : 'none',
            }}
          >
            <Send size={18} />
          </motion.button>
        </div>
      </div>
    </PageWrapper>
  );
}
