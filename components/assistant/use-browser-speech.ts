'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; abort: () => void; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null };
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
export function useBrowserSpeech(onTranscript: (text: string) => void, onError: (error: string) => void) {
  const [supported, setSupported] = useState(false); const [readable, setReadable] = useState(false); const [listening, setListening] = useState(false); const [speaking, setSpeaking] = useState(false);
  const recognition = useRef<Recognition | null>(null); const transcript = useRef(onTranscript); transcript.current = onTranscript;
  const error = useRef(onError); error.current = onError;
  useEffect(() => {
    const browser = window as SpeechWindow; setSupported(!!(browser.SpeechRecognition || browser.webkitSpeechRecognition)); setReadable('speechSynthesis' in window);
    return () => { if (recognition.current) { recognition.current.onend = null; recognition.current.onresult = null; recognition.current.onerror = null; recognition.current.abort(); } window.speechSynthesis?.cancel(); };
  }, []);
  const stopListening = () => {
    const active = recognition.current;
    recognition.current = null;
    if (active) {
      active.onresult = null; active.onerror = null; active.onend = null;
      active.abort();
    }
    setListening(false);
  };
  const stop = () => { window.speechSynthesis?.cancel(); setSpeaking(false); };
  const listen = () => {
    const Constructor = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition; if (!Constructor) return;
    if (recognition.current) { stopListening(); return; }
    const next = new Constructor(); recognition.current = next; next.lang = 'zh-CN'; next.continuous = false; next.interimResults = false;
    let recognized = '';
    next.onresult = event => { recognized = Array.from(event.results).map(result => result[0]?.transcript || '').join('').trim(); };
    next.onerror = event => {
      if (recognition.current !== next) return;
      stopListening();
      onError(event.error === 'not-allowed' ? '浏览器未获得麦克风权限，仍可直接输入文字。' : `语音输入未完成（${event.error}），请检查浏览器支持与权限。`);
    };
    next.onend = () => {
      if (recognition.current !== next) return;
      recognition.current = null;
      setListening(false);
      if (recognized) transcript.current(recognized);
    };
    try { next.start(); setListening(true); } catch { stopListening(); onError('浏览器暂时无法开始语音输入。'); }
  };
  const read = useCallback((text: string) => {
    if (!text.trim() || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); const value = new SpeechSynthesisUtterance(text); value.lang = 'zh-CN'; value.onend = () => setSpeaking(false); value.onerror = () => { setSpeaking(false); error.current('朗读未完成，可以重新开始或直接阅读文字。'); }; window.speechSynthesis.speak(value); setSpeaking(true);
  }, []);
  return { supported, readable, listening, speaking, listen, read, stop, stopListening };
}
