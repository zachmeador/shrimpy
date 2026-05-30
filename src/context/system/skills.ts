export interface AvailableSkillView {
  id: string;
  description: string;
  scope: "agent" | "workspace";
}

export function renderAvailableSkillsPrompt(skills: AvailableSkillView[]): string {
  const visibleSkills = skills.filter((skill) => skill.description.trim() !== "");
  if (visibleSkills.length === 0) return "";

  const lines = [
    "## Available Skills",
    "",
  ];
  for (const skill of visibleSkills) {
    lines.push(
      `- \`${skill.id}\` (${skill.scope}): ${truncateSkillDescription(skill.description)}`,
    );
  }
  return lines.join("\n");
}

function truncateSkillDescription(value: string, maxChars = 220): string {
  const compact = value.replaceAll(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars - 3).trimEnd()}...`;
}
