#!/usr/bin/env python3
"""
Bulk Image Generator for French Flashcards
Uses Pollinations.ai (free, no API key required)

Usage:
    python generate_images.py --limit 100
    python generate_images.py --limit 500 --delay 2
"""

import json
import os
import time
import urllib.parse
import urllib.request
import argparse
import unicodedata
import re
from pathlib import Path


def slugify(word: str) -> str:
    """Convert word to filename-safe slug (matches main.js logic)."""
    # Normalize and remove diacritics
    normalized = unicodedata.normalize("NFD", word)
    without_diacritics = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
    # Lowercase and clean
    slug = without_diacritics.lower().strip()
    # Remove any remaining non-alphanumeric chars (except hyphen)
    slug = re.sub(r"[^a-z0-9-]", "", slug)
    return slug


def generate_prompt(card: dict) -> str:
    """Build an effective image prompt from flashcard data."""
    word = card.get("word", "")
    translation = card.get("english_translation", "")
    sentence_en = card.get("example_sentence_english", "")
    pos = card.get("pos", "")
    
    # Always prioritize the example sentence for context
    if sentence_en:
        prompt = f"Illustration depicting this scene: {sentence_en}"
    elif translation:
        prompt = f"Simple illustration of: {translation}"
    else:
        prompt = f"Illustration for the French word: {word}"
    
    # Add style guidance
    prompt += " Style: colorful, modern, educational illustration, no text, simple background."
    
    return prompt


def extract_keywords(card: dict) -> str:
    """Extract meaningful keywords from card for image search."""
    sentence_en = card.get("example_sentence_english", "")
    translation = card.get("english_translation", "")
    
    # Common words to filter out
    stopwords = {"i", "you", "he", "she", "it", "we", "they", "the", "a", "an", 
                 "is", "are", "was", "were", "be", "been", "being", "have", "has", 
                 "had", "do", "does", "did", "will", "would", "could", "should",
                 "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
                 "into", "through", "during", "before", "after", "above", "below",
                 "and", "but", "or", "not", "no", "this", "that", "these", "those",
                 "my", "your", "his", "her", "its", "our", "their", "very", "just",
                 "don't", "doesn't", "didn't", "won't", "can't", "am", "what", "who"}
    
    # Extract words from example sentence
    if sentence_en:
        words = sentence_en.lower().replace(".", "").replace(",", "").replace("!", "").replace("?", "").split()
        keywords = [w for w in words if w not in stopwords and len(w) > 2]
        if keywords:
            return " ".join(keywords[:4])  # Top 4 meaningful words
    
    # Fallback to translation
    if translation:
        # Handle semicolon-separated translations
        first_meaning = translation.split(";")[0].strip()
        return first_meaning
    
    return card.get("word", "")


# Optional: Import google.generativeai is no longer needed for REST approach
import base64

def download_image_gemini(prompt: str, output_path: Path) -> bool:
    """Generate image using Google Gemini/Imagen REST API (requires key)."""
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return False
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key={api_key}"
    headers = {"Content-Type": "application/json"}
    
    # Request body
    data = {
        "instances": [
            {"prompt": prompt}
        ],
        "parameters": {
            "sampleCount": 1,
            "aspectRatio": "1:1",
            "personGeneration": "allow_adult",
            "safetyFilterLevel": "block_some"
        }
    }
    
    try:
        json_data = json.dumps(data).encode("utf-8")
        request = urllib.request.Request(url, data=json_data, headers=headers, method="POST")
        
        with urllib.request.urlopen(request, timeout=60) as response:
            if response.status == 200:
                response_body = json.loads(response.read().decode("utf-8"))
                
                # Extract image data (base64)
                if "predictions" in response_body and response_body["predictions"]:
                    b64_image = response_body["predictions"][0].get("bytesBase64Encoded")
                    if b64_image:
                        with open(output_path, "wb") as f:
                            f.write(base64.b64decode(b64_image))
                        return True
                        
    except Exception as e:
        print(f"  ✗ Gemini API Error: {e}")
        # Identify common errors
        if "404" in str(e):
            print("    (Model might not be enabled or name is wrong. Check API key permissions.)")
        return False
    
    return False


def download_image_flux(prompt: str, output_path: Path) -> bool:
    """Generate image using FLUX.1 Schnell via fal.ai API (100 free credits/month)."""
    api_key = os.getenv("FAL_KEY")
    if not api_key:
        return False
    
    url = "https://fal.run/fal-ai/flux/schnell"
    headers = {
        "Authorization": f"Key {api_key}",
        "Content-Type": "application/json"
    }
    
    data = {
        "prompt": prompt,
        "image_size": "square",  # 1:1 aspect ratio
        "num_images": 1,
        "enable_safety_checker": True
    }
    
    try:
        json_data = json.dumps(data).encode("utf-8")
        request = urllib.request.Request(url, data=json_data, headers=headers, method="POST")
        
        with urllib.request.urlopen(request, timeout=90) as response:
            if response.status == 200:
                response_body = json.loads(response.read().decode("utf-8"))
                
                # Extract image URL from response
                if "images" in response_body and response_body["images"]:
                    image_url = response_body["images"][0].get("url")
                    if image_url:
                        # Download the image from the URL
                        img_request = urllib.request.Request(image_url, headers={"User-Agent": "Mozilla/5.0"})
                        with urllib.request.urlopen(img_request, timeout=30) as img_response:
                            with open(output_path, "wb") as f:
                                f.write(img_response.read())
                            return True
                            
    except Exception as e:
        print(f"  ✗ FLUX Error: {e}")
        return False
    
    return False


