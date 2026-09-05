const DEFAULT_SUPABASE_URL = "https://kzengnggyagfaphzgqgt.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_UDaI0zbpdoG019uRLEyMCA_ID1lYUvD";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, "").split("=");
    return [key, value.join("=") || "true"];
  })
);

const targetUrl = args.get("url") || "";
const users = Number(args.get("users") || 100);
const rampMs = Number(args.get("ramp-ms") || 0);
const timeoutMs = Number(args.get("timeout-ms") || 15000);
const supabaseUrl = args.get("supabase-url") || DEFAULT_SUPABASE_URL;
const supabaseKey = args.get("supabase-key") || DEFAULT_SUPABASE_KEY;
const mode = args.get("mode") || "rpc";

if (!Number.isFinite(users) || users <= 0) {
  throw new Error("--users must be a positive number");
}

function percentile(values, pct) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1);
  return sorted[index];
}

async function timedFetch(label, url, options = {}) {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const text = await response.text();
    return {
      label,
      ok: response.ok,
      status: response.status,
      bytes: new TextEncoder().encode(text).length,
      ms: performance.now() - started
    };
  } catch (error) {
    return {
      label,
      ok: false,
      status: error.name === "AbortError" ? "timeout" : "error",
      bytes: 0,
      ms: performance.now() - started,
      error: error.message
    };
  } finally {
    clearTimeout(timer);
  }
}

function supabaseHeaders() {
  return {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    "Content-Type": "application/json"
  };
}

async function runVirtualUser(index) {
  const qq = `loadtest-${Date.now()}-${index}`;
  const requests = [];

  if (targetUrl) {
    const base = targetUrl.replace(/\/$/, "");
    requests.push(timedFetch("site:index", `${base}/`));
    requests.push(timedFetch("site:css", `${base}/styles.css`));
    requests.push(timedFetch("site:js", `${base}/script.js`));
  }

  if (mode === "rpc") {
    requests.push(
      timedFetch(
        "db:homepage-rpc",
        `${supabaseUrl}/rest/v1/rpc/get_homepage_data`,
        {
          method: "POST",
          headers: supabaseHeaders(),
          body: JSON.stringify({ p_qq: qq })
        }
      )
    );

    if (rampMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.floor((rampMs / users) * index)));
    }

    return Promise.all(requests);
  }

  requests.push(
    timedFetch(
      "db:rushes",
      `${supabaseUrl}/rest/v1/rush_events?select=id,title,start_time,max_cards_per_account,admin_qq,sort_order&order=sort_order.asc`,
      { headers: supabaseHeaders() }
    )
  );
  requests.push(
    timedFetch(
      "db:cards",
      `${supabaseUrl}/rest/v1/cards?select=id,rush_id,title,price,venue,show_time,description,image_class,quota,sort_order&order=sort_order.asc`,
      { headers: supabaseHeaders() }
    )
  );
  requests.push(
    timedFetch(
      "db:counts",
      `${supabaseUrl}/rest/v1/card_claim_counts?select=card_id,claim_count`,
      { headers: supabaseHeaders() }
    )
  );
  requests.push(
    timedFetch(
      "db:my-claims",
      `${supabaseUrl}/rest/v1/claims?select=*&qq=eq.${encodeURIComponent(qq)}&order=claimed_at.desc`,
      { headers: supabaseHeaders() }
    )
  );

  if (rampMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, Math.floor((rampMs / users) * index)));
  }

  return Promise.all(requests);
}

function printSummary(results) {
  const flat = results.flat();
  const groups = new Map();
  for (const item of flat) {
    if (!groups.has(item.label)) groups.set(item.label, []);
    groups.get(item.label).push(item);
  }
  let failed = 0;

  console.log(`\nLoad test finished: ${users} virtual users, ${flat.length} requests\n`);
  console.log("label              ok/total     p50      p95      max      avg bytes");
  console.log("---------------------------------------------------------------------");

  for (const [label, items] of groups) {
    const ok = items.filter((item) => item.ok).length;
    failed += items.length - ok;
    const times = items.map((item) => item.ms);
    const avgBytes = Math.round(items.reduce((sum, item) => sum + item.bytes, 0) / items.length);
    console.log(
      `${label.padEnd(18)} ${String(ok).padStart(3)}/${String(items.length).padEnd(5)} ` +
      `${String(Math.round(percentile(times, 50))).padStart(6)}ms ` +
      `${String(Math.round(percentile(times, 95))).padStart(7)}ms ` +
      `${String(Math.round(Math.max(...times))).padStart(7)}ms ` +
      `${String(avgBytes).padStart(10)}`
    );
  }

  if (failed > 0) {
    console.log("\nFailures:");
    flat
      .filter((item) => !item.ok)
      .slice(0, 20)
      .forEach((item) => {
        console.log(`- ${item.label}: ${item.status}${item.error ? `, ${item.error}` : ""}`);
      });
  }

  console.log(`\nTotal failed requests: ${failed}`);
}

const started = performance.now();
const results = await Promise.all(Array.from({ length: users }, (_, index) => runVirtualUser(index)));
printSummary(results);
console.log(`Elapsed: ${Math.round(performance.now() - started)}ms`);
