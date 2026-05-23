const https = require("https");

// Cached crumb — reused across warm Lambda invocations
let _cache = { crumb: null, cookie: null, ts: 0 };

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({ hostname: u.hostname, path: u.pathname + u.search, headers }, (res) => {
      let body = "";
      const cookies = (res.headers["set-cookie"] || []).map(c => c.split(";")[0]).join("; ");
      res.on("data", d => body += d);
      res.on("end", () => resolve({ body, cookies }));
    }).on("error", reject);
  });
}

async function getCrumb() {
  if (_cache.crumb && Date.now() - _cache.ts < 3_600_000) return _cache;
  const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  const init = await httpsGet("https://fc.yahoo.com/", { "User-Agent": ua });
  const cr = await httpsGet("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    "User-Agent": ua, "Cookie": init.cookies,
  });
  _cache = { crumb: cr.body.trim(), cookie: init.cookies, ts: Date.now() };
  return _cache;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const symbol = (req.query || {}).symbol;
  if (!symbol) return res.status(400).json({ error: "symbol required" });

  try {
    const { crumb, cookie } = await getCrumb();
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y&crumb=${encodeURIComponent(crumb)}`;
    const data = await httpsGet(url, { "User-Agent": ua, "Cookie": cookie, "Accept": "application/json" });

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    res.status(200).send(data.body);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
