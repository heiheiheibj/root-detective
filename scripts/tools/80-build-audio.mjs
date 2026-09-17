#!/usr/bin/env node
/**
 * 生成单词发音。
 *
 * 产出：
 *   public/audio/<word>.wav        音频本体（体积大，已 gitignore）
 *   src/domain/content/audio-index.json  「词 → 文件」映射，运行时唯一的查找入口
 *
 * 为什么默认引擎是 sapi 而不是方案里写的 Edge-TTS：
 * Edge-TTS 要走外网 WebSocket，本机的外网访问依赖代理（127.0.0.1:7890），而 Node 原生 WebSocket
 * 不支持代理，实测跑不通；留着 --engine=edge 的分支位置，等有可用的代理方案再补实现。
 * sapi 是 Windows 系统自带的语音合成，完全离线、音质够用、可复现，代价是只能出 wav（体积偏大）。
 *
 * 用法：
 *   node scripts/tools/80-build-audio.mjs                 # 补齐缺发的词，最多 --limit 个
 *   node scripts/tools/80-build-audio.mjs --limit=20      # 先跑一小批看看效果
 *   node scripts/tools/80-build-audio.mjs --engine=edge   # 尚不支持，会明确报错
 */
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const repoRoot = process.cwd()
const AUDIO_DIR = join(repoRoot, 'public', 'audio')
const INDEX_PATH = join(repoRoot, 'src', 'domain', 'content', 'audio-index.json')
const WORK_DIR = join(repoRoot, 'scripts', '.work')
const DEFAULT_LIMIT = 200

function readArgs() {
  const args = new Map()
  for (const arg of process.argv.slice(2)) {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=')
    args.set(key, value)
  }
  return args
}

/** 文件名只保留安全字符；word.id 就是单词本身，理论上不会有空格。 */
function safeBaseName(word) {
  return word.replace(/[^a-zA-Z0-9-]/g, '_')
}

/**
 * wav 转 mp3：SAPI 只能直出 wav，一个词 80KB 往上，3192 个词就是两百多 MB，装不进 PWA 缓存。
 * 转成 24kHz 单声道 40kbps 后大约 1/6 体积，手机上也听不出差别。
 * 没有 ffmpeg 时保持 wav，不阻断任务（只是体积大）。
 */
async function compress(source, target) {
  try {
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', source, '-codec:a', 'libmp3lame', '-ar', '24000', '-ac', '1', '-b:a', '40k', target])
    return true
  } catch {
    return false
  }
}

function loadIndex() {
  if (!existsSync(INDEX_PATH)) return { generatedAt: null, engine: null, count: 0, files: {} }
  return JSON.parse(readFileSync(INDEX_PATH, 'utf8'))
}

/**
 * @param {Array<{ id: string, path: string }>} jobs
 */
function buildPowerShellScript(jobs) {
  return [
    '$ErrorActionPreference = "Stop"',
    'Add-Type -AssemblyName System.Speech',
    '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    'try {',
    '  $voice = $synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like "en-US*" } | Select-Object -First 1',
    '  if ($voice) { $synth.SelectVoice($voice.VoiceInfo.Name) }',
    '  $synth.Rate = -1',
    `  $jobs = ConvertFrom-Json (Get-Content -LiteralPath "${join(WORK_DIR, 'audio-jobs.json').replace(/\\/g, '\\')}" -Raw)`,
    '  foreach ($job in $jobs) {',
    '    $synth.SetOutputToWaveFile($job.path)',
    '    $synth.Speak($job.text)',
    // 连续写多个 wav 时，不交出输出句柄的话上一个文件会一直是 0 字节。
    '    $synth.SetOutputToNull()',
    '  }',
  ].join('\n') + '\n}\nfinally { $synth.Dispose() }\n'
}

async function runSapi(jobs) {
  mkdirSync(WORK_DIR, { recursive: true })
  mkdirSync(AUDIO_DIR, { recursive: true })
  const jobsPath = join(WORK_DIR, 'audio-jobs.json')
  const scriptPath = join(WORK_DIR, 'audio-sapi.ps1')
  // PowerShell 5 的 -File 默认按系统 ANSI 读取 ps1，中文注释会乱码；这里只写 ASCII + 路径，
  // 组词文本走 JSON 文件传递，避免命令行转义踩坑。
  writeFileSync(jobsPath, JSON.stringify(jobs), 'utf8')
  writeFileSync(scriptPath, buildPowerShellScript(jobs), 'utf8')
  await run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { maxBuffer: 16 * 1024 * 1024 })
}

async function main() {
  const args = readArgs()
  const engine = args.get('engine') ?? 'sapi'
  const limit = Number(args.get('limit') ?? DEFAULT_LIMIT)
  const force = args.get('force') === 'true'

  if (engine !== 'sapi') {
    console.error(`引擎 ${engine} 尚未实现：Edge-TTS 需要外网 WebSocket，而本机外网走代理、Node 原生 WebSocket 不支持代理。先用 --engine=sapi。`)
    process.exit(1)
  }
  if (process.platform !== 'win32') {
    console.error('sapi 引擎依赖 Windows 的 System.Speech，当前平台不可用。')
    process.exit(1)
  }

  const words = JSON.parse(readFileSync(join(repoRoot, 'src', 'domain', 'content', 'words.json'), 'utf8'))
  const index = loadIndex()
  const pending = words.filter((word) => force || !index.files[word.id])
  const jobs = pending.slice(0, limit).map((word) => ({
    id: word.id,
    text: word.word,
    path: join(AUDIO_DIR, `${safeBaseName(word.id)}.wav`),
  }))

  if (jobs.length === 0) {
    console.log(`音频已齐全：${Object.keys(index.files).length} 个词都有发音。加 --force 可重录。`)
    return
  }

  console.log(`待生成 ${jobs.length} 个发音（共 ${pending.length} 个还没录，本次上限 ${limit}）…`)
  await runSapi(jobs)

  let ok = 0
  let compressed = 0
  const files = { ...index.files }
  for (const job of jobs) {
    // SAPI 对拿不准的词可能写出 0 字节或极小的空文件，那种不能算「有发音」。
    if (!existsSync(job.path) || statSync(job.path).size <= 1024) continue
    const base = `${safeBaseName(job.id)}`
    const mp3Path = join(AUDIO_DIR, `${base}.mp3`)
    const didCompress = (await compress(job.path, mp3Path)) && existsSync(mp3Path) && statSync(mp3Path).size > 1024
    if (didCompress) {
      rmSync(job.path, { force: true })
      compressed += 1
    }
    files[job.id] = `audio/${base}.${didCompress ? 'mp3' : 'wav'}`
    ok += 1
  }

  const failed = jobs.length - ok
  const next = { generatedAt: new Date().toISOString(), engine, count: Object.keys(files).length, files }
  writeFileSync(INDEX_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  console.log(
    `已写出 ${ok} 个发音（${compressed} 个压成 mp3）→ public/audio/，索引 ${Object.keys(files).length} 条` +
      (failed ? `（${failed} 个失败，下次重跑会重试）` : ''),
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
