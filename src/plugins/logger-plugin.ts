import { Plugin } from "./types";

export class LoggerPlugin implements Plugin {
  public readonly name = "logger";

  public onConnect(): void {
    // eslint-disable-next-line no-console
    console.log("[connect]");
  }

  public onAuth(): void {
    // eslint-disable-next-line no-console
    console.log("[auth]");
  }
}
