import type {
  AppCommand,
  CommandResult,
  ConnectionStatus,
  LyricsCandidateInfo,
  LyricsResult,
  SongChoice,
  SongChoiceField,
  SourceHealth,
  ModeEvent,
  PlaybackSnapshot,
  PlayerCommand,
  QueueItem,
  RecentItem,
  SavedMoment,
  Settings,
  Track,
  UpdateState,
  BackgroundResolution,
  YoutubeVideo,
  ViewMode
} from './types'

/** Android only: state of the in-app updater (see android/.../update/UpdateManager.kt). */
export interface AndroidUpdateStatus {
  enabled: boolean
  /** why the updater is off (F-Droid, Play, debug build), shown instead of the controls */
  disabledReason: string | null
  phase: 'idle' | 'checking' | 'available' | 'downloading' | 'verifying' | 'ready' | 'installing' | 'error'
  installedVersion: string
  channel: 'stable' | 'beta'
  unmeteredOnly: boolean
  autoCheck: boolean
  autoInstall: boolean
  lastCheckedAt: number
  downloadedBytes: number
  error: string | null
  canInstallApps: boolean
  update: { version: string; tag: string; prerelease: boolean; notes: string; sizeBytes: number } | null
}

/** Invoke channels (renderer -> main). */
export const CH = {
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsReset: 'settings:reset',
  windowSetMode: 'window:set-mode',
  windowGetMode: 'window:get-mode',
  windowDragStart: 'window:drag-start',
  windowDragMove: 'window:drag-move',
  windowDragEnd: 'window:drag-end',
  windowResizeStart: 'window:resize-start',
  windowResizeMove: 'window:resize-move',
  windowResizeEnd: 'window:resize-end',
  windowSettle: 'window:settle',
  windowHide: 'window:hide',
  windowMinimize: 'window:minimize',
  windowQuit: 'window:quit',
  windowResizeBy: 'window:resize-by',
  windowNowLine: 'window:now-line',
  windowSetLock: 'window:set-lock',
  spotifyConnect: 'spotify:connect',
  spotifyDisconnect: 'spotify:disconnect',
  spotifyStatus: 'spotify:status-get',
  spotifySnapshot: 'spotify:snapshot-get',
  spotifyDemo: 'spotify:demo',
  spotifyLocal: 'spotify:local',
  playerCommand: 'player:command',
  playerLikeGet: 'player:like-get',
  playerLikeSet: 'player:like-set',
  playerQueue: 'player:queue',
  playerRecent: 'player:recent',
  playerOpen: 'player:open',
  lyricsGet: 'lyrics:get',
  lyricsRefresh: 'lyrics:refresh',
  lyricsCandidates: 'lyrics:candidates',
  lyricsChoose: 'lyrics:choose',
  lyricsClearPin: 'lyrics:clear-pin',
  lyricsImport: 'lyrics:import',
  lyricsImportFile: 'lyrics:import-file',
  lyricsHealth: 'lyrics:health',
  cacheClear: 'cache:clear',
  artGet: 'art:get',
  momentsList: 'moments:list',
  momentsAdd: 'moments:add',
  momentsRemove: 'moments:remove',
  appInfo: 'app:info',
  connectStatus: 'connect:status',
  connectEnable: 'connect:enable',
  connectCode: 'connect:code',
  connectParty: 'connect:party',
  connectRevoke: 'connect:revoke',
  connectRole: 'connect:role',
  connectView: 'connect:view',
  connectOverlayAdd: 'connect:overlay-add',
  connectOverlayLink: 'connect:overlay-link',
  connectRename: 'connect:rename',
  connectRevokeAll: 'connect:revoke-all',
  connectTest: 'connect:test',
  connectIdle: 'connect:idle',
  studioOpen: 'studio:open',
  studioWrite: 'studio:write',
  studioClose: 'studio:close',
  studioDiscard: 'studio:discard',
  studioEnd: 'studio:end',
  studioReveal: 'studio:reveal',
  studioSaveImage: 'studio:save-image',
  studioSaveText: 'studio:save-text',
  studioPlay: 'studio:play',
  studioFrameCaptureStart: 'studio:frames-start',
  studioFrameCaptureStop: 'studio:frames-stop',
  studioFrameRead: 'studio:frames-read',
  studioFrameCaptureClear: 'studio:frames-clear',
  studioAudioStart: 'studio:audio-start',
  studioAudioStop: 'studio:audio-stop',
  studioStageStart: 'studio:stage-start',
  studioUiStart: 'studio:ui-start',
  studioStageSeek: 'studio:stage-seek',
  studioStageSync: 'studio:stage-sync',
  studioStageStop: 'studio:stage-stop',
  appDiagnostics: 'app:diagnostics',
  appOpenLogs: 'app:open-logs',
  appResetGraphics: 'app:reset-graphics',
  appCopy: 'app:copy',
  appCopyImage: 'app:copy-image',
  appShareImage: 'app:share-image',
  appShortcutStatus: 'app:shortcut-status',
  bgResolve: 'bg:resolve',
  bgPick: 'bg:pick',
  bgClear: 'bg:clear',
  bgCacheInfo: 'bg:cacheInfo',
  bgCacheClear: 'bg:cacheClear',
  bgKeyHas: 'bg:key-has',
  bgKeySet: 'bg:key-set',
  bgKeyClear: 'bg:key-clear',
  bgYtCandidates: 'bg:yt-candidates',
  bgKaraoke: 'bg:karaoke',
  studioMic: 'studio:mic',
  bgYtChoose: 'bg:yt-choose',
  bgYtFailed: 'bg:yt-failed',
  choicesGet: 'choices:get',
  choicesSet: 'choices:set',
  choicesClear: 'choices:clear',
  updateGet: 'update:get',
  updateCheck: 'update:check',
  updateInstall: 'update:install'
} as const

