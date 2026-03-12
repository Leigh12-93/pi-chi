'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

interface UseVoiceInputOptions {
  onTranscript: (text: string) => void
  onError?: (error: string) => void
  lang?: string
}

export function useVoiceInput({ onTranscript, onError, lang = 'en-AU' }: UseVoiceInputOptions) {
  const [isListening, setIsListening] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [isSupported, setIsSupported] = useState(false)
  const recognitionRef = useRef<any>(null)
  const onTranscriptRef = useRef(onTranscript)
  const onErrorRef = useRef(onError)
  onTranscriptRef.current = onTranscript
  onErrorRef.current = onError

  // Detect support client-side only (SSR-safe)
  useEffect(() => {
    const supported = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
    setIsSupported(supported)
  }, [])

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (e) { console.warn('[forge:voice] Error stopping recognition:', e) }
      recognitionRef.current = null
    }
    setIsListening(false)
    setInterimText('')
  }, [])

  const start = useCallback(async () => {
    if (!isSupported) {
      onErrorRef.current?.('Speech recognition not supported in this browser')
      return
    }

    // Request mic permission explicitly first
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      onErrorRef.current?.('Microphone access denied. Check browser permissions.')
      return
    }

    // Stop any existing session
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (e) { console.warn('[forge:voice] Error stopping recognition:', e) }
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SpeechRecognition()

    recognition.lang = lang
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onstart = () => {
      setIsListening(true)
    }

    recognition.onresult = (event: any) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          const text = result[0].transcript.trim()
          if (text) {
            onTranscriptRef.current(text)
          }
          setInterimText('')
        } else {
          interim += result[0].transcript
        }
      }
      if (interim) setInterimText(interim)
    }

    recognition.onerror = (event: any) => {
      const err = event.error as string
      if (err !== 'aborted' && err !== 'no-speech') {
        const messages: Record<string, string> = {
          'not-allowed': 'Microphone access denied',
          'network': 'Network error — speech service unavailable',
          'service-not-allowed': 'Speech service not allowed on this origin',
          'audio-capture': 'No microphone found',
        }
        onErrorRef.current?.(messages[err] || `Speech error: ${err}`)
      }
      stop()
    }

    recognition.onend = () => {
      setIsListening(false)
      setInterimText('')
      recognitionRef.current = null
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch (e: any) {
      onErrorRef.current?.(`Failed to start: ${e.message}`)
      stop()
    }
  }, [isSupported, lang, stop])

  const toggle = useCallback(() => {
    if (isListening) {
      stop()
    } else {
      start()
    }
  }, [isListening, start, stop])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch (e) { console.warn('[forge:voice] Error stopping recognition:', e) }
      }
    }
  }, [])

  return { isListening, interimText, isSupported, start, stop, toggle }
}
