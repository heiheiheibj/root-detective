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
                            Response.Write("{\"ok\":true,\"found\":true"
                                + ",\"word\":" + Json(r.GetString(0))
                                + ",\"phonetic\":" + Json(r.GetString(1))
                                + ",\"meaning\":" + Json(r.GetString(2))
                                + "}");
                            return;
                        }
                    }
                }

                // 2) 没查到时给若干建议：英文按拼写前缀搜；中文按释义模糊搜
                var items = new List<string>();
                bool hasCjk = HasCjk(word);
                using (var cmd = conn.CreateCommand())
                {
                    if (hasCjk)
                    {
                        cmd.CommandText = "SELECT word, phonetic, meaning FROM words WHERE meaning LIKE @m ORDER BY length(word) LIMIT 8";
                        cmd.Parameters.AddWithValue("@m", "%" + word + "%");
                    }
                    else
                    {
                        cmd.CommandText = "SELECT word, phonetic, meaning FROM words WHERE word_lower LIKE @p ORDER BY length(word) LIMIT 8";
                        cmd.Parameters.AddWithValue("@p", word.ToLowerInvariant() + "%");
                    }
                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read())
                        {
                            items.Add("{\"word\":" + Json(r.GetString(0))
                                + ",\"phonetic\":" + Json(r.GetString(1))
                                + ",\"meaning\":" + Json(r.GetString(2)) + "}");
                        }
                    }
                }
                Response.Write("{\"ok\":true,\"found\":false,\"word\":" + Json(word)
                    + ",\"suggestions\":[" + string.Join(",", items) + "]}");
            }
        }

        /// <summary>查询里是否含中日韩字符（据此决定按英文拼写还是中文释义检索）。</summary>
        private static bool HasCjk(string s)
        {
            foreach (char c in s)
            {
                if (c >= 0x2E80 && c <= 0x9FFF) return true;  // 中日韩统一表意文字 / 部首 / 假名等
                if (c >= 0xF900 && c <= 0xFAFF) return true;  // 兼容表意文字
                if (c >= 0xFF00 && c <= 0xFFEF) return true;  // 全角字符
            }
            return false;
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
