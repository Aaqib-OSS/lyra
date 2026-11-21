# Recording performance (desktop lyric-video export)

Scope: `src/renderer/src/lib/studio/` (`recorder.ts` = "Instant", `twoPhase.ts` = "Smooth", `fileExport.ts` = own audio file), `StudioDialog.tsx`, `src/main/studio.ts`. Android (`RecordActivity`/`RecordService`, `RecordDialog.tsx`) was read only; see the last section.

Labels used below: **Measured** = I ran it here (Node/vitest/harness). **Estimated** = arithmetic from the code, not timed. **Not measured** = needs the real app on real hardware; I did not have a GPU/Electron run in this session.

## What was already good (and kept)

- WebCodecs `VideoEncoder` + `AudioEncoder` into `mp4-muxer`, `pickEncoder` asks for `prefer-hardware` first, `latencyMode: 'realtime'` for the live path.
- `VideoFrame(canvas)` straight from a canvas: no `getImageData` / `toDataURL` anywhere in the frame loop. The only readback is one JPEG cover (`toBlob`) per export.
- Output is streamed to disk through the main process, never held whole in memory.
- Pacing by a Worker clock (survives a covered window), `setBackgroundThrottling(false)` and a power-save blocker while exporting, and a 24-frame warm-up that drops 60 to 30 fps if drawing takes more than 11 ms.
- YouTube background frames in Smooth mode go to a temp file, not through the renderer.

## Where the time and memory actually went

