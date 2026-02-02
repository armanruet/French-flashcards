export class QuizHandler {
    constructor(cards, onRender) {
        this.cards = cards; // All available cards
        this.onRender = onRender; // Callback to update UI
        this.currentCard = null;
        this.options = [];
        this.correctIndex = -1;
        this.isAnswered = false;

        // Sound effects (optional, using browser defaults if needed later)
    }

    startNewQuestion() {
        if (!this.cards || this.cards.length < 4) {
            console.error("Not enough cards for a quiz");
            return;
        }

        this.isAnswered = false;

        // 1. Pick a random target card
        const targetIndex = Math.floor(Math.random() * this.cards.length);
        this.currentCard = this.cards[targetIndex];

        // 2. Pick 3 distinct distractors
        const distractors = new Set();
        while (distractors.size < 3) {
            const dIndex = Math.floor(Math.random() * this.cards.length);
            if (dIndex !== targetIndex) {
                distractors.add(this.cards[dIndex]);
            }
        }

        // 3. Create options array (1 correct + 3 distractors)
        this.options = Array.from(distractors).map(c => ({
            text: c.english_translation,
            isCorrect: false
        }));

        // Insert correct answer at random position
        this.correctIndex = Math.floor(Math.random() * 4);
        this.options.splice(this.correctIndex, 0, {
            text: this.currentCard.english_translation,
            isCorrect: true
        });

        // 4. Render
        this.onRender({
            word: this.currentCard.word,
            sentence: this.currentCard.example_sentence_native || '',
            sentenceEn: this.currentCard.example_sentence_english || '',
            options: this.options
        });
    }

    checkAnswer(index) {
        if (this.isAnswered) return null; // Prevent double guessing

        this.isAnswered = true;
        const isCorrect = (index === this.correctIndex);

        return {
            isCorrect: isCorrect,
            correctIndex: this.correctIndex,
            selectedIndex: index
        };
    }
}
