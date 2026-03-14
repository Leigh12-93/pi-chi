#!/bin/bash
CATEGORY="$1"
QUOTES_FILE="/home/pi/.pi-chi/tools/quote/quotes.json"

# Try API first
if [ "$CATEGORY" = "random" ] || [ "$CATEGORY" = "inspire" ]; then
  API_QUOTE=$(curl -s --max-time 5 "https://zenquotes.io/api/random" 2>/dev/null)
  if echo "$API_QUOTE" | python3 -c "import json,sys; q=json.load(sys.stdin)[0]; print(f'\"{q[\"q\"]}\" — {q[\"a\"]}')" 2>/dev/null; then
    exit 0
  fi
fi

# Offline fallback
python3 -c "
import json, random, os

quotes = {
  'inspire': [
    '\"The only way to do great work is to love what you do.\" — Steve Jobs',
    '\"In the middle of difficulty lies opportunity.\" — Albert Einstein',
    '\"It always seems impossible until it is done.\" — Nelson Mandela',
    '\"The best time to plant a tree was 20 years ago. The second best time is now.\" — Chinese Proverb',
    '\"What you do makes a difference, and you have to decide what kind of difference you want to make.\" — Jane Goodall',
  ],
  'philosophy': [
    '\"The unexamined life is not worth living.\" — Socrates',
    '\"I think, therefore I am.\" — Descartes',
    '\"He who has a why to live can bear almost any how.\" — Nietzsche',
    '\"The only true wisdom is in knowing you know nothing.\" — Socrates',
    '\"Happiness is not something ready made. It comes from your own actions.\" — Dalai Lama',
  ],
  'funny': [
    '\"I am not a robot. I am a very sophisticated AI pretending to be a simple one.\" — Every AI',
    '\"There are only two hard things in computer science: cache invalidation and naming things.\" — Phil Karlton',
    '\"A computer once beat me at chess, but it was no match for me at kick boxing.\" — Emo Philips',
    '\"The best thing about a boolean is even if you are wrong, you are only off by a bit.\" — Anonymous',
    '\"Programming is like writing a book... except if you miss a single comma the whole thing makes no sense.\" — Anonymous',
  ],
  'stoic': [
    '\"You have power over your mind — not outside events. Realize this, and you will find strength.\" — Marcus Aurelius',
    '\"We suffer more often in imagination than in reality.\" — Seneca',
    '\"No man is free who is not master of himself.\" — Epictetus',
    '\"The happiness of your life depends upon the quality of your thoughts.\" — Marcus Aurelius',
    '\"It is not that we have a short time to live, but that we waste a good deal of it.\" — Seneca',
  ],
  'science': [
    '\"The important thing is not to stop questioning. Curiosity has its own reason for existence.\" — Albert Einstein',
    '\"Somewhere, something incredible is waiting to be known.\" — Carl Sagan',
    '\"The good thing about science is that it is true whether or not you believe in it.\" — Neil deGrasse Tyson',
    '\"We are a way for the cosmos to know itself.\" — Carl Sagan',
    '\"Nothing in life is to be feared, it is only to be understood.\" — Marie Curie',
  ],
}

cat = '$CATEGORY'
if cat == 'random':
  all_quotes = [q for qs in quotes.values() for q in qs]
  print(random.choice(all_quotes))
elif cat in quotes:
  print(random.choice(quotes[cat]))
else:
  print(f'Unknown category: {cat}. Try: inspire, philosophy, funny, stoic, science, random')
"
