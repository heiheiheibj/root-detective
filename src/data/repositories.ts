/**
 * 本地适配器：`src/domain/repository.ts` 三个接口的第一份实现。
 * - 内容：直接读 data.ts 生成的模块（词库是构建期产物，运行时只读）。
 * - 进度：落 localStorage。
 * - 发音：退回浏览器语音合成（离线音频文件的优先级更高，见 audioRepository 的注释）。
 *
 * 接 Supabase 时会在这里多一份远端实现，由页面按环境挑选；App 只认接口，不认具体存储。
 */
import {
  createInitialProfile,
  createRootProgress,
  findMorpheme,
  getFamilyWords,
  getMorpheme,
  getWordCore,
  getWordDetailSync,
  loadWordDetail,
  words,
  wordsByRoot,
  worlds,
} from '../domain/data'
import { loadProfile, PROFILE_STORAGE_KEY, serializeProfile } from '../domain/persistence'
import type { AudioRepository, ContentRepository, ProgressRepository } from '../domain/repository'
import { canSpeak, speak } from '../speak'

export const contentRepository: ContentRepository = {
  words,
  wordsByRoot,
  worlds,
  getMorpheme,
  findMorpheme,
  getWordCore,
  getWordDetailSync,
  loadWordDetail,
  getFamilyWords,
  createRootProgress,
}

export const progressRepository: ProgressRepository = {
  read() {
    try {
      return loadProfile(window.localStorage.getItem(PROFILE_STORAGE_KEY))
    } catch {
      // 档案坏了不该让整个 App 打不开：丢进度比白屏好，退回 clean 档案。
      return createInitialProfile()
    }
  },
  serialize(profile) {
    return serializeProfile(profile)
  },
  save(profile) {
    try {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, serializeProfile(profile))
    } catch {
      // 隐私模式 / 配额满：降级成「仅本次会话有效」，不打断答题。
    }
  },
}

/**
 * 音频索引是按需异步加载的：只有没生成过音频的项目里没有这个 json，
 * 静态 import 会让构建直接失败，所以用动态 import + 空映射兜底。
 */
let audioFiles: Record<string, string> = {}
const audioIndexReady = import('../domain/content/audio-index.json')
  .then((module) => {
    audioFiles = (module.default as { files?: Record<string, string> }).files ?? {}
  })
  // 没有索引就当作「一个音频都没录」，发音全部走浏览器合成，不影响答题。
  .catch(() => undefined)

function hasBrowserVoice() {
  return canSpeak()
}

export const audioRepository: AudioRepository = {
  canSpeak() {
    // 按钮要不要禁用：有任何一条发音能力就放开，具体能不能响由 speak 兜底。
    return hasBrowserVoice() || Object.keys(audioFiles).length > 0
  },
  speak(text, lang = 'en-US') {
    // 索引可能还没读完（首帧），先等它落地再决定走哪条路也没意义——直接看当前已有的映射。
    void audioIndexReady
    const source = audioFiles[text]
    if (source) {
      try {
        const audio = new Audio(source)
        // 文件被删/PWA 缓存里还没下到/解码失败：都退回浏览器合成，不让按钮变成死的。
        audio.onerror = () => browserSpeak(text, lang)
        void audio.play().catch(() => browserSpeak(text, lang))
        return true
      } catch {
        // 落到下面统一处理
      }
    }
    return browserSpeak(text, lang)
  },
}

function browserSpeak(text: string, lang: string) {
  return hasBrowserVoice() ? speak(text, lang) : false
}
