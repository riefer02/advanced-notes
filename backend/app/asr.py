import io
import torch
import soundfile as sf
import numpy as np
import nemo.collections.asr as nemo_asr
from pydub import AudioSegment

_MODEL_CACHE = {"model": None, "device": None}
MODEL_NAME = "nvidia/parakeet-tdt-0.6b-v3"

def _load_model():
    """Load and cache the ASR model with MPS/CPU device selection."""
    if _MODEL_CACHE["model"] is not None:
        return _MODEL_CACHE["model"], _MODEL_CACHE["device"]
    
    # Detect Apple Silicon MPS or fallback to CPU
    device = torch.device("mps") if torch.backends.mps.is_available() else torch.device("cpu")
    print(f"Loading ASR model on device: {device}")
    
    # First call downloads .nemo checkpoint from HuggingFace cache
    asr_model = nemo_asr.models.ASRModel.from_pretrained(model_name=MODEL_NAME)
    
    try:
        asr_model.to(device)
    except Exception as e:
        print(f"Could not move model to {device}, using CPU: {e}")
        device = torch.device("cpu")
    
    asr_model.eval()
    
    _MODEL_CACHE["model"] = asr_model
    _MODEL_CACHE["device"] = device
    
    print(f"Model loaded successfully on {device}")
    return asr_model, device

def transcribe_bytes(audio_bytes: bytes):
    """
    Transcribe audio from raw bytes.
    
    Args:
        audio_bytes: Audio file bytes (WAV, FLAC, OGG, WebM, MP3, etc.)
    
    Returns:
        tuple: (transcribed_text, metadata_dict)
    """
    # Try to read with soundfile first (supports WAV, FLAC, OGG)
    try:
        wav, sr = sf.read(io.BytesIO(audio_bytes))
    except Exception as e:
        # If soundfile fails (e.g., WebM, MP3), use pydub to convert
        print(f"soundfile failed, using pydub for conversion: {e}")
        try:
            # Load with pydub (supports WebM, MP3, etc. via ffmpeg)
            audio = AudioSegment.from_file(io.BytesIO(audio_bytes))
            
            # Convert to mono if stereo
            if audio.channels > 1:
                audio = audio.set_channels(1)
            
            # Get sample rate
            sr = audio.frame_rate
            
            # Convert to numpy array (float32, normalized to [-1, 1])
            samples = np.array(audio.get_array_of_samples(), dtype=np.float32)
            
            # Normalize based on sample width
            if audio.sample_width == 2:  # 16-bit
                wav = samples / 32768.0
            elif audio.sample_width == 4:  # 32-bit
                wav = samples / 2147483648.0
            else:
                wav = samples / (2 ** (audio.sample_width * 8 - 1))
            
        except Exception as e2:
            raise ValueError(f"Unable to decode audio format: {e2}")
    
    # Convert stereo to mono if needed (for soundfile path)
    if wav.ndim > 1:
        wav = wav.mean(axis=1)
    
    wav = wav.astype("float32")
    
    model, device = _load_model()
    
    # NeMo requires file paths for transcription
    import tempfile
    import os
    
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        sf.write(f.name, wav, sr)
        temp_path = f.name
    
    try:
        preds = model.transcribe([temp_path], batch_size=1)
    finally:
        # Clean up temp file
        if os.path.exists(temp_path):
            os.unlink(temp_path)
    
    # Extract text from predictions (handle both string and tensor results)
    if preds and len(preds) > 0:
        pred = preds[0]
        # Convert to string if it's a tensor or other type
        if hasattr(pred, 'text'):
            text = pred.text
        elif isinstance(pred, str):
            text = pred
        else:
            text = str(pred)
    else:
        text = ""
    
    meta = {
        "device": str(device),
        "sample_rate": sr,
        "model": MODEL_NAME,
        "duration_sec": len(wav) / sr
    }
    
    return text, meta

