#!/usr/bin/env python3
"""Original score + sound effects for "What I See".

Everything is synthesized from scratch with numpy (no samples):
piano, koto (Karplus-Strong), shakuhachi-like flute, strings, choir pad,
bells, synth plucks, plus foley (wind, birds, stream, pings, swipes,
page turns, pen scratching, a match strike...).

The score below is written in the story's *base* timing (story.js). It is
mapped onto the stretched timeline (timeline.js, built around the narration)
by W(), the same way the animation is, so music and picture stay in sync.
The Kokoro narration (narration/lines/*.wav) is mixed on top, with the music
ducked under the voice.

    python3 audio/compose.py          -> audio/soundtrack.wav (+ .mp3 if ffmpeg exists)
"""
import json
import os
import re
import shutil
import subprocess
import wave

import numpy as np

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

with open(os.path.join(ROOT, "timeline.js"), encoding="utf-8") as f:
    TL = json.loads(re.search(r"=\s*(\{.*\})\s*;", f.read(), re.S).group(1))


def W(x):
    """story (base) time -> timeline time: each scene is stretched by its own factor."""
    for s in TL["scenes"]:
        bs, be = s["base"]
        if x < be or s is TL["scenes"][-1]:
            return s["start"] + (x - bs) * s["stretch"]


def S(t0, d):
    """a base-time duration starting at t0, measured in timeline time"""
    return W(t0 + d) - W(t0)


DUR = TL["duration"] + 1.0
N = int(DUR * SR)
rng = np.random.default_rng(2024)


# ---------------------------------------------------------------- utilities
def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tvec(dur):
    return np.arange(int(dur * SR)) / SR


def bus():
    return np.zeros((2, N))


def place(buf, t, sig, pan=0.0, gain=1.0, warp=True):
    """Mix a mono (or stereo) signal into buf at base time t with equal-power pan."""
    i = int(round((W(t) if warp else t) * SR))
    if i >= N:
        return
    if sig.ndim == 1:
        a = (pan + 1) * np.pi / 4
        sig = np.vstack([sig * np.cos(a), sig * np.sin(a)]) * np.sqrt(2)
    n = min(sig.shape[1], N - i)
    if i < 0:
        sig, n, i = sig[:, -i:], n + i, 0
    buf[:, i:i + n] += sig[:, :n] * gain


def fade_env(n, a, r):
    """Attack/release envelope (seconds), raised-cosine shaped."""
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    if na:
        e[:na] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, na))
    if nr:
        e[-nr:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, nr))
    return e


def smooth_random(n, rate, lo=0.0, hi=1.0):
    """Slowly wandering control signal (rate = new targets per second)."""
    k = max(2, int(n / SR * rate) + 2)
    pts = rng.uniform(lo, hi, k)
    x = np.linspace(0, k - 1, n)
    i = np.floor(x).astype(int)
    f = x - i
    f = f * f * (3 - 2 * f)
    i2 = np.minimum(i + 1, k - 1)
    return pts[i] * (1 - f) + pts[i2] * f


