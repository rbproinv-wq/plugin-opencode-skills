export interface TuiClient {
  tui: {
    showToast(input: {
      message: string;
      variant?: "info" | "success" | "warning" | "error";
      title?: string;
      duration?: number;
    }): Promise<void>;
  };
}

export class Notifier {
  constructor(private client: TuiClient) {}

  async info(message: string): Promise<void> {
    await this.client.tui.showToast({ message, variant: "info" });
  }

  async success(message: string): Promise<void> {
    await this.client.tui.showToast({ message, variant: "success" });
  }

  async warning(message: string): Promise<void> {
    await this.client.tui.showToast({ message, variant: "warning" });
  }

  async error(message: string): Promise<void> {
    await this.client.tui.showToast({ message, variant: "error", duration: 8000 });
  }

  async skillStart(skillName: string): Promise<void> {
    await this.client.tui.showToast({
      message: `\uD83D\uDD0D Buscando: ${skillName}`,
      variant: "info"
    });
  }

  async skillActive(skillName: string, matchedBy: string): Promise<void> {
    await this.client.tui.showToast({
      message: `\uD83E\uDDE0 Skill ativa: ${skillName} (${matchedBy})`,
      variant: "success",
      duration: 5000
    });
  }

  async skillComplete(skillName: string): Promise<void> {
    await this.client.tui.showToast({
      message: `\u2705 Skill conclu\u00EDda: ${skillName}`,
      variant: "success"
    });
  }

  async skillError(skillName: string, error: string): Promise<void> {
    await this.client.tui.showToast({
      message: `\u274C Erro em ${skillName}: ${error}`,
      variant: "error",
      duration: 8000
    });
  }
}
