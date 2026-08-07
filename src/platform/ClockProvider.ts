export class ClockProvider {
  private static fixedTime: string | null = null;

  public static setFixedTime(isoString: string | null): void {
    ClockProvider.fixedTime = isoString;
  }

  public static now(): Date {
    if (ClockProvider.fixedTime) {
      return new Date(ClockProvider.fixedTime);
    }
    return new Date();
  }

  public static nowISO(): string {
    return ClockProvider.now().toISOString();
  }
}
