# Audio Recording System

## Overview

The Chisos audio recording system enables users to record voice notes directly in the browser on both desktop and mobile devices. The system automatically transcribes recordings using OpenAI's `gpt-transcribe` model and organizes them with AI-powered categorization.

## Architecture

```
┌─────────────────┐
│  User Browser   │
│  (Mobile/Web)   │
└────────┬────────┘
         │
         │ MediaRecorder API
         │ (audio/mp4 or audio/webm)
         ▼
┌─────────────────┐
│  AudioUploader  │
│   Component     │
└────────┬────────┘
         │
         │ Blob → FormData
         ▼
┌─────────────────┐
│   API Client    │
│   (api.ts)      │
└────────┬────────┘
         │
         │ POST /api/transcribe
         │ (multipart/form-data)
         ▼
┌─────────────────┐
│ Flask Backend   │
│  (routes.py)    │
└────────┬────────┘
         │
         │ Extract content_type
         ▼
┌─────────────────┐
│  ASR Service    │
│   (asr.py)      │
└────────┬────────┘
         │
         │ Temp file with correct extension
         ▼
┌─────────────────┐
│  OpenAI API     │
│  Transcription  │
└────────┬────────┘
         │
         │ Transcribed text
         ▼
┌─────────────────┐
│ AI Categorizer  │
│  + Storage      │
└─────────────────┘
```

## Browser Compatibility

### MIME Type Support

Different browsers and platforms support different audio codecs:

| Browser/Platform | Primary Format | Fallback Options |
|-----------------|----------------|------------------|
| iOS Safari      | audio/mp4      | audio/wav        |
| Android Chrome  | audio/webm     | audio/ogg        |
| Desktop Chrome  | audio/webm     | audio/ogg        |
| Desktop Safari  | audio/mp4      | audio/wav        |
| Desktop Firefox | audio/webm     | audio/ogg        |

### Dynamic MIME Type Detection

The `AudioUploader` component uses `MediaRecorder.isTypeSupported()` to detect the best available format:

```typescript
const getSupportedMimeType = (): string => {
  const mimeTypes = [
    'audio/mp4',              // iOS Safari, Desktop Safari
    'audio/webm;codecs=opus', // Chrome, Firefox (best quality)
    'audio/webm',             // Chrome, Firefox (fallback)
    'audio/ogg;codecs=opus',  // Firefox (fallback)
    'audio/wav'               // Universal fallback
  ]

  for (const mimeType of mimeTypes) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType
    }
  }
  
  return '' // Use browser default
}
```

## Frontend Implementation

### AudioUploader Component

**Location:** `frontend/src/components/AudioUploader.tsx`

#### Key Features

1. **Dynamic Format Selection**
   - Detects supported MIME types at runtime
   - Uses the best available codec for the current browser

2. **Mobile-Optimized Recording**
   - Uses timeslice recording (1000ms intervals)
   - Prevents memory issues on mobile devices
   - Collects audio chunks progressively

3. **Enhanced Audio Constraints**
   ```typescript
   const stream = await navigator.mediaDevices.getUserMedia({ 
     audio: {
       echoCancellation: true,
       noiseSuppression: true,
       autoGainControl: true
     }
   })
   ```

4. **Comprehensive Error Handling**
   - `NotAllowedError`: Microphone permission denied
   - `NotFoundError`: No microphone detected
   - `NotReadableError`: Microphone in use by another app
   - `NotSupportedError`: Browser doesn't support recording

5. **Debug Logging**
   - Logs selected MIME type
   - Logs blob size and type on stop
   - Logs errors with full context

### Recording Flow

1. **Start Recording**
   ```typescript
   // Request microphone access
   const stream = await getUserMedia({ audio: {...} })
   
   // Create recorder with best MIME type
   const mimeType = getSupportedMimeType()
   const recorder = new MediaRecorder(stream, { mimeType })
   
   // Start with timeslice (1000ms chunks)
   recorder.start(1000)
   ```

2. **Collect Audio Chunks**
   ```typescript
   recorder.ondataavailable = (e) => {
     if (e.data.size > 0) {
       chunksRef.current.push(e.data)
     }
   }
   ```

3. **Stop Recording**
   ```typescript
   recorder.onstop = () => {
     // Create blob with correct MIME type
     const audioBlob = new Blob(chunks, { type: mimeType })
     
     // Send to backend
     transcribeAudio(audioBlob)
     
     // Clean up stream
     stream.getTracks().forEach(track => track.stop())
   }
   ```

