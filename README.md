# 🇫🇷 French Mastery Flashcards

A modern, interactive, and aesthetically pleasing flashcard application designed to help you master the most frequent French words. Built with **Vue** (Vanilla JS + Vite), **Glassmorphism UI**, and a hybrid **Audio Engine**.

🔗 **[Live Demo](https://armanruet.github.io/French-flashcards/)**

![App Screenshot](public/images/ville.png)

## ✨ Features

-   **🧠 Smart Learning**: Focus on the most frequent French words with CEFR level indicators (A1-C2).
-   **🎨 Premium UI**: Beautiful dark-mode design with glassmorphism effects, smooth 3D card flips, and responsive layout.
-   **📝 Quiz Mode**: Test your knowledge in a multiple-choice quiz format with context sentences that reveal translations upon answering.
-   **🔊 Hybrid Audio Engine**:
    -   **Wikimedia Commons**: Real human recordings (High quality, Open Source).
    -   **Browser Native**: Instant TTS fallback (Offline capable).
    -   **Local AI (Coqui XTTS)**: High-fidelity neural TTS (Requires local backend).
    -   **OpenAI**: Optional integration for premium TTS.

## 🚀 Getting Started

### Prerequisites

-   Node.js (v18+)
-   Python 3.10+ (Only for Local AI Audio)

### 💻 Run Frontend (Standard)

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/armanruet/French-flashcards.git
    cd French-flashcards
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Start the development server**:
    ```bash
    npm run dev
    ```

4.  Open `http://localhost:5173` in your browser.

---

## 🛠️ Advanced: Local AI Audio Server

To unlock the **"Local Coqui XTTS"** audio option (High-Quality AI Voices without API costs), you need to run the Python backend.

1.  **Navigate to the server directory**:
    ```bash
    cd server
    ```

2.  **Create a virtual environment** (recommended):
    ```bash
    python3 -m venv venv
    source venv/bin/activate # On Windows: venv\Scripts\activate
    ```

3.  **Install Python dependencies**:
    ```bash
    pip install -r requirements.txt
    ```
    *(Note: You may need to install Torch separately depending on your OS/GPU)*

4.  **Run the TTS Server**:
    ```bash
    python app.py
    ```

5.  The server will start on `http://localhost:8000`. In the web app **Settings**, select **Local Coqui XTTS**.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is open source.
