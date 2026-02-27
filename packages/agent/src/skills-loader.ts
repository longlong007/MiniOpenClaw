import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ─── Skills Loader ─────────────────────────────────────────────────────────────

export interface Skill {
  name: string;
  content: string;
  path: string;
}

export class SkillsLoader {
  private skillsDirs: string[];

  constructor(extraDirs?: string[]) {
    this.skillsDirs = [
      // Built-in skills bundled with the package
      join(new URL(".", import.meta.url).pathname, "..", "..", "..", "skills"),
      // User workspace skills
      join(homedir(), ".openclaw", "workspace", "skills"),
      ...(extraDirs ?? []),
    ];
  }

  load(): Skill[] {
    const skills: Skill[] = [];
    for (const dir of this.skillsDirs) {
      if (!existsSync(dir)) continue;
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const skillFile = join(dir, entry.name, "SKILL.md");
          if (!existsSync(skillFile)) continue;
          const content = readFileSync(skillFile, "utf8");
          skills.push({ name: entry.name, content, path: skillFile });
        }
      } catch {
        // ignore unreadable dirs
      }
    }
    return skills;
  }

  buildSystemPromptAppendix(skills: Skill[]): string {
    if (skills.length === 0) return "";
    const sections = skills.map((s) => `## Skill: ${s.name}\n\n${s.content}`);
    return `\n\n---\n# Available Skills\n\n${sections.join("\n\n---\n\n")}`;
  }
}
