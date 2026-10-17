/**
 * Rules and skills are two separate stores behind one prompt-facing API: both feed the
 * system instructions, both reject bad input with `InstructionRejected`, and both are
 * written through this module by the HTTP routes and the built-in tools.
 */
export { InstructionRejected } from './instruction-support.ts';
export { addRule, readRuleRecords, readRules, removeRule, writeRuleRecords, writeRules } from './rules-store.ts';
export { readSkills, removeSkill, writeSkill, writeSkills } from './skills-store.ts';