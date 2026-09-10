import { useEffect, useState } from 'react'

/**
 * 新手帮助：四页，每页配一段循环播放的小动画。
 * 动画全部用 CSS 做，不用图片——界面改了这里不会跟着过期。
 * 每段动画的最后一帧就是最终状态，所以开了「减少动态效果」也看得懂。
 */

const STEP_COUNT = 4

function SplitArt() {
  return <div className="help-art art-split">
    <div className="art-row">
      <span className="art-part p1"><strong>circum-</strong><small>周围</small></span>
      <i>+</i>
      <span className="art-part p2"><strong>spect</strong><small>看</small></span>
    </div>
    <span className="art-arrow">↓</span>
    <span className="art-literal">从四周看</span>
    <span className="art-arrow">↓</span>
    <span className="art-modern">谨慎；周详</span>
  </div>
}

function BuildArt() {
  return <div className="help-art art-build">
    <div className="art-slots">
      <span className="art-slot s1">circum-</span>
      <span className="art-slot s2">spect</span>
    </div>
    <div className="art-cards">
      <span className="art-card c1">circum-<small>周围</small></span>
      <span className="art-card c2">spect<small>看</small></span>
      <span className="art-card dim">pre-<small>前、预先</small></span>
      <span className="art-card dim">spic<small>长得像，但不是</small></span>
    </div>
  </div>
}

function ForgeArt() {
  return <div className="help-art art-forge">
    <div className="art-options">
      <span className="art-option o1">视线受阻、看不清楚</span>
      <span className="art-option o2">四处张望、防备危险，不轻举妄动<em>✓</em></span>
      <span className="art-option o3">视力开阔、登高望远</span>
    </div>
  </div>
}

function RewardArt() {
  return <div className="help-art art-reward">
    <span className="art-eyebrow">词根 spec / spect（看）的熟练度</span>
    <div className="art-bar"><span /></div>
    <div className="art-bar-meta"><b>1%</b><i>→</i><b className="art-bar-end">13%</b></div>
  </div>
}

const STEPS = [
  {
    key: 'why',
    eyebrow: '为什么这样背',
    title: '先看字面画面，再看今天的意思。',
    body: '英语单词大多由前缀、词根、后缀拼出来。circumspect 拆开是「周围 + 看」，画面是「从四周看」——所以它今天的意思是「谨慎」。记住画面，比死背中文快。',
    art: <SplitArt />,
  },
  {
    key: 'build',
    eyebrow: '第一步 · 拼单词',
    title: '从卡片里点出这个词的组成部分。',
    body: '按从左到右的顺序点卡片，放进上面的方框。卡片里有几张是干扰项，长得像但不是这个词的一部分。点错了原地提示，不跳页。',
    art: <BuildArt />,
  },
  {
    key: 'forge',
    eyebrow: '第二步 · 猜词义',
    title: '把各部分的意思连起来，猜它今天的意思。',
    body: '拼完之后，屏幕上会给你三个意思。别急着选，先在心里把刚才那个字面画面说一遍，再挑最接近的。选错了可以原地重选。',
    art: <ForgeArt />,
  },
  {
    key: 'reward',
    eyebrow: '第三步 · 看结果',
    title: '词根的熟练度往上涨，复习安排也跟着走。',
    body: '每学一个词，涨的不是这个词本身，而是它带的那个词根。词根熟练度低了就会排进「复习」——复习是把词和意思配起来，不用重走一遍三步。',
    art: <RewardArt />,
  },
]

export default function HelpOverlay({ onFinish, onClose }: { onFinish: () => void; onClose: () => void }) {
  const [index, setIndex] = useState(0)
  const isLast = index === STEP_COUNT - 1
  const step = STEPS[index]

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') setIndex((current) => Math.min(STEP_COUNT - 1, current + 1))
      if (event.key === 'ArrowLeft') setIndex((current) => Math.max(0, current - 1))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return <div className="help-backdrop">
    <div className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <div className="help-head">
        <span className="eyebrow">{step.eyebrow}</span>
        <button className="help-skip" onClick={onClose}>直接开始</button>
      </div>
      {step.art}
      <h2 id="help-title">{step.title}</h2>
      <p>{step.body}</p>
      <div className="help-foot">
        <div className="help-dots" aria-hidden="true">{STEPS.map((item, dotIndex) => <span className={dotIndex === index ? 'on' : ''} key={item.key} />)}</div>
        <div className="help-actions">
          <button className="secondary-button" disabled={index === 0} onClick={() => setIndex(index - 1)}>上一页</button>
          <button className="primary-button" onClick={() => isLast ? onFinish() : setIndex(index + 1)}>{isLast ? '开始学第一个词' : '下一页'} <span>→</span></button>
        </div>
      </div>
    </div>
  </div>
}