## API Client

**Location:** `frontend/src/lib/api.ts`

### Format-Aware Upload

The API client maps MIME types to file extensions and creates proper FormData:

```typescript
export async function transcribeAudio(audioBlob: Blob): Promise<TranscriptionResponse> {
  // Map MIME type to extension
  const mimeToExt: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/m4a': 'm4a',
  }
  
  // Extract base type (handle "audio/webm;codecs=opus")
  const baseType = audioBlob.type.split(';')[0].trim()
  const extension = mimeToExt[baseType] || 'webm'
  
  // Create FormData with proper filename
  const formData = new FormData()
  formData.append('file', audioBlob, `recording.${extension}`)
  
  // Upload with auth
  const response = await fetch(`${API_URL}/api/transcribe`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: formData,
  })
  
  return response.json()
}
```

## Backend Implementation

### Routes Handler

**Location:** `backend/app/routes.py`

Extracts content type from the uploaded file:

```python
@bp.post("/transcribe")
@require_auth
def transcribe():
    user_id = g.user_id
    
    # Handle file upload
    content_type = None
    if "file" in request.files:
        file = request.files["file"]
        data = file.read()
        content_type = file.content_type  # e.g., "audio/mp4"
    else:
        # Handle raw bytes
        data = request.get_data()
        content_type = request.content_type
    
    # Pass to transcription service
    text, meta = transcribe_bytes(data, content_type)
    
    # ... categorization and storage ...
```

### ASR Service

**Location:** `backend/app/asr.py`

Maps MIME types to file extensions for OpenAI API:

```python
def transcribe_bytes(audio_bytes: bytes, content_type: str | None = None):
    """
    Transcribe audio using OpenAI gpt-transcribe.
    Supports: mp3, mp4, mpeg, mpga, m4a, wav, webm (up to 25MB)
    """
    # Map MIME types to extensions
    mime_to_ext = {
        'audio/webm': '.webm',
        'audio/mp4': '.mp4',
        'audio/m4a': '.m4a',
        'audio/mpeg': '.mp3',
        'audio/mp3': '.mp3',
        'audio/wav': '.wav',
        'audio/wave': '.wav',
        'audio/ogg': '.ogg',
        'audio/x-m4a': '.m4a',
    }
    
    # Handle content types with codecs
    extension = '.webm'  # default
    if content_type:
        base_type = content_type.split(';')[0].strip().lower()
        extension = mime_to_ext.get(base_type, '.webm')
    
    # Create temp file with correct extension
    with tempfile.NamedTemporaryFile(suffix=extension, delete=False) as temp_file:
        temp_file.write(audio_bytes)
        temp_path = temp_file.name
    
    try:
        # Send to OpenAI
        with open(temp_path, "rb") as audio_file:
            response = client.audio.transcriptions.create(
                model="gpt-transcribe",
                file=audio_file,
                response_format="json",
            )
        
        meta = {
            "model": "gpt-transcribe",
            "language": (response.languages or [{}])[0].get("code"),
            "duration": (
                response.usage.seconds
                if response.usage and response.usage.type == "duration"
                else None
            ),
        }
        return response.text, meta
    finally:
        os.unlink(temp_path)
```

## OpenAI Integration

### Supported Formats

