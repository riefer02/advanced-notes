import { useState, useRef, useEffect } from 'react'
import { useTranscribeAudio } from '../hooks/useNotes'
import type { TranscriptionResponse } from '../lib/api'

export default function AudioUploader() {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [lastResult, setLastResult] = useState<TranscriptionResponse | null>(null)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)

  // Use TanStack Query mutation
  const transcribeMutation = useTranscribeAudio()

  // When transcription succeeds, notify the NotesPanel
  useEffect(() => {
    if (transcribeMutation.isSuccess && transcribeMutation.data) {
      setLastResult(transcribeMutation.data)
      
      // Send category result to NotesPanel via global callback
      if (typeof window !== 'undefined' && (window as any).__setLatestCategory) {
        (window as any).__setLatestCategory(transcribeMutation.data.categorization)
      }
    }
  }, [transcribeMutation.isSuccess, transcribeMutation.data])

  const transcribeAudio = async (audioBlob: Blob) => {
    transcribeMutation.mutate(audioBlob)
  }

  const onFile = async (file: File) => {
    transcribeAudio(file)
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })
        transcribeAudio(audioBlob)
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)

      // Start timer
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    } catch (e: any) {
      transcribeMutation.reset()
      // Set error via mutation (we'll need to handle this differently)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-4">
      <div className="border-b pb-4">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          🐺 Chisos
        </h1>
        <p className="text-sm text-gray-600 mt-2">
          Record or upload audio to transcribe and organize your notes
        </p>
      </div>

      {/* Record Audio */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Record Audio
        </label>
        <div className="flex items-center gap-3">
          {!isRecording ? (
            <button
              onClick={startRecording}
              disabled={transcribeMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
              </svg>
              Start Recording
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 font-medium transition-colors"
            >
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              Stop Recording ({formatTime(recordingTime)})
            </button>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white text-gray-500">or</span>
        </div>
      </div>

      {/* Upload File */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Upload Audio File
        </label>
        <input
          type="file"
          accept="audio/*"
          className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none hover:bg-gray-100 p-2"
          onChange={(e) => e.target.files && onFile(e.target.files[0])}
          disabled={transcribeMutation.isPending || isRecording}
        />
      </div>

      {transcribeMutation.isPending && (
        <div className="flex items-center space-x-2 text-blue-600">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="font-medium">Transcribing audio...</p>
        </div>
      )}

      {transcribeMutation.isError && (
        <div className="rounded-lg bg-red-50 p-4 border border-red-200">
          <h3 className="text-sm font-semibold text-red-800">Error</h3>
          <p className="text-sm text-red-700 mt-1">
            {transcribeMutation.error instanceof Error
              ? transcribeMutation.error.message
              : 'Transcription failed'}
          </p>
        </div>
      )}

      {lastResult && (
        <div className="rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 p-6 border border-gray-200 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Transcript</h2>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <pre className="whitespace-pre-wrap text-gray-800 font-mono text-sm leading-relaxed">
              {lastResult.text}
            </pre>
          </div>
          
          {lastResult.meta && (
            <div className="mt-4 pt-4 border-t border-gray-300">
              <h3 className="text-xs font-semibold text-gray-600 uppercase mb-2">Metadata</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white rounded px-3 py-2 border border-gray-200">
                  <span className="text-gray-500">Device:</span>{' '}
                  <span className="font-medium text-gray-800">{lastResult.meta.device}</span>
                </div>
                <div className="bg-white rounded px-3 py-2 border border-gray-200">
                  <span className="text-gray-500">Model:</span>{' '}
                  <span className="font-medium text-gray-800">{lastResult.meta.model?.split('/')[1] || lastResult.meta.model}</span>
                </div>
                {lastResult.meta.sample_rate && (
                  <div className="bg-white rounded px-3 py-2 border border-gray-200">
                    <span className="text-gray-500">Sample Rate:</span>{' '}
                    <span className="font-medium text-gray-800">{lastResult.meta.sample_rate} Hz</span>
                  </div>
                )}
                {(lastResult.meta.duration || lastResult.meta.duration_sec) && (
                  <div className="bg-white rounded px-3 py-2 border border-gray-200">
                    <span className="text-gray-500">Duration:</span>{' '}
                    <span className="font-medium text-gray-800">
                      {((lastResult.meta.duration || lastResult.meta.duration_sec || 0)).toFixed(2)}s
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

