using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.Text;
using System.Web;
using System.Web.UI;

namespace RootDetective
{
    /// <summary>
    /// 极简词典接口：POST word=xxx（也兼容 GET ?word=xxx）→ 查 SQLite → 直接返回 JSON。
    /// 给「不在词根词库里的词」提供音标 + 中文释义；查不到时附前缀建议。
    /// 数据库：~/App_Data/dict.db，表 words(word, word_lower, phonetic, meaning)。
    /// 注意：本项目用「网站(Website)」模型，IIS 会即时编译本文件，无需先 build。
    /// </summary>
    public partial class Dict : Page
    {
        protected void Page_Load(object sender, EventArgs e)
        {
            Response.ContentType = "application/json";
            Response.ContentEncoding = Encoding.UTF8;
            Response.Charset = "utf-8";
            // 前端可能是别的域名（静态站），允许跨域调用
            Response.AddHeader("Access-Control-Allow-Origin", "*");

            string word = (Request.Form["word"] ?? Request.QueryString["word"] ?? "").Trim();
            if (word.Length == 0)
            {
                Response.Write("{\"ok\":false,\"error\":\"缺少 word 参数\"}");
                return;
            }

            string dbPath = Server.MapPath("~/App_Data/dict.db");
            using (var conn = new SQLiteConnection("Data Source=" + dbPath + ";Version=3;Read Only=True;"))
            {
                conn.Open();

                // 1) 精确查词
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT word, phonetic, meaning FROM words WHERE word_lower = @w LIMIT 1";
                    cmd.Parameters.AddWithValue("@w", word.ToLowerInvariant());
                    using (var r = cmd.ExecuteReader())
                    {
                        if (r.Read())
                        {
                            var sb = new StringBuilder();
                            sb.Append("{\"ok\":true,\"found\":true");
                            sb.Append(",\"word\":" + Json(r.GetString(0)));
                            sb.Append(",\"phonetic\":" + Json(r.GetString(1)));
                            sb.Append(",\"meaning\":" + Json(r.GetString(2)));
                            // 复合词分解：安全降级——表不存在或查询出错就省略该字段，绝不影响主返回。
                            try
                            {
                                using (var cmd2 = conn.CreateCommand())
                                {
                                    cmd2.CommandText = "SELECT part1, part2 FROM compounds WHERE word_lower = @w LIMIT 1";
                                    cmd2.Parameters.AddWithValue("@w", word.ToLowerInvariant());
                                    using (var r2 = cmd2.ExecuteReader())
                                    {
                                        if (r2.Read())
                                            sb.Append(",\"compound\":{\"parts\":[" + Json(r2.GetString(0)) + "," + Json(r2.GetString(1)) + "]}");
                                    }
                                }
                            }
                            catch { /* 老库无 compounds 表时静默跳过 */ }
                            sb.Append("}");
                            Response.Write(sb.ToString());
                            return;
                        }
                    }
                }

                // 2) 没查到时给若干建议：
                //    英文 -> 按拼写前缀搜；
                //    中文 -> 优先用 grams(2-gram 倒排索引) 探测，毫秒级；无索引表/取不到二元组时退回释义模糊扫。
                var items = new List<string>();
                if (HasCjk(word))
                {
                    string probe = FirstCjkBigram(word);
                    bool done = false;
                    if (probe != null)
                    {
                        try
                        {
                            using (var cmd = conn.CreateCommand())
                            {
                                cmd.CommandText = "SELECT w.word, w.phonetic, w.meaning FROM grams g JOIN words w ON w.id = g.word_id WHERE g.gram = @g AND w.meaning LIKE @m ORDER BY length(w.word), w.word_lower LIMIT 8";
                                cmd.Parameters.AddWithValue("@g", probe);
                                cmd.Parameters.AddWithValue("@m", "%" + word + "%");
                                using (var r = cmd.ExecuteReader()) { while (r.Read()) items.Add(Item(r)); }
                            }
                            done = true;
                        }
                        catch { items.Clear(); done = false; }   // 老库没有 grams 表时静默退回
                    }
                    // 只有单个汉字时取不到二元组，改用 grams1 单字索引探测（毫秒级），
                    // 老库没有 grams1 表时静默退回下面的释义模糊扫。
                    if (!done)
                    {
                        string probe1 = FirstCjkChar(word);
                        if (probe1 != null)
                        {
                            try
                            {
                                using (var cmd = conn.CreateCommand())
                                {
                                    cmd.CommandText = "SELECT w.word, w.phonetic, w.meaning FROM grams1 g JOIN words w ON w.id = g.word_id WHERE g.gram = @g AND w.meaning LIKE @m ORDER BY length(w.word), w.word_lower LIMIT 8";
                                    cmd.Parameters.AddWithValue("@g", probe1);
                                    cmd.Parameters.AddWithValue("@m", "%" + word + "%");
                                    using (var r = cmd.ExecuteReader()) { while (r.Read()) items.Add(Item(r)); }
                                }
                                done = true;
                            }
                            catch { items.Clear(); done = false; }
                        }
                    }
                    if (!done)
                    {
                        using (var cmd = conn.CreateCommand())
                        {
                            cmd.CommandText = "SELECT word, phonetic, meaning FROM words WHERE meaning LIKE @m ORDER BY length(word), word_lower LIMIT 8";
                            cmd.Parameters.AddWithValue("@m", "%" + word + "%");
                            using (var r = cmd.ExecuteReader()) { while (r.Read()) items.Add(Item(r)); }
                        }
                    }
                }
                else
                {
                    using (var cmd = conn.CreateCommand())
                    {
                        // 用索引范围扫描代替 LIKE 'x%'：
                        // idx_words_lower 是 BINARY 排序，LIKE 大小写不敏感用不上它 → 会退化成全表扫。
                        // 改成 >= 前缀 且 < 前缀+'￿'，即可命中索引。
                        string lo = word.ToLowerInvariant();
                        cmd.CommandText = "SELECT word, phonetic, meaning FROM words WHERE word_lower >= @lo AND word_lower < @hi ORDER BY length(word), word_lower LIMIT 8";
                        cmd.Parameters.AddWithValue("@lo", lo);
                        cmd.Parameters.AddWithValue("@hi", lo + "\uffff");
                        using (var r = cmd.ExecuteReader()) { while (r.Read()) items.Add(Item(r)); }
                    }
                }
                Response.Write("{\"ok\":true,\"found\":false,\"word\":" + Json(word)
                    + ",\"suggestions\":[" + string.Join(",", items) + "]}");
            }
        }

