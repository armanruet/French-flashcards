import './style.css'
import { AudioHandler } from './audio.js';
import { QuizHandler } from './quiz.js';

const state = {
  allCards: [],
  filteredCards: [],
  currentIndex: 0,
  isFlipped: false,
  isQuizMode: false
};

const audioHandler = new AudioHandler();
let quizHandler = null;

// DOM Elements
const cardElement = document.getElementById('flashcard');
const els = {
  // ... existing elements ...
  word: document.getElementById('card-word'),
  pos: document.getElementById('card-pos'),
  translation: document.getElementById('card-translation'),
  nativeEx: document.getElementById('card-ex-native'),
  enEx: document.getElementById('card-ex-en'),
  level: document.getElementById('card-level'),
  freq: document.getElementById('card-freq'),
  progress: document.getElementById('progress-display'),
  filter: document.getElementById('cefr-filter'),

  // Views
  cardScene: document.querySelector('.card-scene'),
  controls: document.getElementById('flashcard-controls'),
  quizView: document.getElementById('quiz-view'),
  btnMode: document.getElementById('btn-mode-toggle'),
  footerLinks: document.querySelector('.footer-links'),

  // Quiz UI
  qWord: document.getElementById('quiz-word'),
  qSentence: document.getElementById('quiz-sentence'),
  qTranslation: document.getElementById('quiz-translation'),
  qOptions: document.getElementById('quiz-options'),
  qFooter: document.getElementById('quiz-footer'),
  qFeedback: document.getElementById('quiz-feedback'),
  qBtnNext: document.getElementById('btn-quiz-next'),

  // Audio
  btnAudioFront: document.getElementById('btn-audio-front'),
  btnAudioBack: document.getElementById('btn-audio-back'),

  // Settings
  btnSettings: document.getElementById('btn-settings'),
  btnCloseSettings: document.getElementById('btn-close-settings'),
  btnSaveSettings: document.getElementById('btn-save-settings'),
  modalSettings: document.getElementById('settings-modal'),
  inputApiKey: document.getElementById('input-api-key'),
  groupOpenApiKey: document.getElementById('group-openai-key'),
  radioProviders: document.getElementsByName('audio-provider')
};

async function init() {
  try {
    const response = await fetch('/flashcards.json');
    if (!response.ok) throw new Error('Failed to load flashcards');

    state.allCards = await response.json();
    state.allCards.sort((a, b) => (a.word_frequency || 99999) - (b.word_frequency || 99999));

    loadSettings();
    applyFilter();
    setupEventListeners();
  } catch (err) {
    console.error(err);
    if (els.progress) els.progress.textContent = 'Error loading cards.';
  }
}

function loadSettings() {
  const provider = localStorage.getItem('audio_provider') || 'wikimedia';
  const apiKey = localStorage.getItem('openai_api_key') || '';
  const coquiUrl = localStorage.getItem('coqui_url') || 'http://localhost:8000/tts';
  const coquiSpeaker = localStorage.getItem('coqui_speaker') || '';

  // Updates UI
  Array.from(els.radioProviders).forEach(rad => {
    rad.checked = rad.value === provider;
  });

  els.inputApiKey.value = apiKey;

  const inputCoquiUrl = document.getElementById('input-coqui-url');
  const inputCoquiSpeaker = document.getElementById('input-coqui-speaker');
  if (inputCoquiUrl) inputCoquiUrl.value = coquiUrl;
  if (inputCoquiSpeaker) inputCoquiSpeaker.value = coquiSpeaker;

  toggleApiKeyField();

  // Environment Check
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.hostname.endsWith('.local');
  const coquiLabel = document.getElementById('label-coqui-option');

  if (coquiLabel) {
    if (isLocal) {
      coquiLabel.classList.remove('hidden');
    } else {
      coquiLabel.classList.add('hidden');
      // Fallback if user had Coqui selected but is now on deploy
      if (provider === 'coqui') {
        console.warn('Coqui not available on deployed site, falling back to wikimedia');
        audioHandler.setProvider('wikimedia'); // fallback
        // Update UI to standard
        Array.from(els.radioProviders).find(r => r.value === 'wikimedia').checked = true;
      }
    }
  }

  // Initial setup of handler
  audioHandler.setProvider(provider === 'coqui' && !isLocal ? 'wikimedia' : provider);
  audioHandler.setApiKey(apiKey);
}

function toggleApiKeyField() {
  const provider = document.querySelector('input[name="audio-provider"]:checked').value;

  // Toggle OpenAI
  const showOpenAI = provider === 'openai';
  els.groupOpenApiKey.style.display = showOpenAI ? 'flex' : 'none';

  // Toggle Coqui
  const showCoqui = provider === 'coqui';
  const groupCoqui = document.getElementById('group-coqui-config');
  if (groupCoqui) {
    groupCoqui.style.display = showCoqui ? 'flex' : 'none';
  }
}

