const fs = require("node:fs");
const path = require("node:path");
const { version } = require("../package.json");
const lockfile = require("../package-lock.json");

function renderReleaseNotes(pullRequest) {
  if (pullRequest.head.ref !== version) {
    throw new Error(`버전 브랜치 ${pullRequest.head.ref}와 package.json 버전 ${version}이 다릅니다.`);
  }
  if (lockfile.version !== version || lockfile.packages[""].version !== version) {
    throw new Error(`package-lock.json의 앱 버전을 ${version}으로 맞춰 주세요.`);
  }

  const body = (pullRequest.body ?? "").replace(/<!--[\s\S]*?-->/g, "");
  const changes = body
    .split(/^#{1,2}[ \t]+/m)
    .slice(1)
    .find((section) => /^릴리즈 노트[ \t]*\r?\n/.test(section))
    ?.replace(/^릴리즈 노트[ \t]*\r?\n/, "")
    .trim();

  if (!changes) {
    throw new Error("PR 본문의 '## 릴리즈 노트'에 사용자에게 보이는 변경점을 적어 주세요.");
  }

  const template = fs.readFileSync(path.join(__dirname, "../.github/release-notes.md"), "utf8");
  const fields = { changes, version, pullRequest: pullRequest.html_url };
  return template.replace(/\{\{(changes|version|pullRequest)\}\}/g, (_, name) => fields[name]);
}

if (require.main === module) {
  try {
    const pullRequest = JSON.parse(fs.readFileSync(0, "utf8"));
    const notes = renderReleaseNotes(pullRequest);
    fs.writeFileSync(process.argv[2], notes, "utf8");
    if (process.env.GITHUB_OUTPUT) {
      const encodedNotes = Buffer.from(notes, "utf8").toString("base64");
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nnotes=${encodedNotes}\n`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
