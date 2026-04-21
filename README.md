# Vertigo VR – Epley Maneuver

A WebVR physical therapy experience for BPPV (vertigo). Patients use gaze control to navigate — no tapping required, just look at a target for 3 seconds to select it.

## Running locally

```bash
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080) in your browser, or on your phone via your local IP (e.g. `http://192.168.1.42:8080`). Your phone must be on the same Wi-Fi network.

> To find your local IP: `ipconfig getifaddr en0`

## How it works

- Look at a circle for 3 seconds to select it — the dot shrinks and counts down 3 → 2 → 1
- Scene 1: choose which ear is affected (left or right)
- Scene 2: ear-specific Epley maneuver experience (in progress)

## Files

| File | Purpose |
|---|---|
| `index.html` | Scene layout and all A-Frame entities |
| `script.js` | Gaze interaction component and scene switching logic |
