/* ═══════════════════════════════════════════════
   MUNINN — Voix (Speech-to-Text + Text-to-Speech)
   Utilise le Web Speech API natif du navigateur
═══════════════════════════════════════════════ */

const Speech = (() => {

  // ── État ──────────────────────────────────────
  let recognition    = null;
  let isListening    = false;
  let ttsEnabled     = false;
  let currentUtter   = null;
  let onResultCb     = null;
  let onStartCb      = null;
  let onStopCb       = null;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported         = !!SpeechRecognition;

  // ── Initialisation STT ────────────────────────
  function initRecognition() {
    if (!supported) return null;

    const rec = new SpeechRecognition();
    rec.lang        = 'fr-FR';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous  = false;

    rec.onstart = () => {
      isListening = true;
      if (onStartCb) onStartCb();
    };

    rec.onend = () => {
      isListening = false;
      if (onStopCb) onStopCb();
    };

    rec.onerror = (e) => {
      isListening = false;
      if (onStopCb) onStopCb();
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.warn('STT error:', e.error);
      }
    };

    rec.onresult = (e) => {
      let interim = '';
      let final   = '';

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final   += t;
        else                       interim += t;
      }

      if (onResultCb) onResultCb({ interim, final, isFinal: final.length > 0 });
    };

    return rec;
  }

  // ── Démarrer l'écoute ─────────────────────────
  function startListening(callbacks = {}) {
    if (!supported) {
      alert('La reconnaissance vocale n\'est pas supportée par votre navigateur. Utilisez Chrome ou Edge.');
      return false;
    }

    if (isListening) {
      stopListening();
      return false;
    }

    onResultCb = callbacks.onResult || null;
    onStartCb  = callbacks.onStart  || null;
    onStopCb   = callbacks.onStop   || null;

    recognition = initRecognition();
    if (!recognition) return false;

    try {
      recognition.start();
      return true;
    } catch (e) {
      console.error('STT start error:', e);
      return false;
    }
  }

  // ── Arrêter l'écoute ──────────────────────────
  function stopListening() {
    if (recognition && isListening) {
      try { recognition.stop(); } catch {}
    }
    isListening = false;
  }

  // ── Text-to-Speech ────────────────────────────
  function speak(text, options = {}) {
    if (!window.speechSynthesis) return;
    stopSpeaking();

    const settings    = Storage.getSettings();
    const utterance   = new SpeechSynthesisUtterance(text);
    utterance.lang    = 'fr-FR';
    utterance.rate    = options.rate    || settings.speechRate    || 1.0;
    utterance.pitch   = options.pitch   || 1.0;
    utterance.volume  = options.volume  || 1.0;

    // Voix sélectionnée
    const voiceName = options.voice || settings.ttsVoice || '';
    if (voiceName) {
      const voices = window.speechSynthesis.getVoices();
      const found  = voices.find(v => v.name === voiceName);
      if (found) utterance.voice = found;
    }

    utterance.onend = () => { currentUtter = null; };
    currentUtter = utterance;
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    currentUtter = null;
  }

  function isSpeaking() {
    return window.speechSynthesis?.speaking || false;
  }

  // ── Toggle TTS ────────────────────────────────
  function setTTSEnabled(val) { ttsEnabled = val; }
  function isTTSEnabled()     { return ttsEnabled; }

  // ── Liste des voix disponibles ────────────────
  function getVoices() {
    return window.speechSynthesis?.getVoices() || [];
  }

  function getVoicesAsync() {
    return new Promise((resolve) => {
      const voices = getVoices();
      if (voices.length > 0) { resolve(voices); return; }
      const onVoices = () => {
        resolve(window.speechSynthesis.getVoices());
        window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
      };
      window.speechSynthesis?.addEventListener('voiceschanged', onVoices);
      setTimeout(() => resolve(getVoices()), 2000); // fallback
    });
  }

  // ── Nettoyer texte pour TTS ───────────────────
  // Supprime le markdown (code blocks, liens, etc.) pour une lecture plus naturelle
  function cleanForTTS(text) {
    return text
      .replace(/```[\s\S]*?```/g, 'bloc de code.')
      .replace(/`[^`]+`/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^\s*[-*+]\s/gm, '')
      .replace(/^\s*\d+\.\s/gm, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      .trim();
  }

  return {
    supported,
    startListening, stopListening,
    speak, stopSpeaking, isSpeaking,
    setTTSEnabled, isTTSEnabled,
    getVoices, getVoicesAsync,
    cleanForTTS,
    get isListening() { return isListening; },
  };

})();
