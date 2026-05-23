export const config = { runtime: "edge" };

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function getCrumb() {
  const initRes = await fetch("https://fc.yahoo.com/", {
    headers: { "User-Agent": UA },
    redirect: "follow",
  });
  const rawCookies = initRes.headers.get("set-cookie") || "";
  const cookie = rawCookies.split(",").map(c => c.split(";")[0].trim()).join("; ");

  const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, "Cookie": cookie },
  });
  const crumb = await crumbRes.text();
  return { crumb: crumb.trim(), cookie };
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) return new Response("symbol required", { status: 400 });

  try {
    const { crumb, cookie } = await getCrumb();
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y&crumb=${encodeURIComponent(crumb)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Cookie": cookie, "Accept": "application/json" },
    });
    const data = await res.text();

    return new Response(data, {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
}
