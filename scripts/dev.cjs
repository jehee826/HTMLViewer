const { spawn } = require("node:child_process");

async function start() {
  const { createServer } = await import("vite");
  const server = await createServer();
  await server.listen();
  const env = { ...process.env, HTMLVIEWER_DEV_URL: "http://127.0.0.1:5173" };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require("electron"), ["."], { stdio: "inherit", env });
  child.on("exit", async (code) => {
    await server.close();
    process.exitCode = code ?? 0;
  });
  child.on("error", async (error) => {
    console.error(error);
    await server.close();
    process.exitCode = 1;
  });
  process.on("SIGINT", () => child.kill());
  process.on("SIGTERM", () => child.kill());
}

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
