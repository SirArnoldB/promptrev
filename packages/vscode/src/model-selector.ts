import * as vscode from 'vscode';

/**
 * Selects the best available language model.
 * Priority: Copilot → any other vendor → null
 */
export async function selectModel(): Promise<vscode.LanguageModelChat | null> {
  // 1. Try Copilot first (most common setup)
  const copilot = await vscode.lm.selectChatModels({ vendor: 'copilot' });
  if (copilot.length > 0) return copilot[0];

  // 2. Fall back to any available vendor (Claude extension, Gemini, etc.)
  const all = await vscode.lm.selectChatModels({});
  if (all.length > 0) return all[0];

  return null;
}

/**
 * Shows a warning notification when no model is available and the modifier requires one.
 * Returns true if the caller should abort (no model + modifier needs LLM).
 */
export async function handleNoModel(modifier: string): Promise<boolean> {
  if (modifier === 'rb') return false; // rb is rule-based, no model needed

  const action = await vscode.window.showWarningMessage(
    'PromptRev: No language model available. Activate GitHub Copilot or configure an API key.',
    'Open Settings'
  );

  if (action === 'Open Settings') {
    vscode.commands.executeCommand('workbench.action.openSettings', 'promptrev');
  }

  return true; // caller should abort
}
