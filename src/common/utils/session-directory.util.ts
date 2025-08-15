import { promises as fs } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';

export class SessionDirectoryUtil {
  private static readonly logger = new Logger('SessionDirectoryUtil');

  /**
   * Ensure WhatsApp session directory exists with proper permissions
   */
  static async ensureSessionDirectory(phoneNumber: string, basePath: string): Promise<string> {
    const sessionPath = join(basePath, phoneNumber);
    const chromePath = join(sessionPath, 'chrome-profile');

    try {
      // Create main session directory
      await fs.mkdir(sessionPath, { recursive: true, mode: 0o755 });
      
      // Create Chrome profile directory
      await fs.mkdir(chromePath, { recursive: true, mode: 0o755 });
      
      // Try to remove any existing SingletonLock file
      const lockFile = join(chromePath, 'SingletonLock');
      try {
        await fs.unlink(lockFile);
        this.logger.debug(`Removed existing SingletonLock for ${phoneNumber}`);
      } catch (error) {
        // File doesn't exist, which is fine
      }

      // Create required Chrome subdirectories
      const chromeSubDirs = [
        'Default',
        'Crash Reports',
        'ShaderCache'
      ];

      for (const subDir of chromeSubDirs) {
        const subDirPath = join(chromePath, subDir);
        try {
          await fs.mkdir(subDirPath, { recursive: true, mode: 0o755 });
        } catch (error) {
          // Directory might already exist
        }
      }

      // Set permissions recursively (best effort)
      try {
        await this.setPermissionsRecursive(sessionPath, 0o755);
      } catch (error) {
        this.logger.warn(`Could not set permissions for ${sessionPath}: ${error.message}`);
      }

      this.logger.log(`Session directory ready for ${phoneNumber}: ${sessionPath}`);
      return sessionPath;

    } catch (error) {
      this.logger.error(`Failed to create session directory for ${phoneNumber}:`, error);
      throw new Error(`Cannot create session directory: ${error.message}`);
    }
  }

  /**
   * Clean up session directory
   */
  static async cleanupSessionDirectory(phoneNumber: string, basePath: string): Promise<void> {
    const sessionPath = join(basePath, phoneNumber);
    
    try {
      // Remove Chrome SingletonLock if it exists
      const lockFile = join(sessionPath, 'chrome-profile', 'SingletonLock');
      try {
        await fs.unlink(lockFile);
        this.logger.debug(`Removed SingletonLock for ${phoneNumber}`);
      } catch (error) {
        // File doesn't exist
      }

      // Clean up temp files
      const tempPatterns = ['*.tmp', '*.lock', 'CrashpadMetrics-*.pma'];
      for (const pattern of tempPatterns) {
        await this.cleanupPattern(sessionPath, pattern);
      }

      this.logger.log(`Cleaned up session directory for ${phoneNumber}`);
    } catch (error) {
      this.logger.warn(`Error cleaning up session for ${phoneNumber}:`, error);
    }
  }

  /**
   * Check if session directory is writable
   */
  static async isWritable(path: string): Promise<boolean> {
    try {
      await fs.access(path, fs.constants.W_OK);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get session directory stats
   */
  static async getSessionStats(phoneNumber: string, basePath: string): Promise<any> {
    const sessionPath = join(basePath, phoneNumber);
    
    try {
      const stats = await fs.stat(sessionPath);
      const chromeProfilePath = join(sessionPath, 'chrome-profile');
      const chromeStats = await fs.stat(chromeProfilePath).catch(() => null);
      
      return {
        exists: true,
        path: sessionPath,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        permissions: `0${(stats.mode & parseInt('777', 8)).toString(8)}`,
        isWritable: await this.isWritable(sessionPath),
        chromeProfile: chromeStats ? {
          exists: true,
          size: chromeStats.size,
          permissions: `0${(chromeStats.mode & parseInt('777', 8)).toString(8)}`,
          isWritable: await this.isWritable(chromeProfilePath)
        } : { exists: false }
      };
    } catch (error) {
      return {
        exists: false,
        path: sessionPath,
        error: error.message
      };
    }
  }

  /**
   * Set permissions recursively
   */
  private static async setPermissionsRecursive(dirPath: string, mode: number): Promise<void> {
    try {
      await fs.chmod(dirPath, mode);
      
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          await this.setPermissionsRecursive(fullPath, mode);
        } else {
          await fs.chmod(fullPath, mode);
        }
      }
    } catch (error) {
      // Best effort - don't fail if we can't set permissions
      this.logger.debug(`Could not set permissions for ${dirPath}: ${error.message}`);
    }
  }

  /**
   * Clean up files matching a pattern
   */
  private static async cleanupPattern(dirPath: string, pattern: string): Promise<void> {
    try {
      const files = await fs.readdir(dirPath);
      const regex = new RegExp(pattern.replace('*', '.*'));
      
      for (const file of files) {
        if (regex.test(file)) {
          const filePath = join(dirPath, file);
          try {
            await fs.unlink(filePath);
            this.logger.debug(`Removed temp file: ${file}`);
          } catch (error) {
            // Ignore errors
          }
        }
      }
    } catch (error) {
      // Directory might not exist
    }
  }
}