def download_image_unsplash(keywords: str, output_path: Path, width: int = 512, height: int = 512) -> bool:
    """Download image from Unsplash Source (free, no API key)."""
    # Clean keywords for URL
    clean_keywords = urllib.parse.quote(keywords.replace(",", " ").strip())
    url = f"https://source.unsplash.com/{width}x{height}/?{clean_keywords}"
    
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status == 200:
                with open(output_path, "wb") as f:
                    f.write(response.read())
                return True
    except Exception as e:
        pass  # Silent fail, will try picsum
    
    return False


def download_image_picsum(output_path: Path, width: int = 512, height: int = 512) -> bool:
    """Download random image from Lorem Picsum (always works)."""
    # Use seed based on filename for consistency
    seed = hash(output_path.stem) % 1000
    url = f"https://picsum.photos/seed/{seed}/{width}/{height}"
    
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status == 200:
                with open(output_path, "wb") as f:
                    f.write(response.read())
                return True
    except Exception as e:
        print(f"  ✗ Error: {e}")
        return False
    
    return False


def download_image_pollinations(prompt: str, output_path: Path, width: int = 512, height: int = 512, retries: int = 2) -> bool:
    """Download image from Pollinations.ai with retry logic."""
    encoded_prompt = urllib.parse.quote(prompt)
    url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width={width}&height={height}&nologo=true"
    
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(request, timeout=90) as response:
                if response.status == 200:
                    with open(output_path, "wb") as f:
                        f.write(response.read())
                    return True
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2)
    
    return False


def download_image(card: dict, output_path: Path, width: int = 512, height: int = 512) -> bool:
    """Try Gemini, FLUX, Pollinations, Unsplash, then Picsum."""
    # Build prompt for AI generation
    prompt = generate_prompt(card)
    
    # Priority 1: Google Gemini (if API key present)
    if os.getenv("GOOGLE_API_KEY"):
        print("         Trying Google Gemini...")
        if download_image_gemini(prompt, output_path):
            return True
    
    # Priority 2: FLUX.1 via fal.ai (if API key present)
    if os.getenv("FAL_KEY"):
        print("         Trying FLUX.1 (fal.ai)...")
        if download_image_flux(prompt, output_path):
            return True
    
    # Priority 3: Pollinations AI (Free)
    print("         Trying Pollinations.ai...")
    if download_image_pollinations(prompt, output_path, width, height):
        return True
    
    # Priority 3: Unsplash (Keywords)
    keywords = extract_keywords(card)
    print(f"         Trying Unsplash with: {keywords}...")
    if download_image_unsplash(keywords, output_path, width, height):
        return True
    
    # Priority 4: Picsum (Fallback)
    print("         Using Picsum placeholder...")
    return download_image_picsum(output_path, width, height)


def main():
    parser = argparse.ArgumentParser(description="Generate images for French flashcards")
    parser.add_argument("--limit", type=int, default=100, help="Number of words to generate images for (default: 100)")
    parser.add_argument("--delay", type=float, default=1.5, help="Delay between requests in seconds (default: 1.5)")
    parser.add_argument("--skip-existing", action="store_true", default=True, help="Skip words that already have images")
    parser.add_argument("--force", action="store_true", help="Regenerate all images even if they exist")
    args = parser.parse_args()
    
    # Paths
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    flashcards_path = project_root / "public" / "flashcards.json"
    images_dir = project_root / "public" / "images"
    
    # Ensure images directory exists
    images_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"📚 Loading flashcards from: {flashcards_path}")
    
    with open(flashcards_path, "r", encoding="utf-8") as f:
        cards = json.load(f)
    
    print(f"📊 Total cards: {len(cards)}")
    print(f"🎯 Processing top {args.limit} by frequency\n")
    
    # Sort by frequency (lower = more common)
    cards_sorted = sorted(cards, key=lambda c: c.get("word_frequency", 99999))
    cards_to_process = cards_sorted[:args.limit]
    
    generated = 0
    skipped = 0
    failed = 0
    
    for i, card in enumerate(cards_to_process, 1):
        word = card.get("word", "unknown")
        slug = slugify(word)
        output_path = images_dir / f"{slug}.png"
        
        # Skip if exists (unless forced)
        if output_path.exists() and not args.force:
            print(f"[{i}/{args.limit}] ⏭️  {word} (already exists)")
            skipped += 1
            continue
        
        prompt = generate_prompt(card)
        print(f"[{i}/{args.limit}] 🎨 {word} → {slug}.png")
        print(f"         Prompt: {prompt[:80]}...")
        
        if download_image(card, output_path):
            print(f"         ✓ Saved!")
            generated += 1
        else:
            failed += 1
        
        # Rate limiting
        if i < len(cards_to_process):
            time.sleep(args.delay)
    
    print(f"\n{'='*50}")
    print(f"✅ Generated: {generated}")
    print(f"⏭️  Skipped: {skipped}")
    print(f"❌ Failed: {failed}")
    print(f"{'='*50}")
    print(f"\n📁 Images saved to: {images_dir}")


if __name__ == "__main__":
    main()
