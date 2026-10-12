# What I See

A ~2 minute watercolor animation of a journal entry (Luke 11:34, "What I see, I consume."),
drawn with JavaScript on a `<canvas>`, with an original score and sound effects composed in Python.

## Watch it

- **Finished video:** `out/what-i-see.mp4` (1920×1080, 30 fps, with sound)
- **Live in a browser:** open `index.html` and press Play. The animation is painted live and
  synced to `audio/soundtrack.mp3`. Click the picture to pause. Add `?t=55` to the URL to start at 55 s.

## Story beats

| Time | Scene | What happens |
|---|---|---|
| 0–9 s | Title | Blue and gold paint blooms on paper: "What I See" |
| 9–22 s | The eye | An eye opens; its pupil is a lamp flame. Light floods out, then the eye dims (Luke 11:34) |
| 22–29 s | "What I see, I consume." | A grey brush stroke |
| 29–50 s | The feed | A phone of endless AI posts, pings and swipes speeding up, glyphs swirling, darkness closing in |
| 50–55 s | Click | The phone switches off. Silence. "In contrast…" |
| 55–79 s | Japan Alps | Sunrise over snowy peaks, mist, birds; the phone dissolves away. Koto and flute |
| 79–85 s | "What I see, I consume." | The same line again, now in warm gold |
| 85–101 s | Light | A figure on a hill opens their arms to light from above. Strings and choir |
| 101–112 s | The journal | Empty September pages flip by; the pen writes again: "Oct 12 – What I see, I consume." |
| 112–125 s | Amen | Dusk over the mountains; a clay lamp is lit; stars come out |

## Files

```
timeline.js        one shared timeline: scenes, captions and sound-effect cues
js/watercolor.js   the painting toolkit (paper texture, layered paint blobs, washes, mountains)
js/scenes.js       the ten painted scenes
js/main.js         engine: scene switching, "paint bloom" transitions, captions, player
audio/compose.py   composes the music + sound effects from timeline.js (numpy only)
render/render.mjs  renders stills or the full video with headless Chromium (Playwright)
fonts/             Cormorant Garamond + Caveat (SIL Open Font License)
```

Both the animation and the music read `timeline.js`, so if you move a cue (say a page turn),
the picture and the sound move together.

## Rebuild

Needs Node 18+, Python 3 with numpy, Playwright's Chromium, and ffmpeg.

```bash
python3 audio/compose.py                       # -> audio/soundtrack.wav + .mp3
node render/render.mjs stills 12 44 70          # -> out/stills/*.jpg (quick checks)
node render/render.mjs video 30                 # -> out/video-only.mp4
ffmpeg -y -i out/video-only.mp4 -i audio/soundtrack.wav \
  -c:v copy -c:a aac -b:a 192k -shortest out/what-i-see.mp4
```

## Changing things

- **Words on screen:** edit `captions` in `timeline.js` (start/end time in seconds and the text).
- **Sound effects timing:** edit `sfx` in `timeline.js`, then re-run `compose.py`.
- **Melodies and chords:** the score is written as plain lists of `(time, MIDI note, length)` in
  `audio/compose.py`, section by section (A = title, C = feed, E = Alps, G = light, I = amen…).
- **Colours:** each scene's palette is at the top of its `init()` in `js/scenes.js`.
