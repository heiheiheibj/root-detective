import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Word } from '../src/domain/types'

/**
 * Node 侧的完整词表。浏览器运行时从 data.ts 拿索引层 + 懒加载详情分片；
 * 测试和校验要逐字段检查词条详情，直接读 40 号产物的完整 JSON。
 * 两条路共享同一份产物——测试盯的就是将要发布的数据。
 */
const here = dirname(fileURLToPath(import.meta.url))
export const fullWords: Word[] = JSON.parse(
  readFileSync(join(here, '..', 'src', 'domain', 'content', 'words.json'), 'utf8'),
)

const wordById = new Map(fullWords.map((word) => [word.id, word]))

export function getFullWord(id: string): Word {
  const found = wordById.get(id)
  if (!found) throw new Error(`词条不存在：${id}`)
  return found
}
