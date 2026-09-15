const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = process.cwd();
const context = { window: {} };
vm.runInNewContext(fs.readFileSync("experience-data.js", "utf8"), context);

function read(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function stripTitle(value) {
  return String(value || "")
    .replace(/^#\s*/, "")
    .replace(/\\([&|])/g, "$1")
    .trim();
}

function contentLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function projectFromMd(filePath) {
  const fileLines = contentLines(read(filePath));
  return {
    title: stripTitle(fileLines[0] || ""),
    description: fileLines.slice(1).join(" ")
  };
}

for (const node of context.window.experienceNodes || []) {
  const directory = path.join(root, "content", "experiences", node.id);
  if (!fs.existsSync(directory)) continue;

  const titleLines = contentLines(read(path.join(directory, "title.md"))).map(stripTitle);
  const company = titleLines[0] || node.company || "";
  const role = titleLines[1] || node.role || "";
  let year = node.year || "";
  let location = node.location || "";

  if (titleLines[2]) {
    const parts = titleLines[2].split("·").map((part) => part.trim()).filter(Boolean);
    if (parts[0]) year = parts[0];
    if (parts[1]) location = parts.slice(1).join(" · ");
  }

  const responsibility = read(path.join(directory, "responsibility.md"))
    .replace(/^#\s*My role\s*/i, "")
    .trim() || node.summary || "";

  const projectsDirectory = path.join(directory, "projects");
  const projectFiles = fs.existsSync(projectsDirectory)
    ? fs.readdirSync(projectsDirectory)
      .filter((file) => file.toLowerCase().endsWith(".md") && file.toLowerCase() !== "readme.md")
      .sort()
    : [];

  const projectBlocks = projectFiles.map((file) => {
    const key = file.replace(/\.md$/i, "");
    const project = projectFromMd(path.join(projectsDirectory, file));
    return [
      `### ${key}`,
      "",
      `Title: ${project.title || key}`,
      "",
      `Description: ${project.description || "Project details to come."}`
    ].join("\n");
  });

  const output = [
    `# ${company}`,
    "",
    `Role: ${role}`,
    `Year: ${year}`,
    `Location: ${location}`,
    `Preview: ${node.preview || ""}`,
    `Tags: ${(node.tags || []).join(", ")}`,
    "",
    "## Summary",
    "",
    node.summary || "",
    "",
    "## My role",
    "",
    responsibility,
    "",
    "## Projects",
    "",
    projectBlocks.join("\n\n")
  ].join("\n").replace(/[ \t]+\n/g, "\n").trim() + "\n";

  fs.writeFileSync(path.join(directory, "content.md"), output, "utf8");
}
