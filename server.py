#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
词根侦探 · Python 版兜底词典服务
=================================
与 ASP.NET 版 `Dict.aspx` **并存**的纯 Python 实现（零第三方依赖，仅用标准库）。

职责（和 Dict.aspx.cs 完全一致）：
  1. 提供 /Dict.aspx 接口：POST word=xxx 或 GET ?word=xxx
     -> 查 dist/App_Data/dict.db（SQLite，只读）
     -> 命中 words 表：返回 {ok, found:true, word, phonetic, meaning, compound?}
     -> 未命中：返回 {ok, found:false, word, suggestions:[{word,phonetic,meaning}...]}
  2. 兼带静态托管 dist/ 下的前端（可直接替代 IIS：python server.py 即可起整套站点）

与 ASP.NET 并存方式：本服务默认跑在 8000 端口，IIS 仍占 80；
  - 用 IIS：前端同源调 80 上的 /Dict.aspx（ASP.NET 处理）
  - 用 Python：前端同源调 8000 上的 /Dict.aspx（本文件处理）
  两者接口契约相同，前端无需任何改动。

运行：python server.py            # 默认 http://0.0.0.0:8000
      PORT=9000 python server.py  # 自定义端口
"""
import os
import re
import json
import sqlite3
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist")
DB_PATH = os.path.join(ROOT, "App_Data", "dict.db")
HOST = os.environ.get("HOST", "0.0.0.0")  # 默认监听所有网卡；本地/受限环境可设 HOST=127.0.0.1
PORT = int(os.environ.get("PORT", "8000"))

# ---------- CJK 工具（与 C# 版 IsCjk / FirstCjkBigram / FirstCjkChar 对应）----------
def is_cjk(c: str) -> bool:
    o = ord(c)
    return (0x2E80 <= o <= 0x9FFF) or (0xF900 <= o <= 0xFAFF) or (0xFF00 <= o <= 0xFFEF)

def has_cjk(s: str) -> bool:
    return any(is_cjk(c) for c in s)

def first_cjk_bigram(s: str):
    for i in range(len(s) - 1):
        if is_cjk(s[i]) and is_cjk(s[i + 1]):
            return s[i:i + 2]
    return None

def first_cjk_char(s: str):
    for c in s:
        if is_cjk(c):
            return c
    return None

# ---------- 词典查询（与 Dict.aspx.cs 的 SQL 一一对应）----------
def query_dict(word: str):
    word = (word or "").strip()
    if not word:
        return {"ok": False, "error": "缺少 word 参数"}
    lw = word.lower()
    conn = sqlite3.connect(f"file:{os.path.abspath(DB_PATH)}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.cursor()
        # 1) 精确查词
        cur.execute(
            "SELECT word, phonetic, meaning FROM words WHERE word_lower = ? LIMIT 1", (lw,)
        )
        row = cur.fetchone()
        if row:
            result = {
                "ok": True,
                "found": True,
                "word": row["word"],
                "phonetic": row["phonetic"],
                "meaning": row["meaning"],
            }
            # 复合词分解：表不存在/出错就忽略，绝不影响主返回
            try:
                cur2 = conn.cursor()
                cur2.execute(
                    "SELECT part1, part2 FROM compounds WHERE word_lower = ? LIMIT 1", (lw,)
                )
                cr = cur2.fetchone()
                if cr:
                    result["compound"] = {"parts": [cr["part1"], cr["part2"]]}
            except sqlite3.Error:
                pass
            return result

        # 2) 未命中 -> 建议
        items = []
        if has_cjk(word):
            probe = first_cjk_bigram(word)
            done = False
            if probe:
                try:
                    cur.execute(
                        "SELECT w.word, w.phonetic, w.meaning FROM grams g "
                        "JOIN words w ON w.id = g.word_id WHERE g.gram = ? "
                        "AND w.meaning LIKE ? ORDER BY length(w.word), w.word_lower LIMIT 8",
                        (probe, "%" + word + "%"),
                    )
                    items = [dict(r) for r in cur.fetchall()]
                    done = True
                except sqlite3.Error:
                    items, done = [], False
            if not done:
                probe1 = first_cjk_char(word)
                if probe1:
                    try:
                        cur.execute(
                            "SELECT w.word, w.phonetic, w.meaning FROM grams1 g "
                            "JOIN words w ON w.id = g.word_id WHERE g.gram = ? "
                            "AND w.meaning LIKE ? ORDER BY length(w.word), w.word_lower LIMIT 8",
                            (probe1, "%" + word + "%"),
                        )
                        items = [dict(r) for r in cur.fetchall()]
                        done = True
                    except sqlite3.Error:
                        items, done = [], False
            if not done:
                cur.execute(
                    "SELECT word, phonetic, meaning FROM words WHERE meaning LIKE ? "
                    "ORDER BY length(word), word_lower LIMIT 8",
                    ("%" + word + "%",),
                )
                items = [dict(r) for r in cur.fetchall()]
        else:
            lo, hi = lw, lw + "\uffff"
            cur.execute(
                "SELECT word, phonetic, meaning FROM words "
                "WHERE word_lower >= ? AND word_lower < ? "
                "ORDER BY length(word), word_lower LIMIT 8",
                (lo, hi),
            )
            items = [dict(r) for r in cur.fetchall()]
        return {"ok": True, "found": False, "word": word, "suggestions": items}
    finally:
        conn.close()

# ---------- 静态文件托管 ----------
CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
}

def safe_join(base: str, url_path: str):
    """把 URL 路径安全地映射到 base 下的文件，防 ../ 穿越。"""
    rel = urllib.parse.urlparse(url_path).path.lstrip("/")
    dest = os.path.normpath(os.path.join(base, rel))
    if not dest.startswith(os.path.normpath(base)):
        return None
    return dest

class Handler(BaseHTTPRequestHandler):
    server_version = "RootDetectivePython/1.0"

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _send_static(self, path: str):
        if path in ("", "/"):
            path = "/index.html"
        fpath = safe_join(ROOT, path)
        if not fpath or not os.path.isfile(fpath):
            # SPA 回退：未知路径交给 index.html
            fpath = os.path.join(ROOT, "index.html")
            if not os.path.isfile(fpath):
                self.send_error(404, "Not Found")
                return
        ext = os.path.splitext(fpath)[1].lower()
        ctype = CONTENT_TYPES.get(ext, "application/octet-stream")
        try:
            with open(fpath, "rb") as f:
                data = f.read()
        except OSError:
            self.send_error(404, "Not Found")
            return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/Dict.aspx"):
            q = urllib.parse.parse_qs(parsed.query)
            word = (q.get("word") or [""])[0]
            self._send_json(query_dict(word))
        else:
            self._send_static(parsed.path)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if not parsed.path.startswith("/Dict.aspx"):
            self.send_error(405, "Method Not Allowed")
            return
        length = int(self.headers.get("Content-Length", 0) or 0)
        body = self.rfile.read(length).decode("utf-8", "ignore")
        form = urllib.parse.parse_qs(body)
        word = (form.get("word") or [""])[0]
        self._send_json(query_dict(word))

    def log_message(self, fmt, *args):  # 简化日志
        pass

def main():
    if not os.path.isfile(DB_PATH):
        print(f"[warn] 未找到词典数据库: {DB_PATH}")
        print(f"[warn] /Dict.aspx 将只能返回「缺少 word 参数」之外的空结果，请确认 dist/App_Data/dict.db 存在。")
    if not os.path.isdir(ROOT):
        print(f"[error] 未找到前端目录: {ROOT}（请先 npm run build）")
        return
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"词根侦探 Python 服务已启动: http://0.0.0.0:{PORT}")
    print(f"  前端静态目录: {ROOT}")
    print(f"  词典接口:     http://0.0.0.0:{PORT}/Dict.aspx?word=computer")
    print(f"  (与 ASP.NET 版 Dict.aspx 并存：IIS 占 80，本服务占 {PORT})")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")

if __name__ == "__main__":
    main()
