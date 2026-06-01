export type ChatStatus = "running" | "stopped";

export enum ActionExecutionType {
  Code = "code",
  LLM = "llm",
}

export interface RunningAction {
  actionId: number;
  actionName: string;
  chatQuestionRunnedId: number;
  currentQuestionId: number;
  invalidAttempts: number;
}

export class Chat {
  readonly number: string;
  status: ChatStatus;
  readonly startedAt: Date;
  readonly chatRunnedId: number | null;
  currentRunningAction: RunningAction | null = null;

  constructor(
    number: string,
    status: ChatStatus = "running",
    chatRunnedId: number | null = null
  ) {
    this.number = number;
    this.status = status;
    this.startedAt = new Date();
    this.chatRunnedId = chatRunnedId;
  }

  isRunning(): boolean {
    return this.status === "running";
  }

  stop(): void {
    this.status = "stopped";
    this.currentRunningAction = null;
  }

  start(): void {
    this.status = "running";
  }

  setRunningAction(action: RunningAction | null): void {
    this.currentRunningAction = action;
  }

  static GetMessageReturn(
    chat: Chat,
    text: string,
    context?: { lastActionName?: string; suggestions?: string[] }
  ): string {
    return `You said: ${text}`;
  }
}
