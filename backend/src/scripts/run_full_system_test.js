const { spawn } = require("child_process");
const path = require("path");

const backendDir = path.join(__dirname, "..");
const rootBackendDir = path.join(__dirname, "../..");

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkHealth(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch (e) {
      // wait and retry
    }
    await wait(500);
  }
  return false;
}

function runScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [scriptPath], {
      cwd: rootBackendDir,
      stdio: "inherit",
    });

    proc.on("close", (code) => {
      resolve(code);
    });
    proc.on("error", (err) => {
      reject(err);
    });
  });
}

async function main() {
  console.log("=====================================================");
  console.log("🚀 STARTING CAMPUS MARKET FULL SYSTEM AUTOMATED TEST 🚀");
  console.log("=====================================================\n");

  console.log("1. Starting Backend Server on http://localhost:4000 ...");
  const serverProc = spawn(process.execPath, ["src/server.js"], {
    cwd: rootBackendDir,
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProc.stdout.on("data", (data) => {
    // optional debug
  });
  serverProc.stderr.on("data", (data) => {
    const s = data.toString();
    if (!s.includes("DeprecationWarning")) {
      console.error("[Server Error]", s);
    }
  });

  const isHealthy = await checkHealth("http://localhost:4000/api/health", 15000);
  if (!isHealthy) {
    console.error("❌ Failed to start Backend Server within 15 seconds.");
    serverProc.kill("SIGKILL");
    process.exit(1);
  }

  console.log("✅ Backend Server is running and healthy!\n");

  let exitCode = 0;
  try {
    console.log("2. Running Comprehensive End-to-End Business Flow Suite...");
    const compCode = await runScript(path.join(__dirname, "comprehensive_test.js"));
    console.log(`Finished comprehensive_test with code: ${compCode}\n`);
    if (compCode !== 0) exitCode = compCode;

    console.log("3. Running Admin Console System Suite...");
    const adminCode = await runScript(path.join(__dirname, "test_admin.js"));
    console.log(`Finished test_admin with code: ${adminCode}\n`);
    if (adminCode !== 0) exitCode = adminCode;

    console.log("4. Running Score Deduction & Recovery System Suite...");
    const scoreCode = await runScript(path.join(__dirname, "test_score_system.js"));
    console.log(`Finished test_score_system with code: ${scoreCode}\n`);
    if (scoreCode !== 0) exitCode = scoreCode;

  } catch (err) {
    console.error("❌ Exception during test execution:", err);
    exitCode = 1;
  } finally {
    console.log("Shutting down Backend Server...");
    serverProc.kill("SIGTERM");
    try {
      process.kill(serverProc.pid);
    } catch (_) {}
    console.log("Done.");
  }

  process.exit(exitCode);
}

main();