function saveSettings() {
  const provider = document.querySelector('input[name="audio-provider"]:checked').value;
  const apiKey = els.inputApiKey.value.trim();

  // Coqui settings
  const coquiUrl = document.getElementById('input-coqui-url').value.trim();
  const coquiSpeaker = document.getElementById('input-coqui-speaker').value.trim();

  // Save to stored preferences
  localStorage.setItem('audio_provider', provider);
  localStorage.setItem('openai_api_key', apiKey);
  localStorage.setItem('coqui_url', coquiUrl);
  localStorage.setItem('coqui_speaker', coquiSpeaker);

  audioHandler.setProvider(provider);
  audioHandler.setApiKey(apiKey);
  audioHandler.setCoquiConfig(coquiUrl, coquiSpeaker);

  // Close modal
  toggleModal(false);

  // Show quick feedback
  // For Coqui, we might want to warn if URL is empty, but defaults handle it.
  alert(`Settings saved! Active provider: ${provider}`);
}

function toggleModal(show) {
  if (show) {
    els.modalSettings.classList.remove('hidden');
    // Reload settings into inputs in case they were changed but cancelled
    loadSettings();
  } else {
    els.modalSettings.classList.add('hidden');
  }
}

function playFrontAudio(e) {
  e.stopPropagation(); // Prevent card flip
  const card = state.filteredCards[state.currentIndex];
  if (card && card.word) {
    // Animate button
    els.btnAudioFront.style.transform = "scale(0.9)";
    setTimeout(() => els.btnAudioFront.style.transform = "", 200);

    audioHandler.play(card.word);
  }
}

function playBackAudio(e) {
  e.stopPropagation();
  const card = state.filteredCards[state.currentIndex];
  if (card && card.example_sentence_native) {
    // Animate button
    els.btnAudioBack.style.transform = "scale(0.9)";
    setTimeout(() => els.btnAudioBack.style.transform = "", 200);

    audioHandler.play(card.example_sentence_native);
  }
}

function applyFilter() {
  const level = els.filter.value;

  if (level === 'all') {
    state.filteredCards = [...state.allCards];
  } else {
    state.filteredCards = state.allCards.filter(card => card.cefr_level === level);
  }

  state.currentIndex = 0;
  state.isFlipped = false;
  cardElement.classList.remove('is-flipped');

  if (state.filteredCards.length === 0) {
    showEmptyState();
  } else {
    renderCard();
  }
}

function showEmptyState() {
  els.word.textContent = 'No Cards Found';
  els.translation.textContent = '';
  els.nativeEx.textContent = 'Try a different filter.';
  els.enEx.textContent = '';
  els.pos.textContent = '';
  els.level.textContent = '-';
  els.freq.textContent = '-';
  els.progress.textContent = '0 / 0';
}

function renderCard() {
  if (state.filteredCards.length === 0) return;

  const card = state.filteredCards[state.currentIndex];

  // Front
  els.word.textContent = card.word || 'Unknown';
  els.pos.textContent = card.pos || 'Word';
  els.level.textContent = card.cefr_level || 'N/A';
  els.freq.textContent = card.word_frequency ? `#${card.word_frequency}` : '';

  // Back
  els.translation.textContent = card.english_translation || 'No translation';
  els.nativeEx.textContent = card.example_sentence_native || '';
  els.enEx.textContent = card.example_sentence_english || '';

  // Handle Visuals (AI Context Images)
  const imgContainer = document.getElementById('card-image');
  if (imgContainer) {
    imgContainer.style.display = 'none';
    imgContainer.innerHTML = '';

    if (card.word) {
      // Normalize word to match filename (e.g. être -> etre)
      const slug = card.word.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const imgPath = `/images/${slug}.png`;

      // Try to load image
      const img = new Image();
      img.src = imgPath;
      img.onload = () => {
        imgContainer.style.display = 'flex';
        imgContainer.innerHTML = ''; // Clear any previous
        imgContainer.appendChild(img);
      };
      img.onerror = () => {
        // No image for this word, keep hidden
        imgContainer.style.display = 'none';
      };
    }
  }

  // Progress
  els.progress.textContent = `Card ${state.currentIndex + 1} of ${state.filteredCards.length}`;
}

function nextCard() {
  if (state.filteredCards.length === 0) return;
  state.currentIndex = (state.currentIndex + 1) % state.filteredCards.length;
  resetFlip();
}

function prevCard() {
  if (state.filteredCards.length === 0) return;
  state.currentIndex = (state.currentIndex - 1 + state.filteredCards.length) % state.filteredCards.length;
  resetFlip();
}