/** Push channels (main -> renderer). */
export const EV = {
  settings: 'ev:settings',
  status: 'ev:status',
  playback: 'ev:playback',
  mode: 'ev:mode',
  command: 'ev:command',
  update: 'ev:update',
  fade: 'ev:fade',
  notice: 'ev:notice',
  connectChange: 'ev:connect-change',
  studioFrame: 'ev:studio-frame',
  studioAudio: 'ev:studio-audio'
} as const

export interface ConnectDevice {
  id: string
  name: string
  role: 'viewer' | 'controller' | 'overlay'
  online: boolean
  guest: boolean
  lastSeen: number
}

export interface ConnectCode {
  display: string
  expiresAt: number
  party: boolean
  url: string | null
  /** QR code (data URL) of the pairing link */
  qr: string | null
}

export interface ConnectStatus {
  enabled: boolean
  running: boolean
  /** enabled but the PC is not on a network */
  noNetwork: boolean
  url: string | null
  party: boolean
  devices: ConnectDevice[]
  codes: ConnectCode[]
  /** port the host listens on */
  port?: number
  /** the network card the address belongs to ("Wi-Fi") */
  network?: string | null
  /** switched on, but waiting for a network to serve on */
  waiting?: boolean
  /** devices connected right now */
  online?: number
  /** auto-off after this many idle hours (0 = never) */
  idleStopHours?: number
}

export interface ConnectTestResult {
  ok: boolean
  message: string
  ms: number | null
  ip: string | null
  port: number
  mdns: boolean
}

export interface ConnectView {
  vibe: string
  mode?: 'fixed' | 'cycle' | 'smart'
  videoId: string | null
  offsetMs?: number
}

export interface AppInfo {
  version: string
  platform: string
  envClientId: boolean
}

export type Unsubscribe = () => void

/** Surface exposed on `window.lyra` by the preload script. */
/** One row of the Android "Why isn't it working?" check. fix is an id for selfCheckFix, or null. */
export interface AndroidSelfCheckItem {
  id: string
  level: 'ok' | 'warn' | 'bad' | 'info'
  title: string
  detail: string
  fix: string | null
  fixLabel: string | null
}

export interface AndroidSelfCheck {
  checks: AndroidSelfCheckItem[]
  /** how many checks are warnings or errors */
  problems: number
  /** steps for this phone maker's battery manager, or null */
  oem: { name: string; steps: string[] } | null
  /** plain text to copy for a bug report (no personal data) */
  report: string
}

