interface SpeechSynthesisLike {
  cancel(): void;
  speak(utterance: SpeechUtteranceLike): void;
}

interface SpeechUtteranceLike {
  readonly text: string;
  lang: string;
  rate: number;
  onend: (() => void) | null | undefined;
  onerror: (() => void) | null | undefined;
}

type UtteranceConstructor = new (text: string) => SpeechUtteranceLike;

interface RecognitionResultEventLike {
  results?: ArrayLike<ArrayLike<{ transcript?: string; confidence?: number }>>;
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEventLike) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

type RecognitionConstructor = new () => RecognitionLike;

interface ManagedAudioLike {
  readonly src: string;
  play(): Promise<void>;
}

interface ControllableManagedAudioLike extends ManagedAudioLike {
  pause(): void;
  currentTime: number;
  onended: (() => void) | null;
  onerror: (() => void) | null;
}

interface ManagedGuidanceDependencies {
  fetch?: typeof fetch;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  createAudio?: (src: string) => ManagedAudioLike;
}

interface ManagedGuidancePlayerDependencies {
  fetch?: typeof fetch;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  createAudio?: (src: string) => ControllableManagedAudioLike;
}

export class ManagedGuidancePlayer {
  private active:
    | {
        audio: ControllableManagedAudioLike;
        objectUrl: string;
        finish: () => void;
      }
    | undefined;
  private request: AbortController | undefined;

  constructor(private readonly dependencies: ManagedGuidancePlayerDependencies = {}) {}

  stop(): void {
    this.request?.abort();
    this.request = undefined;
    if (!this.active) return;
    const { audio, objectUrl, finish } = this.active;
    this.active = undefined;
    audio.pause();
    audio.currentTime = 0;
    (this.dependencies.revokeObjectURL ?? URL.revokeObjectURL.bind(URL))(objectUrl);
    finish();
  }

  async play(text: string): Promise<void> {
    this.stop();
    const request = new AbortController();
    this.request = request;
    const fetchNarration = this.dependencies.fetch ?? globalThis.fetch;
    try {
      const response = await fetchNarration('/api/curiosity/narration', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: request.signal,
      });
      if (!response.ok) throw new Error('TTS_FAILED: 语音旁白生成失败，请重试。');
      if (request.signal.aborted) return;
      const createObjectURL = this.dependencies.createObjectURL ?? URL.createObjectURL.bind(URL);
      const objectUrl = createObjectURL(await response.blob());
      if (request.signal.aborted) {
        (this.dependencies.revokeObjectURL ?? URL.revokeObjectURL.bind(URL))(objectUrl);
        return;
      }
      const createAudio =
        this.dependencies.createAudio ??
        ((src: string) => new Audio(src) as unknown as ControllableManagedAudioLike);
      const audio = createAudio(objectUrl);
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          if (this.active?.audio === audio) this.active = undefined;
          resolve();
        };
        const fail = () => {
          if (settled) return;
          settled = true;
          if (this.active?.audio === audio) this.active = undefined;
          (this.dependencies.revokeObjectURL ?? URL.revokeObjectURL.bind(URL))(objectUrl);
          reject(new Error('TTS_FAILED: 语音旁白播放失败，请重试。'));
        };
        this.active = { audio, objectUrl, finish };
        audio.onended = () => {
          (this.dependencies.revokeObjectURL ?? URL.revokeObjectURL.bind(URL))(objectUrl);
          finish();
        };
        audio.onerror = fail;
        audio.play().catch(fail);
      });
    } catch (cause) {
      if (request.signal.aborted) return;
      throw cause;
    } finally {
      if (this.request === request) this.request = undefined;
    }
  }
}

export function describeVoiceFailure(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (/VERSION_NOT_ACTIVE|语音事件只能写入当前活动版本/i.test(message)) {
    return '探索版本刚刚更新，请重新点击说话。';
  }
  if (
    (cause instanceof DOMException && cause.name === 'NotAllowedError') ||
    /permission denied|permission dismissed|notallowederror/i.test(message)
  ) {
    return '没有获得麦克风权限。请在浏览器设置中允许使用麦克风，然后重新说一次。';
  }
  if (/MICROPHONE_PERMISSION_TIMEOUT/i.test(message)) {
    return '浏览器没有显示授权窗口。请打开地址栏旁的网站权限，将麦克风设为允许，然后重新说一次。';
  }
  return message;
}

