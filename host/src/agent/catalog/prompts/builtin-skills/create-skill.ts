export const CREATE_SKILL_INSTRUCTION =
  'Create a reusable Xeck skill from the user brief below. ' +
  'Infer a concise skill name, a clear one-line description, and a self-contained skill body. ' +
  'Use the built-in write_skill tool to save it, unless the user brief is insufficient; do not ask a follow-up question for ordinary omissions. ' +
  'Do not create a skill for a one-off task. User brief:';
export const CREATE_SKILL_COMMAND = 'create-skill';
