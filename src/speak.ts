/**
 * 用浏览器自带的语音合成读单词，不依赖音频文件。
 * 音色由系统决定；取不到英语音色时交给浏览器按 lang 自己挑。
 */

export function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function speak(text: string, lang = 'en-US') {
  if (!canSpeak()) return false
  const synth = window.speechSynthesis
  synth.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = lang
  utterance.rate = 0.85
  const voice = synth.getVoices().find((item) => item.lang.replace('_', '-').startsWith('en'))
  if (voice) utterance.voice = voice
  synth.speak(utterance)
  return true
}
