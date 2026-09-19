/**
 * 用浏览器自带的语音合成读单词，不依赖音频文件。
 * 音色由系统决定；取不到对应语言音色时交给浏览器按 lang 自己挑。
 */

export function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/**
 * 朗读一段文本。语音列表是异步加载的：首调用时 getVoices() 经常还是空，
 * 这时先挂 voiceschanged 等列表就绪再读，否则容易选不到对应语言的音色。
 * 返回是否成功「发起」了朗读（能否真的出声仍取决于系统有无对应语音）。
 */
export function speak(text: string, lang = 'en-US') {
  if (!canSpeak()) return false
  const synth = window.speechSynthesis
  const utter = () => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    utterance.rate = 0.85
    const wanted = lang.toLowerCase().startsWith('zh') ? 'zh' : lang.toLowerCase().startsWith('en') ? 'en' : lang.slice(0, 2)
    const voice = synth.getVoices().find((item) => item.lang.replace('_', '-').toLowerCase().startsWith(wanted))
    if (voice) utterance.voice = voice
    synth.cancel()
    synth.speak(utterance)
  }
  if (synth.getVoices().length === 0) {
    const onVoices = () => {
      synth.removeEventListener('voiceschanged', onVoices)
      utter()
    }
    synth.addEventListener('voiceschanged', onVoices)
    // 兜底：个别浏览器不触发 voiceschanged，给一点时间后直接读。
    window.setTimeout(utter, 200)
    return true
  }
  utter()
  return true
}
