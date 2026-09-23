using System;
using System.IO;
using System.Text;
using System.Web;
using System.Web.UI;

namespace RootDetective
{
    /// <summary>
    /// 提建议接口：POST content=xxx（兼容 GET ?content=xxx）→ 把时间、内容、IP 追加进 ~/App_Data/suggestions.md。
    /// 与 Dict.aspx 一样用「网站(Website)」模型，IIS 即时编译，无需先 build。
    /// 与 Python 版 server.py 共用同一个 suggestions.md 文件，落盘格式一致。
    /// </summary>
    public partial class Suggest : Page
    {
        // 并发写同一文件时加锁，避免条目交错把 MD 写花。
        private static readonly object _lock = new object();

        protected void Page_Load(object sender, EventArgs e)
        {
            Response.ContentType = "application/json";
            Response.ContentEncoding = Encoding.UTF8;
            Response.Charset = "utf-8";
            // 前端可能是别的域名（静态站），允许跨域调用
            Response.AddHeader("Access-Control-Allow-Origin", "*");

            string content = (Request.Form["content"] ?? Request.QueryString["content"] ?? "").Trim();
            if (content.Length == 0)
            {
                Response.Write("{\"ok\":false,\"error\":\"内容为空\"}");
                return;
            }

            // 真实访客 IP：走反向代理时取 X-Forwarded-For 的第一个，否则取直连地址。
            string ip = Request.Headers["X-Forwarded-For"];
            if (string.IsNullOrEmpty(ip)) ip = Request.UserHostAddress;
            else ip = ip.Split(',')[0].Trim();

            string ts = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
            // 用 ~~~ 代码围栏包住内容，避免正文里的 #、* 被当成 Markdown；
            // 若正文本身含 ~~~ 退化为 ~~，防止栅栏提前闭合。
            string safe = content.Replace("~~~", "~~");
            string block = "## " + ts + " · IP " + ip + "\n\n~~~\n" + safe + "\n~~~\n\n---\n\n";

            string file = Server.MapPath("~/App_Data/suggestions.md");
            lock (_lock)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(file));
                File.AppendAllText(file, block, Encoding.UTF8);
            }
            Response.Write("{\"ok\":true}");
        }
    }
}