| Area | Finding | Cost |
|---|---|---|
| Smooth: recorded sound | Per chunk two `Float32Array`s (8 B/frame), then copied into two more big arrays: peak 16 B/frame | Estimated 184 MB peak for a 4-min song. Measured by `scripts/bench-recording.ts`: 138 MB peak (that script under-counts the chunk phase; trust the 184 MB arithmetic) |
| Live: encoder queue | Allowed 40 queued raw frames. Each queued frame keeps a full picture alive (w x h x 4 B) | Estimated worst case 40 x 14.7 MB = 590 MB at 1440p, 330 MB at 1080x1920 |
| File writes | One un-awaited IPC `write` per muxer piece, each preceded by a copy; errors were thrown away | Measured: 243 IPC calls per 60 s of 1080p video (mp4-muxer already groups samples). A full disk produced a broken file silently |
| Back-pressure | `while (queue > 8) await setTimeout(4)`: polling timer, ignores cancel | Estimated: up to 4 ms (clamped higher) of idle per wait, no cancel until the loop exits |
| Resources | Encoders, canvas backing store, hidden `<video>` decoders never closed explicitly | Not measured. They were left to GC |
| Failure | Any non-cancel error left a half-written `.mp4` (moov atom is written last, so it cannot play) | Correctness |
| Background | `data-calm` (pauses the app's endless CSS animations) only followed play/pause, so every vibe animation ran during a live recording | Not measured. Compositor and style work competing with the 2D canvas draw |
| Quality choice | Everyone started at 1080p / 60 fps regardless of machine | Estimated: the main cause of the "slowPc" dropped-frame warnings |

## Changes

1. **`encodePolicy.ts` (new, pure, unit-tested)**
   - Presets **Fast** (720p, 30), **Balanced** (1080p, 60), **High** (1440p, 60). First choice comes from `recommendPreset`: Fast on weak machines (<=2 cores or <=2 GB), otherwise Balanced. High is opt-in. A saved choice and the old `slowPc` flag still win.
   - `clampToCapability`: caps resolution/fps by device tier. For the live ("Instant") method: low = 720p/30, mid (<=4 cores or <=4 GB) = 1080p/30, high = 1440p/60. For "Smooth" the cap is higher because it renders at its own pace (mid up to 1440p/60, low up to 1080p/30). The dialog shows when a cap applied.
   - `maxQueueFor(w, h)`: encoder queue limited by a 128 MiB budget (clamped 4..24 frames). Measured by unit test: 16 frames at 1080x1920, 9 at 2560x1440, 24 at 720x1280.
   - `planTick` + `AdaptiveLoad`: the live loop's drop policy is now explicit. If the encoder is full it waits (missed frames are later repeated, so the file has no timestamp hole, as before). New: when the smoothed draw time exceeds 85% of the frame budget it draws only every second frame and repeats the previous picture in between (cheap), and returns to every frame when draw time falls under 45% (hysteresis). Previously the only adaptation was the 24-frame warm-up probe, so a PC that got busy halfway through just fell behind.
   - `waitForRoom`: back-pressure on the encoder's `dequeue` event (50 ms safety timer), cancel-aware. `throttleProgress`: progress updates at most every 250/500 ms instead of every N frames.
   - `ChunkWriter`: coalesces the muxer's writes into contiguous pieces of about 1 MB, keeps order with one write in flight, remembers the first failure (the recording loop stops on it; `close()` throws it).
2. **`pcmStore.ts` (new)**: Smooth mode keeps the recorded sound as 16-bit stereo pages (4 B/frame) and never joins it. Loudness comes from the same block energies (`loudness.ts`, extracted from `fileExport.ts`; a test asserts the gain equals the old float-array estimate to 10 decimals). Playback of the recorded audio into the encoder reads page by page. 16-bit is what the capture helper already delivers; the share-the-whole-PC fallback is quantised from float, below the AAC noise floor.
3. **All three exporters**: `ChunkWriter` instead of per-piece IPC; `waitForRoom`; `VideoFrame.close()` in `finally`; encoders `close()`d, canvas shrunk to 0x0 and `<video>`/`<img>` elements released in `finally`; cancel is honoured while waiting for the song to seek; any failure discards the partial file (not only cancel); `writer.error` and `encError` are checked inside the loops. The own-audio exporter now also asks for the hardware encoder through `pickEncoder` (it used the default before) and flags the app as exporting.
4. **`main.tsx`**: `data-calm` is also set while an export runs (`useBgState.exporting`), so the app's endless CSS animations pause behind the dialog. Scene/vibe CSS and `Backdrop.tsx` are untouched (Backdrop already paused itself on `exporting`).
5. **`StudioDialog.tsx`**: Speed row (Fast/Balanced/High, remembered), device-based default, effective quality/fps shown and used, cap note.

## Measured

- `npm run typecheck`: clean. `npx vitest run`: 19 files / 217 tests pass (25 are new: 21 in encodePolicy.test.ts and 4 in pcmStore.test.ts, covering presets, caps, queue sizing, drop policy, adaptive load, `waitForRoom`, progress throttle, `ChunkWriter` incl. failure, `PcmStore`, loudness parity).
- `scripts/bench-recording.ts` (`npx vitest run -c scripts/vitest.bench.config.ts`), real `mp4-muxer` fed synthetic chunks (about 12.6 / 9 Mbit/s plus 8x key frames, so byte totals are inflated, call counts are not):
  - IPC write calls for 60 s of 1080x1920: 243 before, 63 after (about 4x fewer), same bytes. Honest read: mp4-muxer already batches, so the old rate was ~4 calls/s, not ~100; the gain is smaller than I first guessed and mostly saves the per-piece `slice()` copies and gives error reporting.
  - Sound for 4 minutes: `PcmStore` 44 MB (matches 4 B/frame arithmetic). Old path measured 138 MB peak by the script, 184 MB by arithmetic.
- Harness smoke test (Chromium, mocked `window.lyra`): the Export dialog opens, shows the Speed row with the device default, picking Fast switches the line to `720x1280, 30 fps, about 21 MB` and persists `lyra.studio.preset`. No new console errors (one 403 on a static resource was there before and comes from the harness's file-access setup).

## Estimated, not measured

- Peak raw-frame memory in the live path: 590 MB worst case to roughly 130 MB (budget), and 4x less for the Smooth sound buffer. Real VideoFrame memory depends on whether Chromium shares the canvas texture; the cap is what bounds the worst case.
- Fewer dropped frames on mid PCs from the Balanced default plus the 30 fps cap for live drawing, and from pausing the CSS animations. Not timed.
- Adaptive every-second-frame drawing keeps audio/video in sync (timestamps are by frame index) but the repeated frames still cost an encode; on a PC where drawing is fine and encoding is the limit it will not help, but the queue cap then handles it.

## Not done, and why

- **Rendering in a worker / `OffscreenCanvas`**: `scene.draw` takes `HTMLImageElement`, `HTMLVideoElement` and the YouTube `StageSource` bitmaps, and Smooth mode seeks a `<video>`. Moving that to a worker means re-plumbing every source into `ImageBitmap`/`VideoFrame` and is too large to do safely without a GPU run to verify. The Smooth method already renders off the realtime clock; this is the next step if "Instant" is still choppy.
- **Skipping frames instead of repeating** (empty timestamp gaps, zero encode cost): mp4-muxer would stretch the previous frame's duration, which should play the same, but the code comment says holes were a problem before; I kept the repeat behaviour.
- **Encoder fallback mid-run** (hardware error, retry in software): needs a truncate-and-rewrite IPC for the output file. Today the run fails, discards the partial file and shows the error; `pickEncoder` still falls back to software before starting.
- **Main-process `toJPEG` for YouTube frames** is synchronous on the main thread at up to 30/s (1440p). Not changed; a candidate for a lower stage fps on the Fast preset.
- Real hardware numbers (frames/s encoded, CPU%, GPU%, RSS) per preset: needs a run on a Windows machine with Spotify; none of the figures above should be read as such.

## Android (read only, no edits)

`RecordDialog.tsx` only starts the native recorder and has no quality controls; the Android capture lives in `RecordActivity`/`RecordService`. Findings from reading the web side only: the dialog could expose the same Fast/Balanced/High preset to the native side (resolution/bitrate/fps parameters), and the "Copy compatibility report" step is the place to log the device's encoder capabilities. The native code was not read in this session beyond the dialog, so there are no verified native findings.
