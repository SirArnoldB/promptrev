import * as vscode from 'vscode';
import type { ModelAdapter } from '@promptrev/core';

export class VSCodeModelAdapter implements ModelAdapter {
  constructor(
    private readonly model: vscode.LanguageModelChat,
    private readonly token: vscode.CancellationToken
  ) {}

  async complete(
    systemPrompt: string,
    userMessage: string,
    _signal?: AbortSignal
  ): Promise<string> {
    const messages = [
      vscode.LanguageModelChatMessage.User(
        `${systemPrompt}\n\n---\n\nPrompt to enhance:\n${userMessage}`
      ),
    ];

    const response = await this.model.sendRequest(messages, {}, this.token);

    let result = '';
    for await (const chunk of response.text) {
      result += chunk;
    }
    return result.trim();
  }
}
