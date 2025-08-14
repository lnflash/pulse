import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { UsernameService } from './username.service';
import { FlashApiService } from '../flash-api.service';

describe('UsernameService', () => {
  let service: UsernameService;
  let flashApiService: jest.Mocked<FlashApiService>;

  const authToken = 'auth-token-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsernameService,
        {
          provide: FlashApiService,
          useValue: {
            executeQuery: jest.fn()
          }
        }
      ],
    }).compile();

    service = module.get<UsernameService>(UsernameService);
    flashApiService = module.get(FlashApiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUsername', () => {
    it('should return username when available', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({
        me: {
          username: 'testuser'
        }
      });

      // Act
      const result = await service.getUsername(authToken);

      // Assert
      expect(result).toBe('testuser');
      expect(flashApiService.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('me {'),
        {},
        authToken
      );
    });

    it('should return null when username not set', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({
        me: {
          username: null
        }
      });

      // Act
      const result = await service.getUsername(authToken);

      // Assert
      expect(result).toBeNull();
    });

    it('should throw BadRequestException on API error', async () => {
      // Arrange
      flashApiService.executeQuery.mockRejectedValue(new Error('API error'));

      // Act & Assert
      await expect(service.getUsername(authToken)).rejects.toThrow(BadRequestException);
      await expect(service.getUsername(authToken)).rejects.toThrow('Failed to retrieve username');
    });

    it('should handle network errors', async () => {
      // Arrange
      flashApiService.executeQuery.mockRejectedValue(new Error('Network timeout'));

      // Act & Assert
      await expect(service.getUsername(authToken)).rejects.toThrow(BadRequestException);
    });
  });

  describe('setUsername', () => {
    it('should successfully set username', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({
        userUpdateUsername: {
          user: {
            id: 'user123',
            username: 'newusername'
          }
        }
      });

      // Act & Assert - Should not throw
      await expect(service.setUsername('newusername', authToken)).resolves.toBeUndefined();
      expect(flashApiService.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('userUpdateUsername'),
        { input: { username: 'newusername' } },
        authToken
      );
    });

    it('should throw error when username is taken', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({
        userUpdateUsername: {
          errors: [{ code: 'ADDRESS_UNAVAILABLE' }]
        }
      });

      // Act & Assert
      await expect(service.setUsername('takenusername', authToken)).rejects.toThrow(
        'This username is already taken. Please choose another one.'
      );
    });

    it('should handle other error codes', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({
        userUpdateUsername: {
          errors: [{ code: 'INVALID_USERNAME' }]
        }
      });

      // Act & Assert
      await expect(service.setUsername('invalid!', authToken)).rejects.toThrow(
        'Failed to set username: INVALID_USERNAME'
      );
    });

    it('should handle API errors gracefully', async () => {
      // Arrange
      flashApiService.executeQuery.mockRejectedValue(new Error('Network error'));

      // Act & Assert
      await expect(service.setUsername('username', authToken)).rejects.toThrow(
        'Failed to set username. Please try again later.'
      );
    });

    it('should re-throw BadRequestException with original message', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({
        userUpdateUsername: {
          errors: [{ code: 'ADDRESS_UNAVAILABLE' }]
        }
      });

      // Act & Assert
      await expect(service.setUsername('taken', authToken)).rejects.toThrow(BadRequestException);
      await expect(service.setUsername('taken', authToken)).rejects.toThrow(
        'This username is already taken'
      );
    });
  });

  describe('Username Validation', () => {
    it('should handle empty username', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({
        userUpdateUsername: {
          errors: [{ code: 'INVALID_USERNAME' }]
        }
      });

      // Act & Assert
      await expect(service.setUsername('', authToken)).rejects.toThrow(BadRequestException);
    });

    it('should handle very long usernames', async () => {
      // Arrange
      const longUsername = 'a'.repeat(100);
      flashApiService.executeQuery.mockResolvedValue({
        userUpdateUsername: {
          user: {
            id: 'user123',
            username: longUsername
          }
        }
      });

      // Act & Assert
      await expect(service.setUsername(longUsername, authToken)).resolves.toBeUndefined();
    });

    it('should handle usernames with special characters', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({
        userUpdateUsername: {
          user: {
            id: 'user123',
            username: 'user_123-test'
          }
        }
      });

      // Act & Assert
      await expect(service.setUsername('user_123-test', authToken)).resolves.toBeUndefined();
    });

    it('should handle usernames with numbers', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({
        userUpdateUsername: {
          user: {
            id: 'user123',
            username: 'user123'
          }
        }
      });

      // Act & Assert
      await expect(service.setUsername('user123', authToken)).resolves.toBeUndefined();
    });

    it('should handle uppercase usernames', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({
        userUpdateUsername: {
          user: {
            id: 'user123',
            username: 'USERNAME'
          }
        }
      });

      // Act & Assert
      await expect(service.setUsername('USERNAME', authToken)).resolves.toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle null auth token', async () => {
      // Arrange
      flashApiService.executeQuery.mockRejectedValue(new Error('Unauthorized'));

      // Act & Assert
      await expect(service.getUsername(null as any)).rejects.toThrow(BadRequestException);
    });

    it('should handle undefined auth token', async () => {
      // Arrange
      flashApiService.executeQuery.mockRejectedValue(new Error('Unauthorized'));

      // Act & Assert
      await expect(service.getUsername(undefined as any)).rejects.toThrow(BadRequestException);
    });

    it('should handle malformed API response for getUsername', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({});

      // Act & Assert
      await expect(service.getUsername(authToken)).rejects.toThrow();
    });

    it('should handle malformed API response for setUsername', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({});

      // Act & Assert
      await expect(service.setUsername('username', authToken)).rejects.toThrow();
    });

    it('should handle multiple errors in response', async () => {
      // Arrange
      flashApiService.executeQuery.mockResolvedValue({
        userUpdateUsername: {
          errors: [
            { code: 'ERROR1' },
            { code: 'ERROR2' }
          ]
        }
      });

      // Act & Assert - Should use first error
      await expect(service.setUsername('username', authToken)).rejects.toThrow(
        'Failed to set username: ERROR1'
      );
    });

    it('should handle concurrent username setting', async () => {
      // Arrange
      let callCount = 0;
      flashApiService.executeQuery.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            userUpdateUsername: {
              user: { id: 'user123', username: 'username1' }
            }
          };
        } else {
          return {
            userUpdateUsername: {
              errors: [{ code: 'ADDRESS_UNAVAILABLE' }]
            }
          };
        }
      });

      // Act
      const results = await Promise.allSettled([
        service.setUsername('username1', authToken),
        service.setUsername('username1', authToken)
      ]);

      // Assert - One should succeed, one should fail
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    });
  });
});