function shuffleCards() {
  for (let i = state.filteredCards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.filteredCards[i], state.filteredCards[j]] = [state.filteredCards[j], state.filteredCards[i]];
  }
  state.currentIndex = 0;
  resetFlip();
}

function resetFlip() {
  state.isFlipped = false;
  cardElement.classList.remove('is-flipped');
  renderCard();
}

function toggleFlip(e) {
  // If clicking button, ignore (handled by stopPropagation, but double check)
  if (e.target.closest('button')) return;

  state.isFlipped = !state.isFlipped;
  cardElement.classList.toggle('is-flipped');
}


// --- Quiz Mode Logic ---

function toggleMode() {
  state.isQuizMode = !state.isQuizMode;

  if (state.isQuizMode) {
    // Switch to Quiz
    els.cardScene.style.display = 'none';
    els.controls.style.display = 'none';
    els.quizView.classList.remove('hidden');
    els.btnMode.textContent = 'Back to Flashcards';

    // Init quiz if needed
    if (!quizHandler) {
      quizHandler = new QuizHandler(state.allCards, renderQuizQuestion);
    }
    quizHandler.startNewQuestion();

  } else {
    // Switch to Flashcards
    els.cardScene.style.display = 'block';
    els.controls.style.display = 'flex';
    els.quizView.classList.add('hidden');
    els.btnMode.textContent = 'Practice Quiz';
  }
}

function renderQuizQuestion(data) {
  els.qWord.textContent = data.word;
  els.qSentence.textContent = data.sentence ? `"${data.sentence}"` : '';

  // Prepare translation but keep hidden
  els.qTranslation.textContent = data.sentenceEn || '';
  els.qTranslation.classList.add('hidden');

  // Clear options
  els.qOptions.innerHTML = '';
  els.qFooter.classList.add('hidden'); // Hide feedback until answered

  // Create buttons
  const letters = ['A', 'B', 'C', 'D'];
  data.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option';
    btn.innerHTML = `
      <span class="opt-letter">${letters[idx]}.</span>
      <span class="opt-text">${opt.text}</span>
    `;
    btn.onclick = () => handleQuizAnswer(idx, btn);
    els.qOptions.appendChild(btn);
  });
}

function handleQuizAnswer(index, btnElement) {
  const result = quizHandler.checkAnswer(index);
  if (!result) return; // Already answered

  // Show Feedback
  els.qFooter.classList.remove('hidden');

  // Show Translation
  if (els.qTranslation.textContent) {
    els.qTranslation.classList.remove('hidden');
  }

  // Update UI
  const allBtns = els.qOptions.querySelectorAll('.quiz-option');

  // Highlight correct answer always
  allBtns[result.correctIndex].classList.add('correct');

  if (result.isCorrect) {
    els.qFeedback.textContent = 'Correct! 🎉';
    els.qFeedback.style.color = '#22c55e';
    // Play sound?
  } else {
    els.qFeedback.textContent = 'Incorrect';
    els.qFeedback.style.color = '#ef4444';
    btnElement.classList.add('incorrect');
  }
}

function setupEventListeners() {
  // Navigation
  document.getElementById('btn-next').addEventListener('click', nextCard);
  document.getElementById('btn-prev').addEventListener('click', prevCard);
  document.getElementById('btn-shuffle').addEventListener('click', shuffleCards);

  // Mode Toggle
  els.btnMode.addEventListener('click', toggleMode);

  // Quiz Next
  els.qBtnNext.addEventListener('click', () => {
    quizHandler.startNewQuestion();
  });

  // Audio
  els.btnAudioFront.addEventListener('click', playFrontAudio);
  els.btnAudioBack.addEventListener('click', playBackAudio);

  // Settings
  els.btnSettings.addEventListener('click', () => toggleModal(true));
  els.btnCloseSettings.addEventListener('click', () => toggleModal(false));
  els.btnSaveSettings.addEventListener('click', saveSettings);

  // Radio toggle info
  Array.from(els.radioProviders).forEach(rad => {
    rad.addEventListener('change', toggleApiKeyField);
  });

  // Card Flip
  document.querySelector('.card-scene').addEventListener('click', toggleFlip);

  // Filter
  els.filter.addEventListener('change', applyFilter);

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (!els.modalSettings.classList.contains('hidden')) return; // No shortcuts if modal open

    switch (e.key) {
      case 'ArrowRight':
      case 'l':
        nextCard();
        break;
      case 'ArrowLeft':
      case 'h':
        prevCard();
        break;
      case ' ':
      case 'Enter':
      case 'ArrowUp':
      case 'ArrowDown':
        e.preventDefault();
        toggleFlip({ target: document.body }); // mock event
        break;
    }
  });
}

// Start
init();