OpenAI's transcription API accepts:
- `mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `wav`, `webm`
- Maximum file size: 25MB
- Any language supported (auto-detected)

### Model Details

- **Model:** `gpt-transcribe`
- **Advantages:**
  - Higher quality than the outgoing `whisper-1` path
  - Better punctuation and formatting
  - Faster inference
  - More accurate for diverse accents
  - Returns detected languages
- **Context controls:** `prompt`, `keywords`, and `languages` can be sent as `extra_body` fields to improve domain terms and multilingual audio.
- **Migration note:** The `gpt-4o-transcribe` and `gpt-4o-mini-transcribe` families shut down on 2027-02-26. `gpt-transcribe` has no dated snapshot, so `TRANSCRIBE_MODEL` uses the alias.

### Response Format

```json
{
  "text": "Transcribed text with proper punctuation.",
  "languages": [{"code": "en"}],
  "usage": {"type": "duration", "seconds": 12.5}
}
```

The billed duration lives in `usage.seconds`; there is no top-level `duration` field. `backend/app/asr.py` maps it into the API response's `meta.duration` for quota tracking and note metadata.

## Mobile-Specific Considerations

### iOS Safari

**Challenges:**
- Does not support `audio/webm` codec
- Requires `audio/mp4` or `audio/wav`
- Stricter permissions model
- Background recording limitations

**Solutions:**
- Dynamic MIME type detection prioritizes `audio/mp4`
- Clear permission error messages
- Timeslice recording for memory efficiency

### Android Chrome

**Challenges:**
- Varying codec support across Android versions
- Some devices have audio driver issues
- Battery optimization may interrupt recording

**Solutions:**
- Fallback through multiple formats (webm → ogg → wav)
- Timeslice recording prevents memory buildup
- Console logging for debugging device-specific issues

### Permission Handling

Mobile browsers require explicit user interaction to grant microphone access:

1. User taps "Start Recording" button
2. Browser shows permission prompt
3. User must explicitly allow/deny
4. Denied permission requires manual re-enabling in browser settings

## Debugging

### Frontend Console Logs

When recording starts:
```
Using MIME type: audio/mp4
```

When recording stops:
```
Recording stopped. Blob size: 245678, type: audio/mp4
```

On errors:
```
Recording error: NotAllowedError: Permission denied
```

### Backend Logs

The backend logs temp file extensions:
```python
# In asr.py
print(f"Creating temp file with extension: {extension}")
```

### Testing Checklist

**Desktop:**
- [ ] Chrome (audio/webm expected)
- [ ] Safari (audio/mp4 expected)
- [ ] Firefox (audio/webm expected)

**Mobile:**
- [ ] iOS Safari (audio/mp4 expected)
- [ ] iOS Chrome (audio/mp4 expected)
- [ ] Android Chrome (audio/webm expected)
- [ ] Android Firefox (audio/webm expected)

**Scenarios:**
- [ ] Short recording (< 5 seconds)
- [ ] Long recording (> 30 seconds)
- [ ] Permission denied → Allow permission → Retry
- [ ] Multiple recordings in succession
- [ ] Upload audio file (alternative to recording)

## Troubleshooting

### Recording Doesn't Start

1. **Check console for errors** - Open browser DevTools
2. **Verify MIME type support** - Check which format was selected
3. **Test microphone** - Ensure device has working microphone
4. **Check permissions** - Go to browser settings → Site settings → Microphone

### Audio Not Transcribing

1. **Check blob size** - Should be > 0 bytes
2. **Verify MIME type** - Should match supported formats
3. **Check backend logs** - Look for file extension being used
4. **Test with file upload** - Rule out recording-specific issues

### Poor Transcription Quality

1. **Check recording duration** - Very short clips may not transcribe well
2. **Test audio quality** - Ensure microphone is working properly
3. **Check for background noise** - Echo cancellation should help but isn't perfect
4. **Verify constraints are applied** - Check that echoCancellation, noiseSuppression are true

## Future Enhancements

### Potential Improvements

1. **Audio Preview**
   - Play recording before uploading
   - Visual waveform display

2. **Recording Quality Settings**
   - Adjustable bitrate
   - Sample rate configuration
   - Mono vs stereo selection

3. **Offline Support**
   - Queue recordings when offline
   - Upload when connection restored
   - IndexedDB storage for pending uploads

4. **Real-Time Transcription**
   - Use a Realtime transcription session with `gpt-live-transcribe`
   - Connect to `wss://api.openai.com/v1/realtime?intent=transcription` and send `session.update` with `type: "transcription"` and `turn_detection: null`
   - Do VAD client-side, then `input_audio_buffer.commit` per turn
   - Display `conversation.item.input_audio_transcription.delta` events and reconcile on `.completed`
   - Note: `stream=True` on the file endpoint streams SSE for an already-uploaded file; it is not live audio

5. **Audio Processing**
   - Noise reduction preprocessing
   - Silence detection/trimming
   - Audio normalization

## Related Documentation

- [Authentication Flow](./authentication-flow-explained.md) - How JWT tokens work
- [API Reference](./api-reference.md) - Complete API documentation
- [Semantic Organization](./semantic-organization-spec.md) - AI categorization details
- [Railway Deployment](./railway-deployment.md) - Production deployment guide

