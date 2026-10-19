import { useCallback, useEffect, useRef, useState } from 'react'

const MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg;codecs=opus',
  'audio/wav',
]

/** Blobs smaller than this are almost certainly a failed/empty recording. */
const MIN_RECORDING_BYTES = 1000

function preferredMimeType(): string {
  for (const mimeType of MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType
    }
  }
  return 'audio/webm'
}

function stopTracks(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop())
}

function describeRecordingError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Failed to start recording'
  }

  switch (error.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Microphone permission denied. Please allow microphone access in your browser settings.'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No microphone found. Please connect a microphone and try again.'
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Microphone is already in use by another application.'
    case 'NotSupportedError':
      return 'Audio recording is not supported on this browser. Try using a different browser.'
    default:
      return error.message ? `Recording error: ${error.message}` : 'Failed to start recording'
  }
}

/**
 * Shared microphone recording lifecycle.
 *
 * Guarantees the microphone and timer are released on unmount, and never
 * transcribes partial audio when a recording is interrupted by navigation.
 * Each recording owns its stream/chunks so a late `onstop` from a previous
 * recording cannot stop or contaminate a newer one.
 */
export function useAudioRecorder(onComplete: (blob: Blob) => void) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const mountedRef = useRef(true)
  const onCompleteRef = useRef(onComplete)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    setIsRecording(false)
    clearTimer()
  }, [clearTimer])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearTimer()

      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        // Detach so unmounting does not transcribe partial audio.
        recorder.onstop = null
        recorder.stop()
      }
      mediaRecorderRef.current = null
      stopTracks(streamRef.current)
      streamRef.current = null
    }
  }, [clearTimer])

  const startRecording = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      // The component may have unmounted while permission was pending.
      if (!mountedRef.current) {
        stopTracks(stream)
        return
      }

      const mimeType = preferredMimeType()

      let recorder: MediaRecorder
      try {
        recorder = new MediaRecorder(stream, { mimeType })
      } catch (err) {
        stopTracks(stream)
        throw err
      }

      // Per-recording state. A stopped recorder's handlers must never touch a
      // newer recording's stream, chunks, or timer.
      const chunks: Blob[] = []
      const isCurrent = () => mediaRecorderRef.current === recorder

      streamRef.current = stream
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      recorder.onstop = () => {
        stopTracks(stream)
        if (isCurrent()) {
          mediaRecorderRef.current = null
          streamRef.current = null
          clearTimer()
        }

        if (!mountedRef.current) return

        const audioBlob = new Blob(chunks, {
          type: recorder.mimeType || mimeType || 'audio/webm',
        })

        if (audioBlob.size === 0) {
          setError('Recording failed: No audio data captured. Please try again.')
          return
        }
        if (audioBlob.size < MIN_RECORDING_BYTES) {
          setError('Recording too short. Please record for at least 1 second.')
          return
        }

        onCompleteRef.current(audioBlob)
      }

      recorder.start(1000)
      setIsRecording(true)
      setRecordingTime(0)
      clearTimer()
      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)
    } catch (err: unknown) {
      setError(describeRecordingError(err))
    }
  }, [clearTimer])

  const clearError = useCallback(() => setError(null), [])

  return {
    isRecording,
    recordingTime,
    error,
    startRecording,
    stopRecording,
    clearError,
  }
}
