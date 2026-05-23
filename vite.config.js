import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import https from "https";

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({ hostname: u.hostname, path: u.pathname + u.search, headers }, (res) => {
      let body = "";
      const cookies = (res.headers["set-cookie"] || []).map(c => c.split(";")[0]).join("; ");
      res.on("data", d => body += d);
      res.on("end", () => resolve({ body, cookies, status: res.statusCode }));
    }).on("error", reject);
  });
}

async function fetchYahooCrumb() {
  try {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    const init = await httpsGet("https://fc.yahoo.com/", { "User-Agent": ua });
    const crumbRes = await httpsGet("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      "User-Agent": ua,
      "Cookie": init.cookies,
    });
    const crumb = crumbRes.body.trim();
    console.log(`[yahoo] crumb ready: ${crumb.slice(0, 6)}…`);
    return { crumb, cookie: init.cookies };
  } catch (e) {
    console.warn("[yahoo] crumb fetch failed:", e.message);
    return { crumb: "", cookie: "" };
  }
}

export default defineConfig(async () => {
  const yahoo = await fetchYahooCrumb();

  return {
    plugins: [
      react(),
      {
        name: "yahoo-dev-proxy",
        configureServer(server) {
          server.middlewares.use("/api/yahoo", async (req, res) => {
            const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
            const params = new URLSearchParams(qs);
            const symbol = params.get("symbol");
            if (!symbol) { res.statusCode = 400; res.end("symbol required"); return; }
            try {
              const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
              const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y&crumb=${encodeURIComponent(yahoo.crumb)}`;
              const data = await httpsGet(url, { "User-Agent": ua, "Cookie": yahoo.cookie, "Accept": "application/json" });
              res.setHeader("Content-Type", "application/json");
              res.statusCode = 200;
              res.end(data.body);
            } catch (e) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            }
          });
        },
      },
    ],
    server: {
      open: false,
      port: 5174,
      strictPort: true,
    },
  };
});