export interface LyraApi {
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
    /** Restore every setting (and widget size/position) to its default. */
    reset(): Promise<Settings>
    onChange(cb: (s: Settings) => void): Unsubscribe
  }
  window: {
    setMode(mode: ViewMode): Promise<void>
    getMode(): Promise<ViewMode>
    onMode(cb: (e: ModeEvent) => void): Unsubscribe
    /** Cursor-driven dimming of the small widget ("Fade when idle"). */
    onFade(cb: (faded: boolean) => void): Unsubscribe
    /** Finish a shell-driven transition: shrink the window to its final size. */
    settle(): void
    resizeStart(): void
    resizeMove(): void
    resizeEnd(): void
    /** Keyboard resize (arrow keys on the grip): grow / shrink by a few pixels within the mode's limits. */
    resizeBy(dw: number, dh: number): void
    /** The line being sung (or the song), shown as the tray tooltip while the widget is hidden. */
    nowLine(text: string): void
    /** Click-through lock for the small widgets (the mouse passes through). Not saved; the tray and a global shortcut undo it. */
    lock(on: boolean): void
    dragStart(): void
    dragMove(): void
    dragEnd(): void
    hide(): void
    /** Minimize to the taskbar (click its icon to restore). */
    minimize(): void
    quit(): void
  }
  spotify: {
    connect(clientId?: string): Promise<ConnectionStatus>
    disconnect(): Promise<void>
    startDemo(): Promise<void>
    useLocal(): Promise<void>
    getStatus(): Promise<ConnectionStatus>
    getSnapshot(): Promise<PlaybackSnapshot | null>
    onStatus(cb: (s: ConnectionStatus) => void): Unsubscribe
    onPlayback(cb: (s: PlaybackSnapshot) => void): Unsubscribe
  }
  player: {
    command(cmd: PlayerCommand): Promise<CommandResult>
    isLiked(trackId: string): Promise<boolean | null>
    setLiked(trackId: string, liked: boolean): Promise<CommandResult>
    queue(): Promise<QueueItem[] | null>
    recent(): Promise<RecentItem[] | null>
    /** null just launches the Spotify app. */
    openInSpotify(track: Track | null): Promise<void>
  }
  lyrics: {
    get(track: Track): Promise<LyricsResult>
    /** Bypass cache (e.g. after a network error). */
    refresh(track: Track): Promise<LyricsResult>
    /** Ranked alternatives for fixing a wrong match. */
    candidates(track: Track): Promise<{ items: LyricsCandidateInfo[]; error?: string }>
    choose(track: Track, provider: string, id: string): Promise<LyricsResult>
    clearPin(track: Track): Promise<LyricsResult>
    /** Use lyrics the user pasted (LRC, SRT or plain text) for this song. */
    importText(track: Track, text: string): Promise<LyricsResult | { error: string }>
    /** Ask for a .lrc / .srt / .txt file and use it for this song. Resolves null when cancelled. */
    importFile(track: Track): Promise<LyricsResult | { error: string } | null>
    /** How each lyrics service is doing right now. */
    health(): Promise<SourceHealth[]>
  }
  cache: {
    /** Forget cached video lookups and lyrics (pins and imported lyrics stay). */
    clear(): Promise<{ cleared: number }>
  }
  art: {
    /** Returns a data: URL (cached) so the renderer never needs remote image access. */
    get(url: string): Promise<string | null>
  }
  moments: {
    list(): Promise<SavedMoment[]>
    add(m: Omit<SavedMoment, 'id' | 'savedAt'>): Promise<SavedMoment[]>
    remove(id: string): Promise<SavedMoment[]>
  }
  background: {
    /** Decide what to show behind the lyrics for this track. */
    resolve(track: Track): Promise<BackgroundResolution>
    /** Open a file picker; scope 'song' attaches to that track, 'global' is the default for all songs. */
    pick(scope: 'song' | 'global', trackId?: string): Promise<{ ok: boolean; error?: string }>
    clear(scope: 'song' | 'global', trackId?: string): Promise<void>
    /** Apple preview clips saved on this device (count and bytes), and a way to delete them all. */
    clipCacheInfo(): Promise<{ files: number; bytes: number }>
    clipCacheClear(): Promise<void>
    hasYoutubeKey(): Promise<boolean>
    setYoutubeKey(key: string): Promise<{ ok: boolean; error?: string }>
    clearYoutubeKey(): Promise<void>
    youtubeCandidates(track: Track): Promise<{ items: YoutubeVideo[]; error?: string }>
    /** karaoke / instrumental versions of the song to sing along to, best first */
    karaokeVideos(track: Track): Promise<{ items: YoutubeVideo[]; error?: string }>
    /** Pin a specific video for this song (remembered). null = back to automatic. */
    youtubeChoose(trackId: string, videoId: string | null): Promise<void>
    /** Tell the main process a video did not play for this song (its songKey), so it is skipped from now on. */
    youtubeFailed(songKey: string, videoId: string): Promise<void>
  }
  /** Everything the user picked by hand for a song (video, lyrics match, timing nudge). Absent = automatic. */
  choices: {
    get(track: Track): Promise<SongChoice | null>
    /** remember a per-song lyric timing nudge (ms; 0 = none). Video / lyrics picks are saved by their own pickers. */
    setOffset(track: Track, ms: number): Promise<void>
    /** back to automatic: one field, or everything for the song when omitted */
    clear(track: Track, field?: SongChoiceField): Promise<void>
  }
  update: {
    get(): Promise<UpdateState>
    check(): Promise<void>
    /** Restart and install a downloaded update. */
    install(): Promise<void>
    onState(cb: (s: UpdateState) => void): Unsubscribe
  }
  /** Only present in the Android app. */
  android?: {
    hasAccess(): Promise<boolean>
    openAccessSettings(): Promise<void>
    openBatterySettings(): Promise<void>
    overlayState(): Promise<{ enabled: boolean; canDraw: boolean }>
    /** the live-lyrics notification (shade + lock screen) */
    lyricsNotification(): Promise<{ enabled: boolean; public: boolean }>
    setLyricsNotification(on: boolean, showOnLockScreen: boolean): Promise<void>
    /** open the dim always-on-display style lyrics screen */
    openAmbient(): Promise<void>
    /** ambient screen on/off, like the tile / widget / shortcut */
    toggleAmbient(): Promise<void>
    /** record a lyric video of the song playing now (screen + Spotify's sound); Android asks for permission first */
    recordVideo(fromStart: boolean): Promise<{ ok: boolean; error?: string }>
    /** are headphones / a Bluetooth speaker connected? (the microphone cannot hear those) */
    audioRoute(): Promise<{ headphones: boolean }>
    /** "Why isn't it working?": what Lyra depends on (permissions, listener, battery rules) with one-tap fixes */
    selfCheck(): Promise<AndroidSelfCheck>
    /** open the Android screen for a check's fix id; false if there is none */
    selfCheckFix(id: string): Promise<boolean>
    /** Copy an Android device compatibility report with no personal data. */
    compatibilityReport(): Promise<string>
    /** ask Android to add the "Lyra ambient" tile to Quick Settings (Android 13+) */
    addAmbientTile(): Promise<boolean>
    /** in-app updater for GitHub-release builds (disabled under F-Droid / Play); state is kept natively */
    appUpdate: {
      status(): Promise<AndroidUpdateStatus>
      check(): Promise<AndroidUpdateStatus>
      download(): Promise<AndroidUpdateStatus>
      install(): Promise<{ status: 'started' | 'deferred' | 'needsPermission' | 'error'; message: string | null; state: AndroidUpdateStatus }>
      setSettings(s: Partial<Pick<AndroidUpdateStatus, 'channel' | 'unmeteredOnly' | 'autoCheck' | 'autoInstall'>>): Promise<AndroidUpdateStatus>
    }
    /** needsPermission: Android opened the "Display over other apps" screen; the user must allow it, then try again */
    setOverlay(on: boolean): Promise<{ ok: boolean; needsPermission?: boolean }>
  }
  studio: {
    /** Ask where to save the video. Null if the user cancelled. */
    open(suggestedName: string, test?: boolean): Promise<{ id: number; path: string; /** free bytes on that drive (null = unknown) */ freeBytes: number | null } | null>
    write(id: number, position: number, chunk: Uint8Array): Promise<void>
    close(id: number): Promise<void>
    discard(path: string): Promise<void>
    /** Export finished (or failed): sound capture is switched off again. */
    end(): Promise<void>
    reveal(path: string): Promise<void>
    /** open a video made in this session in the default player */
    play(path: string): Promise<void>
    /** the karaoke screen is open: allow the microphone for this window (audio only) */
    setMic(on: boolean): Promise<void>
    /**
     * Record the YouTube background to a temporary file (instead of sending it to the window), with the time of every
     * picture, so a video can be rendered afterwards at exact times. Start it right when the song starts.
     */
    frameCaptureStart(): Promise<boolean>
    /** Stop recording pictures; resolves with the time (ms since frameCaptureStart) of each one, or null when none. */
    frameCaptureStop(): Promise<number[] | null>
    /** One recorded picture (JPEG) by number. */
    frameRead(index: number): Promise<Uint8Array | null>
    /** Delete the temporary file. */
    frameCaptureClear(): Promise<void>
    /** save a JPEG next to the video (same name, ' (cover).jpg'); resolves with its path, or null */
    saveImage(videoPath: string, jpeg: Uint8Array): Promise<string | null>
    /** save lyrics next to the video (same name, .lrc or .srt); resolves with the path, or null */
    saveText(videoPath: string, ext: 'lrc' | 'srt', text: string): Promise<string | null>
    /**
     * Play a YouTube video in a hidden window and stream its picture back as JPEG frames (onFrame), so it can be
     * used as a background in an exported video. Resolves ok:false with a reason when the video can not be played.
     */
    /**
     * Capture only the Spotify app's sound (not notifications or other programs). Resolves ok:false when that is
     * not possible (Spotify not running, Windows older than 10 version 2004): the export then records the whole PC sound.
     * The sound arrives through onAudio as 48 kHz stereo 16-bit PCM.
     */
    audioStart(): Promise<{ ok: boolean; reason?: string }>
    audioStop(): Promise<void>
    onAudio(cb: (pcm: Uint8Array) => void): Unsubscribe
    stageStart(o: { videoId: string; width: number; height: number; fps: number; startSec: number }): Promise<{ ok: boolean; reason?: string; quality?: string; bestHeight?: number }>
    /**
     * Show Lyra's own lyrics screen, in the look you use now, in a hidden window of the export's size and stream its
     * picture back as JPEG frames (onFrame): the video then looks like the app. Resolves ok:false with a reason when it can not start.
     */
    uiStart(o: { width: number; height: number; fps: number; vibe: string }): Promise<{ ok: boolean; reason?: string }>
    stageSeek(sec: number): Promise<void>
    /** Nudge the hidden video to the given time if it has drifted. */
    stageSync(sec: number): Promise<void>
    stageStop(): Promise<void>
    onFrame(cb: (jpeg: Uint8Array) => void): Unsubscribe
  }
  connect: {
    status(): Promise<ConnectStatus>
    setEnabled(on: boolean): Promise<ConnectStatus>
    /** a fresh one-time pairing code (2 minutes) for a device that will be a viewer or a controller */
    newCode(role: 'viewer' | 'controller'): Promise<ConnectStatus>
    /** party mode: a shared code that lets many guests watch (viewers only); ends with endParty */
    party(on: boolean): Promise<ConnectStatus>
    revoke(id: string): Promise<ConnectStatus>
    setRole(id: string, role: 'viewer' | 'controller'): Promise<ConnectStatus>
    /** the renderer reports the vibe / video / lyric offset in effect so other screens can match */
    publishView(v: ConnectView): void
    /** a view-only, revocable device for an OBS browser source (it cannot scan a QR code); remove it with revoke() to kill its link */
    addOverlay(): Promise<ConnectStatus>
    /** the overlay link for that device (carries its credential in the URL fragment), or null; keep it private */
    overlayLink(id: string): Promise<string | null>
    rename(id: string, name: string): Promise<ConnectStatus>
    /** forget and disconnect every paired device */
    revokeAll(): Promise<ConnectStatus>
    /** "Check this setup": really connects to this PC's own network address and reports */
    test(): Promise<ConnectTestResult>
    /** turn Connect off after this many hours with no device connected (0 = never) */
    setIdleStop(hours: number): Promise<ConnectStatus>
    onChange(cb: (s: ConnectStatus) => void): Unsubscribe
  }
  app: {
    info(): Promise<AppInfo>
    /** Plain-text report (versions, settings, recent log) safe to paste into a bug report. */
    diagnostics(): Promise<string>
    /** Open the folder with Lyra's log files in the file manager. */
    openLogs(): Promise<string>
    /** Forget a remembered graphics crash (software rendering): hardware graphics are tried again from the next start. */
    resetGraphics(): Promise<boolean>
    /** Copy plain text to the system clipboard. */
    copy(text: string): Promise<boolean>
    /** Put a PNG (data URL) on the clipboard. Resolves false where that is not possible. */
    copyImage(dataUrl: string): Promise<boolean>
    /** Windows: ask where to save the PNG. Android: open the share sheet. */
    shareImage(dataUrl: string, name: string): Promise<'saved' | 'shared' | 'cancelled' | 'failed'>
    /** Ids of global shortcuts another app already owns. */
    failedShortcuts(): Promise<string[]>
    onCommand(cb: (c: AppCommand) => void): Unsubscribe
    /** A message from the main process worth showing as a toast (for example a global shortcut another app already owns). */
    onNotice(cb: (n: { message: string; kind: 'info' | 'error' }) => void): Unsubscribe
  }
}
