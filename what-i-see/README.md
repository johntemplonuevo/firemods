# What I See

A 2 min 18 s watercolor animation of a journal entry (Luke 11:34, "What I see, I consume."),
drawn with JavaScript on a `<canvas>`, narrated with the open-source **Kokoro** voice (`af_heart`),
with an original score and sound effects composed in Python.

**Depth:** every scene is built like a multiplane camera: far layers drift slowly and are slightly
soft, near layers move faster, and out-of-focus things sit right in front of the "lens"
(grass, a coffee mug, leaves, glowing dust, the person watching the phone). Particles live at
different distances, and the near ones are bigger and blurrier.

## Watch it

- **Finished video:** `out/what-i-see.mp4` (1920×1080, 30 fps, with sound)
- **Live in a browser:** open `index.html` and press Play. The animation is painted live and
  synced to `audio/soundtrack.mp3`. Click the picture to pause. Add `?t=55` to the URL to start at 55 s.

## Story beats

| Time | Scene | What happens |
|---|---|---|
| 0:00 | Title | Blue and gold paint blooms on paper: "What I See" |
| 0:09 | The eye | An eye opens; its pupil is a lamp flame. Light floods out, then the eye dims (Luke 11:34) |
| 0:23 | "What I see, I consume." | A grey brush stroke |
| 0:30 | The feed | A phone of endless AI posts, pings and swipes speeding up, glyphs swirling, darkness closing in |
| 0:57 | Click | The phone switches off. Silence. "In contrast…" |
| 1:02 | Japan Alps | Sunrise over snowy peaks, mist, birds; the phone dissolves away. Koto and flute |
| 1:26 | "What I see, I consume." | The same line again, now in warm gold |
| 1:32 | Light | A figure on a hill opens their arms to light from above. Strings and choir |
| 1:50 | The journal | Empty September pages flip by; the pen writes again: "Oct 12 – What I see, I consume." |
| 2:04 | Amen | Dusk over the mountains; a clay lamp is lit; stars and fireflies come out |

## Files

```
story.js           THE SOURCE: scenes, narration/caption text and sound cues, in base timing
narration/         make_voice.py (Kokoro) -> lines/*.wav + lines.json (length of each line)
build_timeline.py  stretches each scene to fit its narration -> timeline.js (generated)
timeline.js        the final timing used by both the animation and the music
js/watercolor.js   the painting toolkit (paper texture, layered paint blobs, washes, mountains)
js/scenes.js       the ten painted scenes
js/main.js         engine: scene switching, "paint bloom" transitions, captions, player
audio/compose.py   composes the music + sound effects from timeline.js (numpy only)
render/render.mjs  renders stills or the full video with headless Chromium (Playwright)
fonts/             Cormorant Garamond + Caveat (SIL Open Font License)
```

Both the animation and the music read `timeline.js`, so if you move a cue (say a page turn),
the picture and the sound move together. Scenes are written in the story's base timing; when a
scene is stretched to fit a longer spoken line, its animation, music and sound effects all
stretch with it.

## Rebuild

Needs Node 18+, Python 3 with numpy, Playwright's Chromium, and ffmpeg.
For the voice: `pip install kokoro-onnx soundfile` and the two model files
(`kokoro-v1.0.onnx`, `voices-v1.0.bin`) from the
[kokoro-onnx releases](https://github.com/thewh1teagle/kokoro-onnx/releases) (model-files-v1.0).

```bash
python3 narration/make_voice.py                 # -> narration/lines/*.wav (only when words change)
python3 build_timeline.py                       # -> timeline.js
python3 audio/compose.py                        # -> audio/soundtrack.wav + .mp3 (music + voice)
node render/render.mjs stills 12 44 70          # -> out/stills/*.jpg (quick checks)
node render/render.mjs video 30                 # -> out/video-only.mp4
ffmpeg -y -i out/video-only.mp4 -i audio/soundtrack.wav \
  -c:v copy -c:a aac -b:a 192k -shortest out/what-i-see.mp4
```

## Changing things

- **Words (spoken and on screen):** edit `captions` in `story.js`. `text` is shown, `speak` (optional)
  is what the voice says. Then run make_voice → build_timeline → compose.
- **Voice:** `voice` in `story.js` (`af_heart`, speed 0.88). Other Kokoro voices: `af_bella`,
  `am_michael`, `bf_emma`, `bm_george`…
- **Sound effects timing:** edit `sfx` in `story.js`, then build_timeline + compose.
- **Melodies and chords:** the score is written as plain lists of `(time, MIDI note, length)` in
  `audio/compose.py`, section by section (A = title, C = feed, E = Alps, G = light, I = amen…).
- **Colours:** each scene's palette is at the top of its `init()` in `js/scenes.js`.
