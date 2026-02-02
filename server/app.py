from fastapi import FastAPI, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from TTS.api import TTS
import io
import torch
import os

# WORKAROUND: PyTorch 2.6+ sets weights_only=True by default, which breaks Coqui TTS model loading.
# We monkey-patch torch.load to default to weights_only=False for this session.
try:
    _original_load = torch.load
    def _safe_load(*args, **kwargs):
        if 'weights_only' not in kwargs:
            kwargs['weights_only'] = False
        return _original_load(*args, **kwargs)
    torch.load = _safe_load
    print("⚠️ Applied torch.load workaround for Coqui TTS compatibility.")
except Exception as e:
    print(f"⚠️ Could not apply torch connection workaround: {e}")

app = FastAPI(title="XTTS Local Server")

# Configure CORS so the web app can talk to us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load model globally on startup to avoid reloading per request
# This might take a moment when starting the server
print("⏳ Loading XTTS model... (This may take a minute)")
device = "cuda" if torch.cuda.is_available() else "cpu"
if torch.backends.mps.is_available():
    device = "mps" # Enable Apple Silicon GPU if available
print(f"🚀 Using device: {device}")

try:
    # Initialize TTS with the XTTS v2 model
    tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
    print("✅ Model loaded successfully!")
except Exception as e:
    print(f"❌ Failed to load model: {e}")
    # We don't crash here so the server still runs, but /tts will fail
    tts = None

@app.get("/")
def home():
    return {"status": "running", "model_loaded": tts is not None}

@app.get("/tts")
async def text_to_speech(
    text: str = Query(..., description="Text to synthesize"),
    language: str = Query("fr", description="Language code (fr, en, es, etc.)"),
    speaker_wav: str = Query(None, description="Path to a reference audio file for voice cloning (optional)")
):
    if tts is None:
        return Response(content=b"Model not loaded", status_code=500)

    try:
        # XTTS requires a speaker reference. 
        # If none provided, we use a default one bundled or just pick one if the API allows simplified usage.
        # However, XTTS API usually enforces 'speaker_wav'. 
        # Making a fallback to a default sample if available or letting TTS handle defaults.
        
        # NOTE: TTS.tts() signature for XTTS: text, speaker_wav, language...
        # We need a dummy speaker_wav if the user doesn't provide one.
        # Let's see if we can use the default speaker if argument is missing.
        
        # For simplicity in this 'generic' server, let's try to assume we can just pass what we have.
        # If providing a speaker_wav is mandatory for the Python API Wrapper, we need a fallback file.
        # But commonly, the CLI/API wrapper handles 'speaker_idx' for multi-speaker models 
        # OR 'speaker_wav' for cloning. XTTS is cloning-based.
        
        # Workaround: Use a built-in speaker provided by the package if possible, 
        # or require the user to provide one. 
        # Let's try to allow 'speaker_wav' to be a path on the server OR a list of defaults.
        
        # Actually, let's allow the user to send `speaker_id` as a fallback key for preset voices if we had them.
        # But simpler: The user (web app) sends text. We need a voice.
        
        # Solution: Use a default reference included in the repo or allow the user to drop a 'reference.wav' in the server folder.
        
        default_ref = "reference.wav"
        ref_audio = speaker_wav if speaker_wav else default_ref
        
        if not os.path.exists(ref_audio):
             # Create a dummy or find one? 
             # Better: Warn the user they need a reference.wav in the folder.
             return Response(content=f"Error: 'reference.wav' not found on server. Please place a 6s wav file named '{default_ref}' in the server directory.".encode(), status_code=400)
             
        wav = tts.tts(text=text, speaker_wav=ref_audio, language=language)
        
        # Convert to bytes
        buffer = io.BytesIO()
        tts.synthesizer.save_wav(wav, buffer)
        buffer.seek(0)
        
        return Response(content=buffer.read(), media_type="audio/wav")
        
    except Exception as e:
        print(f"Error during generation: {e}")
        return Response(content=str(e).encode(), status_code=500)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
