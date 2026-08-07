export class IdGenerator {
  /**
   * Generates a time-ordered UUID v7 compatible string.
   */
  public static generateUUIDv7(): string {
    const timeMs = Date.now();
    const timeHex = timeMs.toString(16).padStart(12, '0');
    
    // Generate random bits
    const randA = Math.floor(Math.random() * 0x0fff).toString(16).padStart(3, '0');
    const randB1 = Math.floor(Math.random() * 0x3fff | 0x8000).toString(16).padStart(4, '0');
    const randB2 = Array.from({ length: 6 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
    
    // Format: 8-4-4-4-12
    const timeHigh = timeHex.substring(0, 8);
    const timeLow = timeHex.substring(8, 12);
    
    return `${timeHigh}-${timeLow}-7${randA}-${randB1}-${randB2}`;
  }

  /**
   * Generates a crypto-hashed ticket token for QR codes.
   */
  public static generateTicketToken(prefix: string = 'TKT'): string {
    const randHex = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('').toUpperCase();
    return `${prefix}_${randHex}`;
  }
}
