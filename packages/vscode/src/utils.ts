/**
 * Extracts the modifier from the chat command field.
 * @rev/fast → 'fast', @rev/deep → 'deep', undefined → 'default'
 */
export function parseModifierFromCommand(command?: string): string {
  if (!command) return 'default';
  return command.trim() || 'default';
}
