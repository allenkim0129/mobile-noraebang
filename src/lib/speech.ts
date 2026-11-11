export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  }
}

export function recognitionConstructor() {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export function recognitionError(code: string) {
  if (code === 'not-allowed' || code === 'service-not-allowed') return '마이크 또는 음성 인식 권한이 거부됐어요. 정차 후 Safari의 사이트 권한과 기기 설정을 확인해 주세요.';
  if (code === 'audio-capture') return '마이크를 사용할 수 없어요. 다른 앱이나 블루투스 연결을 정차 후 확인해 주세요.';
  if (code === 'network') return '음성 인식 서비스에 연결하지 못했어요. 네트워크를 확인해 주세요.';
  if (code === 'language-not-supported') return '이 기기의 음성 인식에서 한국어를 지원하지 않아요.';
  if (code === 'no-speech') return '목소리를 듣지 못했어요. 정차 후 말하기를 눌러 주세요.';
  return '음성 인식이 중단됐어요. 정차 후 말하기를 눌러 주세요.';
}