export function requestMicrophoneStream(
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>,
  timeoutMs = 8_000,
): Promise<MediaStream> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      reject(new Error('MICROPHONE_PERMISSION_TIMEOUT: browser prompt unavailable'));
    }, timeoutMs);

    getUserMedia({ audio: true }).then(
      (stream) => {
        if (settled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolve(stream);
      },
      (cause) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(cause);
      },
    );
  });
}

export async function transcribeChildRecording(
  audio: Blob,
  dependencies: { fetch?: typeof fetch } = {},
  signal?: AbortSignal,
): Promise<{ transcript: string }> {
  const form = new FormData();
  form.set('audio', new File([audio], 'answer.webm', { type: audio.type || 'audio/webm' }));
  const response = await (dependencies.fetch ?? globalThis.fetch)('/api/curiosity/transcribe', {
    method: 'POST',
    body: form,
    signal,
  });
  const body = (await response.json()) as { transcript?: unknown; error?: unknown };
  if (!response.ok || typeof body.transcript !== 'string' || !body.transcript.trim()) {
    throw new Error(
      `ASR_FAILED: ${typeof body.error === 'string' ? body.error : '语音识别失败，请重试。'}`,
    );
  }
  return { transcript: body.transcript.trim() };
}

export async function speakManagedGuidance(
  text: string,
  dependencies: ManagedGuidanceDependencies = {},
  signal?: AbortSignal,
): Promise<void> {
  const fetchNarration = dependencies.fetch ?? globalThis.fetch;
  const createObjectURL = dependencies.createObjectURL ?? URL.createObjectURL.bind(URL);
  const revokeObjectURL = dependencies.revokeObjectURL ?? URL.revokeObjectURL.bind(URL);
  const createAudio = dependencies.createAudio ?? ((src) => new Audio(src));
  const response = await fetchNarration('/api/curiosity/narration', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!response.ok) {
    throw new Error('TTS_FAILED: 语音旁白生成失败，请重试。');
  }
  const objectUrl = createObjectURL(await response.blob());
  try {
    await createAudio(objectUrl).play();
  } catch {
    throw new Error('TTS_FAILED: 语音旁白播放失败，请重试。');
  } finally {
    revokeObjectURL(objectUrl);
  }
}

export function speakGuidance(
  text: string,
  dependencies: {
    speechSynthesis?: SpeechSynthesisLike;
    Utterance?: UtteranceConstructor;
  } = {},
): Promise<void> {
  const speechSynthesis =
    dependencies.speechSynthesis ?? (globalThis.speechSynthesis as SpeechSynthesisLike);
  const Utterance =
    dependencies.Utterance ?? (globalThis.SpeechSynthesisUtterance as UtteranceConstructor);
  if (!speechSynthesis || !Utterance) {
    return Promise.reject(new Error('TTS_UNAVAILABLE: 当前浏览器不支持语音旁白。'));
  }
  speechSynthesis.cancel();
  const utterance = new Utterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = 0.9;
  return new Promise((resolve, reject) => {
    utterance.onend = () => resolve();
    utterance.onerror = () => reject(new Error('TTS_FAILED: 语音旁白播放失败。'));
    speechSynthesis.speak(utterance);
  });
}

function browserRecognition(): RecognitionConstructor | undefined {
  const scope = globalThis as typeof globalThis & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

export function recognizeChildAnswer(
  dependencies: { Recognition?: RecognitionConstructor } = {},
): Promise<{ transcript: string; confidence: number }> {
  const Recognition = dependencies.Recognition ?? browserRecognition();
  if (!Recognition) {
    return Promise.reject(new Error('ASR_UNAVAILABLE: 当前浏览器不支持语音回答。'));
  }
  return new Promise((resolve, reject) => {
    const recognition = new Recognition();
    let settled = false;
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const result = event.results?.[0]?.[0];
      const transcript = result?.transcript?.trim() ?? '';
      if (!transcript) return;
      settled = true;
      recognition.abort();
      resolve({ transcript, confidence: result?.confidence ?? 0 });
    };
    recognition.onerror = () => {
      if (settled) return;
      settled = true;
      reject(new Error('ASR_FAILED: 没有听清，请再说一次。'));
    };
    recognition.onend = () => {
      if (settled) return;
      settled = true;
      reject(new Error('ASR_UNCLEAR: 没有听清，请再说一次。'));
    };
    recognition.start();
  });
}
