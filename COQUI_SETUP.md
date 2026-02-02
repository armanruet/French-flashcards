# How to Set Up Coqui XTTS (Custom Backend)

We use a custom Python server to run the high-quality Coqui XTTS v2 model.

## Prerequisites
1.  **Python 3.10+**
2.  **Git**
3.  **ffmpeg** (Required for audio processing)
    - Mac: `brew install ffmpeg`
    - Windows: `choco install ffmpeg` (or download from website)

## Step 1: Install Dependencies
Navigate to the `server/` directory and install the required packages.

```bash
cd server
pip install -r requirements.txt
```

*(Note: If you have a GPU, ensure you install the CUDA version of PyTorch for faster generation)*

## Step 2: Add a Voice Reference
XTTS needs a 6-second audio clip of a voice to "clone" (or just use as the speaker).
1.  Find any clean .wav file of a voice you like (or record yourself).
2.  Name it `reference.wav`.
3.  Place it inside the `server/` folder.

## Step 3: Run the Server
Run the server using Python:

```bash
python app.py
```

*First run will automatically download the XTTS v2 model (approx 2GB).*

The server will start at `http://localhost:8000`.

## Step 4: Configure the App
1.  In the Flashcard App, go to **Settings**.
2.  Select **Local Coqui XTTS**.
3.  Ensure the URL is set to: `http://localhost:8000/tts`.
4.  (Optional) You can leave "Speaker ID" empty; it will default to `reference.wav` on the server.
