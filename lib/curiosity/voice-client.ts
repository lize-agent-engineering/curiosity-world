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

interface ManagedGuidanceDependencies {
  fetch?: typeof fetch;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  createAudio?: (src: string) => ManagedAudioLike;
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
