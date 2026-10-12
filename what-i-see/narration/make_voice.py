#!/usr/bin/env python3
"""Speak every narrated caption in ../story.js with Kokoro TTS (kokoro-onnx).

Setup (once):
    pip install kokoro-onnx soundfile
    # model files from https://github.com/thewh1teagle/kokoro-onnx/releases (model-files-v1.0)
    #   kokoro-v1.0.onnx  and  voices-v1.0.bin   -> put them in this folder, or set KOKORO_DIR

    python3 narration/make_voice.py   -> narration/lines/NN.wav + narration/lines.json
"""
import json
import os
import re

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MODEL_DIR = os.environ.get("KOKORO_DIR", HERE)

with open(os.path.join(ROOT, "story.js"), encoding="utf-8") as f:
    STORY = json.loads(re.search(r"=\s*(\{.*\})\s*;", f.read(), re.S).group(1))

voice = STORY["voice"]
kokoro = Kokoro(os.path.join(MODEL_DIR, "kokoro-v1.0.onnx"), os.path.join(MODEL_DIR, "voices-v1.0.bin"))
os.makedirs(os.path.join(HERE, "lines"), exist_ok=True)


def trim(a, sr, thresh=0.01):
    """Cut leading/trailing silence, keeping a few ms of air."""
    idx = np.where(np.abs(a) > thresh)[0]
    if not len(idx):
        return a
    pad = int(0.03 * sr)
    return a[max(0, idx[0] - pad): idx[-1] + pad]


out = {}
for i, cap in enumerate(STORY["captions"]):
    if not cap.get("say"):
        continue
    text = cap.get("speak", cap["text"]).replace("“", "").replace("”", "")
    audio, sr = kokoro.create(text, voice=voice["name"], speed=voice["speed"], lang=voice["lang"])
    audio = trim(np.asarray(audio, dtype=np.float32), sr)
    name = f"{i:02d}.wav"
    sf.write(os.path.join(HERE, "lines", name), audio, sr, subtype="PCM_16")
    out[str(i)] = {"file": f"lines/{name}", "dur": round(len(audio) / sr, 3), "text": text}
    print(f"{name}  {len(audio) / sr:5.2f}s  {text}")

with open(os.path.join(HERE, "lines.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, indent=1)