        /// <summary>查询里是否含中日韩字符（据此决定按英文拼写还是中文释义检索）。</summary>
        private static bool HasCjk(string s)
        {
            foreach (char c in s) if (IsCjk(c)) return true;
            return false;
        }

        /// <summary>单字符是否属于中日韩相关区段。</summary>
        private static bool IsCjk(char c)
        {
            return (c >= 0x2E80 && c <= 0x9FFF)   // 中日韩统一表意文字 / 部首 / 假名等
                || (c >= 0xF900 && c <= 0xFAFF)   // 兼容表意文字
                || (c >= 0xFF00 && c <= 0xFFEF);  // 全角字符
        }

        /// <summary>取查询里第一对相邻的中日韩字符，作为 grams 2-gram 索引的探测键；没有则返回 null。</summary>
        private static string FirstCjkBigram(string s)
        {
            for (int i = 0; i + 1 < s.Length; i++)
            {
                if (IsCjk(s[i]) && IsCjk(s[i + 1])) return s.Substring(i, 2);
            }
            return null;
        }

        /// <summary>取查询里第一个中日韩单字；用于只有单个汉字、取不到二元组时的 grams1 单字索引探测。</summary>
        private static string FirstCjkChar(string s)
        {
            foreach (char c in s) if (IsCjk(c)) return c.ToString();
            return null;
        }

        /// <summary>把一行 (word, phonetic, meaning) 拼成 JSON 片段。</summary>
        private static string Item(SQLiteDataReader r)
        {
            return "{\"word\":" + Json(r.GetString(0))
                + ",\"phonetic\":" + Json(r.GetString(1))
                + ",\"meaning\":" + Json(r.GetString(2)) + "}";
        }

        /// <summary>极简 JSON 字符串转义，避免引入额外依赖。</summary>
        private static string Json(string s)
        {
            if (string.IsNullOrEmpty(s)) return "\"\"";
            var sb = new StringBuilder(s.Length + 2);
            sb.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < ' ') sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
            return sb.ToString();
        }
    }
}
