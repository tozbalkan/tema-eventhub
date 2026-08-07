export interface LogContext {
  [key: string]: any;
}

export interface Logger {
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: any, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
}

export class StructuredJsonLogger implements Logger {
  private static instance: StructuredJsonLogger;
  private serviceName = 'stageops-platform';

  public static getInstance(): StructuredJsonLogger {
    if (!StructuredJsonLogger.instance) {
      StructuredJsonLogger.instance = new StructuredJsonLogger();
    }
    return StructuredJsonLogger.instance;
  }

  private format(level: string, message: string, error?: any, context?: LogContext): string {
    const payload: any = {
      service: this.serviceName,
      level,
      timestamp: new Date().toISOString(),
      message,
      ...context,
    };

    if (error) {
      payload.error = error instanceof Error ? { message: error.message, stack: error.stack } : error;
    }

    return JSON.stringify(payload);
  }

  public info(message: string, context?: LogContext): void {
    console.log(this.format('INFO', message, undefined, context));
  }

  public warn(message: string, context?: LogContext): void {
    console.warn(this.format('WARN', message, undefined, context));
  }

  public error(message: string, error?: any, context?: LogContext): void {
    console.error(this.format('ERROR', message, error, context));
  }

  public debug(message: string, context?: LogContext): void {
    console.debug(this.format('DEBUG', message, undefined, context));
  }
}