def fft_filter(x, gain_fn):
    """Static filter in the frequency domain; gain_fn(freqs) -> gains."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X * gain_fn(f), len(x))


def band(fc, bw_oct):
    return lambda f: np.exp(-0.5 * (np.log2(np.maximum(f, 1) / fc) / bw_oct) ** 2)


def lowpass(fc, order=2):
    return lambda f: 1 / np.sqrt(1 + (f / fc) ** (2 * order))


def highpass(fc, order=2):
    return lambda f: 1 / np.sqrt(1 + (fc / np.maximum(f, 1)) ** (2 * order))


def stft_filter(x, gain_at):
    """Time-varying filter: gain_at(time_s, freqs) -> gains, applied per frame."""
    win, hop = 2048, 512
    w = np.hanning(win)
    pad = np.concatenate([np.zeros(win), x, np.zeros(win)])
    out = np.zeros_like(pad)
    norm = np.zeros_like(pad)
    f = np.fft.rfftfreq(win, 1 / SR)
    for s in range(0, len(pad) - win, hop):
        X = np.fft.rfft(pad[s:s + win] * w)
        tc = (s + win / 2 - win) / SR
        out[s:s + win] += np.fft.irfft(X * gain_at(tc, f), win) * w
        norm[s:s + win] += w * w
    return (out / np.maximum(norm, 1e-3))[win:win + len(x)]


def reverb(buf, seconds=2.8, damp=5000, seed=7):
    """Stereo convolution reverb with a synthetic decaying-noise impulse."""
    r = np.random.default_rng(seed)
    m = int(seconds * SR)
    t = np.arange(m) / SR
    decay = np.exp(-t * 6.9 / seconds)
    out = np.zeros_like(buf)
    for ch in range(2):
        ir = r.standard_normal(m) * decay
        ir = fft_filter(ir, lowpass(damp, 1))
        ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))  # pre-delay feel
        ir /= np.sqrt(np.sum(ir ** 2))
        nfft = 1 << 19
        L = nfft - m + 1
        H = np.fft.rfft(ir, nfft)
        x = buf[ch]
        for s in range(0, len(x), L):
            seg = np.fft.irfft(np.fft.rfft(x[s:s + L], nfft) * H, nfft)
            e = min(len(x), s + nfft)
            out[ch, s:e] += seg[: e - s]
    return out


# ---------------------------------------------------------------- instruments
def piano(m, dur, vel=0.5):
    f = mtof(m)
    t = tvec(dur + 2.2)
    sig = np.zeros_like(t)
    bright = 0.6 + vel
    for n in range(1, 11):
        fn = n * f * np.sqrt(1 + 0.0004 * n * n)
        if fn > 16000:
            break
        amp = (1 / n ** (1.9 - 0.6 * bright)) * np.exp(-t * (0.5 + 0.45 * n) * (f / 262) ** 0.35)
        for det in (-0.6, 0.6):  # two slightly detuned strings
            sig += 0.5 * amp * np.sin(2 * np.pi * fn * (1 + det / 1731) * t + n)
    sig *= 1 - np.exp(-t / 0.003)
    rel = np.ones_like(t)
    k = int(dur * SR)
    rel[k:] = np.exp(-(t[k:] - dur) / 0.35)
    hammer = fft_filter(rng.standard_normal(len(t)), band(f * 4, 1.0)) * np.exp(-t / 0.012) * 0.04
    return (sig * rel + hammer) * vel * 0.32


def koto(m, dur=3.0, vel=0.6):
    """Karplus-Strong plucked string, retuned by resampling for exact pitch."""
    f = mtof(m)
    P = int(SR / f)
    step = f * P / SR  # read slower than written: lowers SR/P Hz down to exactly f
    n = int((dur + 0.5) * SR * step) + P + 2
    out = np.zeros(n)
    exc = rng.uniform(-1, 1, P)
    exc = np.convolve(exc, [0.5, 0.5], mode="same")
    out[:P] = exc
    decay = 0.9965 if f < 500 else 0.9935
    for s in range(P, n, P):
        prev = out[s - P:s]
        prev1 = np.concatenate(([out[s - P - 1]] if s - P - 1 >= 0 else [0.0], prev[:-1]))
        seg = decay * 0.5 * (prev + prev1)
        out[s:s + P] = seg[: n - s]
    y = np.interp(np.arange(int((dur + 0.5) * SR)) * step, np.arange(n), out)
    y -= np.concatenate(([0.0] * int(SR / f / 5), y))[: len(y)] * 0.6  # pluck position
    y *= fade_env(len(y), 0.001, 0.4)
    return y * vel * 0.5


def flute(m, dur, vel=0.4):
    """Breathy shakuhachi-like tone."""
    f = mtof(m)
    t = tvec(dur)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.2 * t) * np.clip((t - 0.5) / 0.6, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    tone = np.sin(ph) + 0.18 * np.sin(2 * ph) + 0.06 * np.sin(3 * ph)
    breath = fft_filter(rng.standard_normal(len(t)), band(f * 1.5, 0.7)) * 0.5
    e = fade_env(len(t), 0.25, 0.8) * (0.85 + 0.15 * smooth_random(len(t), 2))
    chiff = np.exp(-t / 0.06) * fft_filter(rng.standard_normal(len(t)), band(f * 3, 1.0)) * 1.2
    return (tone * 0.8 + breath + chiff) * e * vel * 0.25


def pad(notes, dur, vol=0.12, attack=1.6, release=2.0, bright=10, vib=0.0, formant=False):
    """Warm detuned additive pad; formant=True gives an 'aah' choir colour."""
    t = tvec(dur + release)
    sig = np.zeros_like(t)
    lfo = 1 + vib * np.sin(2 * np.pi * 4.8 * t + rng.uniform(0, 6))
    for m in notes:
        f0 = mtof(m)
        for cents in (-7, 0, 6):
            f = f0 * 2 ** (cents / 1200)
            ph = 2 * np.pi * np.cumsum(f * lfo) / SR + rng.uniform(0, 6)
            for n in range(1, bright + 1):
                fn = n * f
                if fn > 9000:
                    break
                a = 1 / n ** 1.5
                if formant:
                    a = 0.15 / n + sum(g * np.exp(-0.5 * (np.log2(fn / fc) / 0.25) ** 2)
                                      for fc, g in ((700, 1.0), (1150, 0.6), (2600, 0.25)))
                sig += a * np.sin(n * ph)
    env = np.ones_like(t)
    na = int(attack * SR)
    env[:na] = np.sin(np.linspace(0, np.pi / 2, na)) ** 2
    k = int(dur * SR)
    env[k:] = np.cos(np.linspace(0, np.pi / 2, len(t) - k)) ** 2
    sig *= env * (1 + 0.08 * np.sin(2 * np.pi * 0.17 * t))
    return sig * vol / (len(notes) * 3) ** 0.5 * 0.25


def bell(m, vel=0.5, length=6.0):
    f = mtof(m)
    t = tvec(length)
    partials = [(0.5, 0.5, 0.25), (1.0, 1.0, 0.45), (1.19, 0.5, 0.6), (1.56, 0.4, 0.7), (2.0, 0.6, 0.9),
                (2.51, 0.3, 1.2), (2.66, 0.25, 1.4), (3.0, 0.2, 1.7), (4.07, 0.12, 2.2)]
    sig = np.zeros_like(t)
    for r, a, d in partials:
        sig += a * np.sin(2 * np.pi * f * r * t + r) * np.exp(-t * d)
    sig *= 1 - np.exp(-t / 0.002)
    return sig * vel * 0.18


def pluck(m, vel=0.5):
    """Bright synth pluck for the scrolling feed."""
    f = mtof(m)
    t = tvec(0.45)
    sig = np.zeros_like(t)
    for n in range(1, 9):
        sig += (1 / n) * np.sin(2 * np.pi * n * f * t) * np.exp(-t * (7 + 5 * n))
    return sig * vel * 0.16


def bass(m, dur, vel=0.5):
    f = mtof(m)
    t = tvec(dur)
    sig = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) * np.exp(-t * 3)
    return sig * fade_env(len(t), 0.01, 0.3) * vel * 0.35


def kick(vel=0.5):
    t = tvec(0.4)
    f = 45 + 80 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * vel * 0.8


def hat(vel=0.3):
    t = tvec(0.06)
    return fft_filter(rng.standard_normal(len(t)), highpass(7000)) * np.exp(-t * 70) * vel * 0.25


# ---------------------------------------------------------------- sound effects
def sfx_ping():
    out = np.zeros(int(0.6 * SR))
    for i, (m, dt) in enumerate(((88, 0.0), (95, 0.085))):
        t = tvec(0.5)
        f = mtof(m)
        s = (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 3 * f * t)) * np.exp(-t * 11) * (1 - np.exp(-t / 0.002))
        k = int(dt * SR)
        out[k:k + len(s)] += s[: len(out) - k]
    return out * 0.16


def sfx_swipe():
    t = tvec(0.24)
    x = rng.standard_normal(len(t)) * np.sin(np.pi * np.clip(t / 0.24, 0, 1)) ** 2
    y = stft_filter(x, lambda tc, f: band(2600 - 8000 * max(tc, 0), 1.0)(f))
    return y * 0.22


def sfx_click():
    t = tvec(0.25)
    c = np.zeros_like(t)
    c[:60] = np.hanning(60) * np.sign(np.sin(np.arange(60) * 1.3))
    tick = np.sin(2 * np.pi * 2100 * t) * np.exp(-t * 120)
    thunk = np.sin(2 * np.pi * np.cumsum(260 * np.exp(-t * 14) + 50) / SR) * np.exp(-t * 18)
    return (c * 0.5 + tick * 0.4 + thunk * 0.6) * 0.5


def sfx_unlock():
    t = tvec(0.5)
    s = np.zeros_like(t)
    for m, dt in ((81, 0), (86, 0.07)):
        k = int(dt * SR)
        tt = t[: len(t) - k]
        s[k:] += np.sin(2 * np.pi * mtof(m) * tt) * np.exp(-tt * 14)
    return s * 0.1


def sfx_whoosh(dur=1.5, lo=250, hi=1300, vol=0.12):
    t = tvec(dur)
    x = rng.standard_normal(len(t)) * np.sin(np.pi * t / dur) ** 2
    y = stft_filter(x, lambda tc, f: band(lo + (hi - lo) * np.sin(np.pi * np.clip(tc / dur, 0, 1)), 0.9)(f))
    return y * vol


def sfx_flame():
    t = tvec(2.2)
    strike = fft_filter(rng.standard_normal(len(t)), highpass(2500)) * np.exp(-t / 0.03) * 0.5
    whoomp = fft_filter(rng.standard_normal(len(t)), lowpass(700)) * (np.clip(t / 0.12, 0, 1) * np.exp(-t * 2.2)) * 0.9
    crackle = np.zeros_like(t)
    for _ in range(26):
        k = rng.integers(int(0.2 * SR), len(t) - 200)
        crackle[k:k + 120] += rng.standard_normal(120) * np.exp(-np.arange(120) / 25) * rng.uniform(0.1, 0.4)
    crackle = fft_filter(crackle, highpass(1500))
    return (strike + whoomp + crackle) * 0.22


def sfx_dim():
    t = tvec(3.0)
    f = 220 * 2 ** (-t / 3)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * fade_env(len(t), 0.6, 1.8) * 0.05


def sfx_shimmer():
    out = np.zeros(int(4.5 * SR))
    for i, m in enumerate((86, 90, 93, 98, 100, 102, 105)):
        t = tvec(3.5)
        s = np.sin(2 * np.pi * mtof(m) * t) * np.exp(-t * 1.6) * (1 - np.exp(-t / 0.003))
        k = int(i * 0.075 * SR)
        out[k:k + len(s)] += s * (0.9 - i * 0.07)
    return out * 0.07


def sfx_page():
    t = tvec(0.7)
    x = rng.standard_normal(len(t))
    flutter = 0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 9 * t + rng.uniform(0, 3)))
    env = np.clip(t / 0.05, 0, 1) * np.exp(-t * 4.5) * flutter
    y = stft_filter(x * env, lambda tc, f: band(1800 + 2500 * np.exp(-tc * 6), 1.3)(f))
    return y * 0.28


def sfx_pen(dur):
    t = tvec(dur)
    x = fft_filter(rng.standard_normal(len(t)), lambda f: band(3800, 0.9)(f) + 0.3 * band(1200, 0.6)(f))
    strokes = np.zeros_like(t)
    s = 0
    while s < len(t):
        L = int(rng.uniform(0.06, 0.22) * SR)
        e = np.sin(np.linspace(0, np.pi, min(L, len(t) - s))) ** 0.7
        strokes[s:s + len(e)] = e * rng.uniform(0.5, 1.0)
        s += L + int(rng.uniform(0.02, 0.09) * SR)
    return x * strokes * 0.05


def wind(dur):
    n = int(dur * SR)
    x = np.cumsum(rng.standard_normal(n))
    x -= np.convolve(x, np.ones(2000) / 2000, mode="same")
    x /= np.max(np.abs(x)) + 1e-9
    gust = smooth_random(n, 0.4, 0.25, 1.0)
    y = stft_filter(x, lambda tc, f: band(380 + 500 * gust[int(np.clip(tc * SR, 0, n - 1))], 1.4)(f))
    return y * gust


def stream(dur):
    n = int(dur * SR)
    x = fft_filter(rng.standard_normal(n), band(2200, 0.9))
    x *= 0.6 + 0.4 * smooth_random(n, 18)
    for _ in range(int(dur * 9)):
        t = tvec(rng.uniform(0.012, 0.03))
        f = rng.uniform(500, 1100) * (1 + 1.5 * t / t[-1])
        b = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / t[-1])
        k = rng.integers(0, n - len(b))
        x[k:k + len(b)] += b * rng.uniform(0.2, 0.6)
    return x * 0.06


def bird_call():
    out = []
    kind = rng.integers(0, 3)
    for i in range(rng.integers(2, 6)):
        d = rng.uniform(0.05, 0.12)
        t = tvec(d)
        if kind == 0:
            f = 3200 + 1800 * np.sin(np.pi * t / d)
        elif kind == 1:
            f = 5200 - 2400 * t / d
        else:
            f = 2600 + 900 * np.sin(2 * np.pi * 28 * t)
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d) ** 2
        out += [s, np.zeros(int(rng.uniform(0.04, 0.12) * SR))]
    return np.concatenate(out) * 0.05


# ---------------------------------------------------------------- the score
pre = bus()    # music before the phone is switched off (cut hard at 50.3)
post = bus()   # music after
amb = bus()    # ambience
fx = bus()     # sound effects
DARK = next(s for s in TL["scenes"] if s["id"] == "dark")
CUT = DARK["base"][0]      # the phone click, in base time
CUT_NEW = DARK["start"]    # ... and in timeline time


def chords(buf, prog, vol, **kw):
    for t0, t1, notes in prog:
        place(buf, t0, pad(notes, W(t1) - W(t0), vol=vol, **kw))


def melody(buf, notes, inst=piano, pan=0.15, vel=0.5):
    for t0, m, d, *v in notes:
        place(buf, t0, inst(m, d, v[0] if v else vel), pan=pan + (m - 72) * 0.01)


def arp(buf, t0, t1, notes, step, vel=0.25, pan=-0.2):
    i, t = 0, t0
    while t < t1 - 0.05:
        m = notes[i % len(notes)]
        place(buf, t, piano(m, step * 1.8, vel * (0.85 + 0.3 * rng.random())), pan=pan + (m - 60) * 0.01)
        i += 1
        t += step


# A. title + "the eye is the lamp" (D major, gentle)
progA = [(0.0, 5.6, [38, 50, 57, 61, 64, 66]), (5.5, 11.1, [35, 47, 54, 57, 62, 66]),
         (11.0, 16.6, [43, 50, 55, 59, 66]), (16.5, 18.7, [45, 52, 57, 62, 64]),
         (18.6, 22.3, [43, 50, 55, 58, 64])]
chords(pre, progA, 0.9, attack=2.0, bright=8)
arp(pre, 1.0, 5.5, [62, 66, 69, 73, 76, 73, 69, 66], 0.4545, 0.18)
arp(pre, 5.5, 11.0, [59, 62, 66, 69, 71, 69, 66, 62], 0.4545, 0.18)
arp(pre, 11.0, 16.5, [55, 59, 62, 66, 67, 66, 62, 59], 0.4545, 0.2)
arp(pre, 16.5, 18.6, [57, 62, 64, 69], 0.4545, 0.18)
arp(pre, 18.6, 21.8, [55, 58, 62, 64], 0.6, 0.14)
melody(pre, [(2.2, 78, 0.9), (3.1, 76, 0.9), (4.0, 74, 1.6), (5.6, 74, 0.9), (6.5, 76, 0.9), (7.4, 73, 0.9),
             (8.3, 71, 2.4), (11.0, 71, 0.9), (11.9, 74, 0.9), (12.8, 78, 1.8), (14.6, 76, 0.9), (15.5, 74, 0.9),
             (16.4, 76, 2.2), (18.6, 74, 0.9), (19.5, 70, 1.2, 0.4), (20.7, 69, 1.4, 0.35)], vel=0.45)

# B. "What I see, I consume." (suspended Bb, then into D minor)
chords(pre, [(21.9, 26.5, [34, 46, 53, 60, 62, 65]), (26.0, 29.6, [38, 50, 57, 62, 65])], 1.0, attack=1.2, bright=7)
place(pre, 22.2, piano(50, 3.0, 0.35), pan=-0.2)
place(pre, 22.2, piano(38, 3.0, 0.3), pan=-0.2)
melody(pre, [(24.6, 69, 1.0, 0.3), (25.5, 70, 1.0, 0.3), (26.4, 69, 2.2, 0.32)])

# C. the feed (D minor, 120 bpm, getting busier and darker)
bar0, BAR = 29.6, 2.0
prog = [[62, 65, 69, 74], [58, 62, 65, 70], [65, 69, 72, 77], [60, 64, 67, 72]]
roots = [38, 34, 41, 36]
pattern = [0, 1, 2, 1, 3, 2, 1, 2, 0, 1, 2, 1, 3, 2, 1, 2]
b = 0
while bar0 + b * BAR < CUT:
    tb = bar0 + b * BAR
    ch, root = prog[b % 4], roots[b % 4]
    for k, idx in enumerate(pattern):
        t = tb + k * 0.125
        if t >= CUT:
            break
        busy = t >= 38.0
        if not busy and k % 2:
            continue
        v = 0.5 + 0.3 * min(1, (t - 29.6) / 18)
        place(pre, t, pluck(ch[idx], v), pan=0.35 * np.sin(k * 0.9))
        if t >= 45.6:
            place(pre, t, pluck(ch[idx] + 12, v * 0.5), pan=-0.35 * np.sin(k * 0.9))
        if t >= 38.0 and (k % 2 == 0 or t >= 45.0):
            place(pre, t, hat(0.25 + 0.25 * (t > 45)), pan=0.3)
    if tb >= 33.6:
        place(pre, tb, bass(root, 0.9, 0.5))
        place(pre, tb + 1.0, bass(root, 0.9, 0.42))
    for beat in range(4):
        tk = tb + beat * 0.5
        if tk < CUT and ((tk >= 42.0 and beat % 2 == 0) or tk >= 46.0):
            place(pre, tk, kick(0.5 + 0.2 * (tk > 46)))
    b += 1
dr_t = tvec(W(CUT) - W(29.0))
drone = (np.sin(2 * np.pi * mtof(26) * dr_t) + 0.6 * np.sin(2 * np.pi * mtof(33) * 1.003 * dr_t)
         + 0.3 * np.sin(2 * np.pi * mtof(38) * 0.997 * dr_t))
drone *= (0.08 + 0.12 * np.clip((dr_t - 6) / 15, 0, 1) ** 2) * fade_env(len(dr_t), 2.0, 0.0)
place(pre, 29.0, drone)
chords(pre, [(45.6, CUT + 0.3, [62, 63, 65, 68, 70])], 0.9, attack=3.5, release=0.2, bright=12, vib=0.004)
rise_t = tvec(W(CUT) - W(44.0))
riser = stft_filter(rng.standard_normal(len(rise_t)), lambda tc, f: band(300 + 5000 * (max(tc, 0) / rise_t[-1]) ** 2, 0.8)(f))
place(pre, 44.0, riser * (rise_t / rise_t[-1]) ** 2 * 0.22)

# D. silence after the click, a single note, then dawn
place(post, 51.6, piano(50, 3.5, 0.28), pan=-0.1)
place(post, 51.6, piano(57, 3.5, 0.18), pan=0.1)
chords(post, [(53.4, 56.2, [50, 57, 62, 66, 69])], 0.7, attack=2.4)

# E. the Japan Alps (D major pentatonic, koto + flute)
beat, m0 = 0.7, 56.4
koto_line = [(0, 69, 1), (1, 71, .5), (1.5, 74, 1.5), (3, 76, 1), (4, 74, 1), (5, 71, 1), (6, 69, 2),
             (8, 66, 1), (9, 69, 1), (10, 71, 1), (11, 69, 1), (12, 66, 1), (13, 64, 1), (14, 62, 2),
             (16, 74, 1), (17, 76, .5), (17.5, 78, 1.5), (19, 81, 1), (20, 78, 1), (21, 76, 1), (22, 74, 2),
             (24, 71, 1), (25, 74, 1), (26, 76, 1), (27, 71, 1), (28, 69, 2), (30, 74, 3)]
for bt, m, d in koto_line:
    place(post, m0 + bt * beat, koto(m, max(2.0, d * beat * 2), 0.55), pan=0.25)
    if bt in (0, 8, 16, 24):  # tremolo-like grace note an octave down
        place(post, m0 + bt * beat - 0.06, koto(m - 12, 1.5, 0.25), pan=0.25)
melody(post, [(m0 + 8 * beat, 69, 2.6), (m0 + 12.5 * beat, 66, 2.2), (m0 + 24 * beat, 74, 2.6), (m0 + 28 * beat, 69, 3.0)],
       inst=flute, pan=-0.3, vel=0.45)
progE = [(55.0, m0 + 8 * beat, [38, 50, 57, 64, 66]), (m0 + 8 * beat, m0 + 16 * beat, [43, 50, 55, 62, 67]),
         (m0 + 16 * beat, m0 + 24 * beat, [35, 47, 54, 62, 66]), (m0 + 24 * beat, 79.4, [45, 52, 57, 62, 64])]
chords(post, progE, 0.75, attack=2.5, bright=7)
for t0, _, notes in progE:
    place(post, t0, piano(notes[0] + 12, 3.0, 0.3), pan=-0.25)

# F. "What I see, I consume." again, now warm
chords(post, [(79.0, 85.3, [38, 50, 57, 62, 66, 69, 76])], 1.0, attack=1.0, bright=8)
melody(post, [(80.6, 78, 0.9), (81.5, 76, 0.9), (82.4, 74, 1.6), (84.0, 76, 0.8, 0.35)], vel=0.42)
arp(post, 79.6, 84.8, [62, 66, 69, 74, 76, 74, 69, 66], 0.4, 0.14)

# G. Jesus' light (strings + choir swell)
progG = [(85.0, 4.1, [43, 55, 59, 62, 67]), (89.0, 4.1, [42, 54, 57, 62, 66]), (93.0, 4.1, [40, 52, 55, 59, 62, 66]),
         (97.0, 2.1, [45, 52, 57, 62, 64]), (99.0, 2.4, [45, 52, 57, 61, 64])]
for i, (t0, d, notes) in enumerate(progG):
    d = S(t0, d)
    place(post, t0, pad(notes, d, vol=0.8 + 0.12 * i, attack=1.2, release=1.6, bright=12, vib=0.003))
    if t0 >= 89:
        place(post, t0, pad([n + 12 for n in notes[1:4]], d, vol=0.5 + 0.1 * i, attack=1.4, release=1.6, formant=True, vib=0.004))
    place(post, t0, piano(notes[0], d, 0.32), pan=-0.3)
melody(post, [(85.5, 71, 1), (86.5, 74, 1), (87.5, 79, 2), (89.5, 78, 1), (90.5, 76, 1), (91.5, 74, 2),
              (93.5, 76, 1), (94.5, 79, 1), (95.5, 83, 1.5), (97.0, 81, 2), (99.0, 73, 1), (100.0, 76, 1)], vel=0.5)
arp(post, 89.0, 101.0, [62, 66, 69, 74], 0.5, 0.12, pan=0.3)

# H. the journal (quiet piano)
progH = [(101.0, 104.8, [47, 54, 57, 62, 66]), (104.7, 108.5, [43, 50, 55, 59, 66]), (108.4, 112.2, [42, 50, 57, 62, 66])]
chords(post, progH, 0.55, attack=1.5)
arp(post, 101.2, 104.7, [47, 54, 59, 62], 0.46, 0.2)
arp(post, 104.7, 108.4, [43, 50, 55, 59], 0.46, 0.2)
arp(post, 108.4, 112.0, [42, 50, 54, 57], 0.46, 0.2)
melody(post, [(101.5, 74, 1.4), (103.0, 73, 0.8), (103.8, 71, 1.2), (105.2, 71, 0.9), (106.1, 74, 0.9),
              (107.0, 78, 1.6), (108.6, 76, 0.9), (109.5, 74, 0.9), (110.4, 73, 0.8), (111.2, 74, 1.0)], vel=0.42)

# I. Amen (G - A - D, full and warm)
progI = [(112.0, 4.1, [43, 55, 59, 62, 67]), (116.0, 4.9, [45, 57, 61, 64, 69]), (120.8, 4.5, [38, 50, 57, 62, 66, 69, 74])]
for i, (t0, d, notes) in enumerate(progI):
    d = S(t0, d)
    place(post, t0, pad(notes, d, vol=0.9 + 0.15 * i, attack=1.0 if i < 2 else 0.4, release=2.5, bright=12, vib=0.003))
    place(post, t0, pad([n + 12 for n in notes[1:4]], d, vol=0.6 + 0.1 * i, attack=1.2, release=2.5, formant=True, vib=0.004))
    place(post, t0, piano(notes[0], d, 0.35), pan=-0.3)
melody(post, [(112.5, 74, 1), (113.5, 71, 1), (114.5, 74, 1), (115.5, 79, 1), (116.5, 76, 1.2), (117.7, 73, 1),
              (118.7, 76, 1), (119.7, 81, 1.1), (121.0, 78, 3.5, 0.55)], vel=0.48)
arp(post, 116.0, 120.6, [57, 61, 64, 69], 0.46, 0.15, pan=0.3)
place(post, 121.0, piano(74, 3.5, 0.4), pan=0.1)
place(post, 121.0, piano(62, 3.5, 0.35), pan=-0.1)

# ---------------------------------------------------------------- ambience
w0, w1 = 54.4, 79.6
wd = wind(W(w1) - W(w0))
place(amb, w0, np.vstack([wd, np.roll(wd, 3000)]) * fade_env(len(wd), 2.0, 1.5) * 0.11)
st = stream(W(78.6) - W(57.0))
place(amb, 57.0, st * fade_env(len(st), 2.5, 2.0), pan=-0.4)
tb = 56.5
while tb < 77.5:
    place(amb, tb, bird_call(), pan=rng.uniform(-0.8, 0.8))
    tb += rng.uniform(0.8, 2.6)
for tb in (87.2, 92.5, 96.4):
    place(amb, tb, bird_call() * 0.6, pan=rng.uniform(-0.6, 0.6))
room = fft_filter(rng.standard_normal(int(4.7 * SR)), lowpass(400)) * 0.004
place(amb, CUT + 0.15, room * fade_env(len(room), 0.6, 1.0))
gt = tvec(W(125.0) - W(112.0))
crack = np.zeros_like(gt)  # the lamp quietly crackling at the end
for _ in range(60):
    k = rng.integers(int(1.2 * SR), len(gt) - 200)
    crack[k:k + 100] += rng.standard_normal(100) * np.exp(-np.arange(100) / 20) * rng.uniform(0.05, 0.2)
place(amb, 112.0, fft_filter(crack, highpass(1500)) * 0.12, pan=0.05)

# ---------------------------------------------------------------- sound effects from the timeline
for e in TL["sfx"]:
    t, kind = e["base"], e["type"]
    if kind == "bloom":
        place(fx, t - 0.1, sfx_whoosh(1.6, 220, 1100, 0.07), pan=rng.uniform(-0.3, 0.3))
    elif kind == "ping":
        place(fx, t, sfx_ping(), pan=0.25)
    elif kind == "swipe":
        place(fx, t, sfx_swipe(), pan=0.2)
    elif kind == "click":
        place(fx, t, sfx_click(), pan=0.15)
    elif kind == "unlock":
        place(fx, t, sfx_unlock(), pan=0.2)
    elif kind == "flame":
        place(fx, t - 0.15, sfx_flame())
    elif kind == "dim":
        place(fx, t, sfx_dim())
    elif kind == "bell":
        place(fx, t, bell(e.get("pitch", 74), 0.6))
        place(fx, t, bell(e.get("pitch", 74) + 12, 0.25), pan=0.2)
    elif kind == "shimmer":
        place(fx, t, sfx_shimmer(), pan=0.1)
    elif kind == "page":
        place(fx, t, sfx_page(), pan=0.3)
    elif kind == "pen":
        place(fx, t, sfx_pen(e.get("dur", 2.0)), pan=0.2)

# ---------------------------------------------------------------- narration
def read_wav(path):
    with wave.open(path) as w:
        sr, ch = w.getframerate(), w.getnchannels()
        a = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(float) / 32768
    a = a.reshape(-1, ch).mean(1)
    if sr != SR:  # resample (linear) then remove the imaging above the old Nyquist
        a = np.interp(np.arange(int(len(a) * SR / sr)) * sr / SR, np.arange(len(a)), a)
        a = fft_filter(a, lowpass(0.45 * sr, 4))
    return a


voice = bus()
for n in TL["narration"]:
    a = read_wav(os.path.join(ROOT, n["file"]))
    a = fft_filter(a, lambda f: highpass(90, 2)(f) * (1 + 0.25 * band(3500, 1.0)(f)))  # clean low end, a little presence
    a /= np.sqrt(np.mean(a[np.abs(a) > 0.02] ** 2)) + 1e-9                         # every line at the same loudness
    place(voice, n["t"], a, pan=0.0, warp=False)

# ---------------------------------------------------------------- mix
print("mixing and adding reverb...")
cut_i = int(CUT_NEW * SR)
pre_mix = pre + reverb(pre, 2.6) * 0.35
pre_mix[:, cut_i:] = 0                                   # the phone click kills everything
pre_mix[:, cut_i - 300:cut_i] *= np.linspace(1, 0, 300)
post_mix = post + reverb(post, 3.2, seed=8) * 0.45
fx_mix = fx + reverb(fx, 1.8, seed=9) * 0.25
bed = pre_mix + post_mix + amb + fx_mix
voice_mix = voice + reverb(voice, 1.1, damp=6000, seed=10) * 0.1


def rms_db(x, active_only=False):
    m = x.mean(0)
    if active_only:
        m = m[np.abs(m) > 0.05 * np.max(np.abs(m))]
    return 20 * np.log10(np.sqrt(np.mean(m ** 2)) + 1e-12)


bed *= 10 ** ((-21 - rms_db(bed)) / 20)
voice_mix *= 10 ** ((-16 - rms_db(voice_mix, True)) / 20)

# duck the music ~8 dB while the narrator speaks (smooth attack/release)
talk = np.zeros(N)
for n in TL["narration"]:
    a, b = int((n["t"] - 0.25) * SR), int((n["t"] + n["dur"] + 0.35) * SR)
    talk[max(0, a):min(N, b)] = 1
k = np.hanning(int(0.5 * SR))
talk = np.convolve(talk, k / k.sum(), mode="same")
mix = bed * (1 - 0.6 * talk) + voice_mix

# gentle master: soft-clip, fade at the very end
mix /= np.max(np.abs(mix)) + 1e-9
mix = np.tanh(mix * 1.4) / np.tanh(1.4)
mix *= 0.93
end = mix.shape[1]
f_out = int(2.5 * SR)
mix[:, end - f_out:] *= np.linspace(1, 0, f_out) ** 1.5

out_wav = os.path.join(HERE, "soundtrack.wav")
pcm = (np.clip(mix, -1, 1) * 32767).astype("<i2").T.copy()
with wave.open(out_wav, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", out_wav, f"({DUR:.1f}s)")

if shutil.which("ffmpeg"):
    out_mp3 = os.path.join(HERE, "soundtrack.mp3")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", out_wav, "-b:a", "192k", out_mp3], check=True)
    print("wrote", out_mp3)
