export interface LogContext {
  [key: string]: any;
}

export interface Logger {
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: any, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
}

export class ConsoleLogger implements Logger {
  private static instance: ConsoleLogger;

  public static getInstance(): ConsoleLogger {
    if (!ConsoleLogger.instance) {
      ConsoleLogger.instance = new ConsoleLogger();
    }
    return ConsoleLogger.instance;
  }

  public info(message: string, context?: LogContext): void {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, context ? JSON.stringify(context) : '');
  }

  public warn(message: string, context?: LogContext): void {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, context ? JSON.stringify(context) : '');
  }

  public error(message: string, error?: any, context?: LogContext): void {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error ?? '', context ? JSON.stringify(context) : '');
  }

  public debug(message: string, context?: LogContext): void {
    console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, context ? JSON.stringify(context) : '');
  }
}
