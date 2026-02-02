export class AudioHandler {
    constructor() {
        this.provider = localStorage.getItem('audio_provider') || 'wikimedia'; // Default to best free option
        this.apiKey = localStorage.getItem('openai_api_key') || '';
        this.cacheName = 'tts-cache-v1';
        this.voice = null;

        // Initialize speech synthesis
        this.synth = window.speechSynthesis;
        // Voices load asynchronously
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = () => this.loadVoices();
        }
    }

    loadVoices() {
        const voices = this.synth.getVoices();
        // Prefer French France, then any French
        // Common high quality mac voices: Thomas, Amelie
        this.voice = voices.find(v => v.name === 'Thomas') ||
            voices.find(v => v.lang === 'fr-FR' && !v.name.includes('Compact')) ||
            voices.find(v => v.lang === 'fr-FR');

        console.log('Selected voice:', this.voice ? this.voice.name : 'Default');
    }

    setProvider(provider) {
        this.provider = provider;
        localStorage.setItem('audio_provider', provider);
    }

    setApiKey(key) {
        this.apiKey = key;
        localStorage.setItem('openai_api_key', key);
    }

    setCoquiConfig(url, speaker) {
        // We generally just rely on localStorage in playCoqui, but for consistency we can explicitly set or just let localStorage handle it.
        // The playCoqui method reads from localStorage directly in this implementation, 
        // but let's allow updating if we change the implementation later.
        localStorage.setItem('coqui_url', url);
        localStorage.setItem('coqui_speaker', speaker);
    }

    async play(text) {
        if (!text) return;

        if (this.provider === 'openai' && this.apiKey) {
            return this.playOpenAI(text);
        } else if (this.provider === 'wikimedia') {
            return this.playWikimedia(text);
        } else if (this.provider === 'coqui') {
            return this.playCoqui(text);
        } else {
            return this.playBrowser(text);
        }
    }

    async playWikimedia(text) {
        // Sanitize text for filename (e.g. "être" -> "Fr-être.ogg")
        // Wiki files are usually case specific, but usually lowercase word unless noun.
        // Lingua Libre uploads are often "Fr-word.ogg"
        const cleanWord = text.trim().toLowerCase();
        const filename = `Fr-${cleanWord}.ogg`;

        try {
            // Check cache first
            const cache = await caches.open(this.cacheName);
            const cacheKey = new Request(`https://commons.wikimedia.org/${encodeURIComponent(filename)}`);

            const cachedResponse = await cache.match(cacheKey);
            if (cachedResponse) {
                const blob = await cachedResponse.blob();
                this.playBlob(blob);
                return;
            }

            // 1. Fetch File Info from API
            // Origin=* is needed for CORS
            const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(filename)}&prop=imageinfo&iiprop=url&format=json&origin=*`;

            const response = await fetch(apiUrl);
            const data = await response.json();

            const pages = data.query.pages;
            const pageId = Object.keys(pages)[0];

            if (pageId === "-1" || !pages[pageId].imageinfo) {
                console.warn(`Wikimedia audio not found for: ${text}`);
                // Partial Fallback: Try looking for 'Fr-classic-[word].ogg' or just fallback to browser
                throw new Error('File not found');
            }

            const audioUrl = pages[pageId].imageinfo[0].url;

            // 2. Fetch the actual Audio Blob to cache it (and avoid hotlinking issues/latency next time)
            const audioResponse = await fetch(audioUrl);
            const audioBlob = await audioResponse.blob();

            await cache.put(cacheKey, new Response(audioBlob));

            this.playBlob(audioBlob);

        } catch (err) {
            console.log('Falling back to browser TTS', err);
            // Fallback to browser if human audio missing
            this.playBrowser(text);
        }
    }

    playBrowser(text) {
        return new Promise((resolve, reject) => {
            // Cancel current
            this.synth.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'fr-FR';

            if (this.voice) {
                utterance.voice = this.voice;
            }

            // Slightly slower for clarity
            utterance.rate = 0.9;

            utterance.onend = () => resolve();
            utterance.onerror = (err) => reject(err);

            this.synth.speak(utterance);
        });
    }

    async playCoqui(text) {
        const serverUrl = localStorage.getItem('coqui_url') || 'http://localhost:5002/api/tts';
        const speakerId = localStorage.getItem('coqui_speaker') || 'fr'; // 'fr' is not always default, but good placeholder
        // XTTS v2 often needs a 'language' param as well like 'fr'

        try {
            const cache = await caches.open(this.cacheName);
            // Hash text/config for key
            const cacheKey = new Request(`https://coqui-local/${encodeURIComponent(text)}`);

            const cachedResponse = await cache.match(cacheKey);
            if (cachedResponse) {
                const blob = await cachedResponse.blob();
                this.playBlob(blob);
                return;
            }

            // Construct URL with params
            const url = new URL(serverUrl);
            url.searchParams.append('text', text);
            // Try to intelligently guess params if user just gave base URL
            if (!url.searchParams.has('speaker_id') && speakerId) {
                // XTTS uses speaker_wav usually for cloning, or speaker_idx for multi-speaker. 
                // But standard tts-server usually expects 'speaker_id' string for some models. 
                // For XTTS specifically, it often wants a reference wav. 
                // However, simple server usage might vary. Let's try standard params.
                // If speakerId is a path to a wav, use speaker_wav, else speaker_id
                if (speakerId.endsWith('.wav')) {
                    url.searchParams.append('speaker_wav', speakerId);
                } else {
                    // For standard multi-speaker models
                    url.searchParams.append('speaker_id', speakerId);
                }
            }
            url.searchParams.append('language_id', 'fr'); // Start with French

            const response = await fetch(url.toString(), {
                method: 'GET', // Standard tts-server is GET usually
                headers: { 'Accept': 'audio/wav' } // Hint we want audio
            });

            if (!response.ok) {
                throw new Error(`Coqui Server Error: ${response.statusText}`);
            }

            const blob = await response.blob();
            await cache.put(cacheKey, new Response(blob));
            this.playBlob(blob);

        } catch (err) {
            console.error('Coqui TTS failed, falling back to browser', err);
            // Maybe alert user once
            if (!this.hasWarnedCoqui) {
                alert("Could not connect to Local Coqui Server. Check settings or run 'tts-server'. Falling back to browser.");
                this.hasWarnedCoqui = true;
            }
            this.playBrowser(text);
        }
    }

    async playOpenAI(text) {
        // ... existing implementation ...
        try {
            const cache = await caches.open(this.cacheName);
            const cacheKey = new Request(`https://tts-cache/${encodeURIComponent(text)}`);

            const cachedResponse = await cache.match(cacheKey);
            if (cachedResponse) {
                const blob = await cachedResponse.blob();
                this.playBlob(blob);
                return;
            }

            const response = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'tts-1',
                    input: text,
                    voice: 'alloy'
                })
            });

            if (!response.ok) {
                throw new Error(`OpenAI API Error: ${response.statusText}`);
            }

            const blob = await response.blob();
            await cache.put(cacheKey, new Response(blob));
            this.playBlob(blob);

        } catch (err) {
            console.error('OpenAI TTS failed, falling back to browser', err);
            this.playBrowser(text);
        }
    }

    playBlob(blob) {
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audio.play();
    }
}
