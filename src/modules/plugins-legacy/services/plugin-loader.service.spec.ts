import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PluginLoaderService } from './plugin-loader.service';
import {
  PulsePlugin,
  CommandDefinition,
  ParsedCommand,
  CommandContext,
  PluginResponse,
} from '../interfaces/plugin.interface';

// Mock plugin for testing
class TestPlugin implements PulsePlugin {
  id = 'test-plugin';
  name = 'Test Plugin';
  description = 'A test plugin';
  version = '1.0.0';

  commands: CommandDefinition[] = [
    {
      trigger: 'test',
      description: 'Test command',
      patterns: [/test me/i],
    },
  ];

  async onLoad(): Promise<void> {
    // Mock implementation
  }

  async onUnload(): Promise<void> {
    // Mock implementation
  }

  async handleCommand(command: ParsedCommand, context: CommandContext): Promise<PluginResponse> {
    return {
      text: 'Test response',
    };
  }
}

describe('PluginLoaderService', () => {
  let service: PluginLoaderService;
  let eventEmitter: EventEmitter2;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PluginLoaderService,
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PluginLoaderService>(PluginLoaderService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('loadPlugin', () => {
    it('should load a plugin successfully', async () => {
      const testPlugin = new TestPlugin();
      const onLoadSpy = jest.spyOn(testPlugin, 'onLoad');

      await service.loadPlugin(testPlugin);

      expect(onLoadSpy).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith('plugin.loaded', {
        pluginId: 'test-plugin',
      });
    });

    it('should not load the same plugin twice', async () => {
      const testPlugin = new TestPlugin();

      await service.loadPlugin(testPlugin);
      await service.loadPlugin(testPlugin);

      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
    });
  });

  describe('executeCommand', () => {
    it('should execute a command on the correct plugin', async () => {
      const testPlugin = new TestPlugin();
      const handleCommandSpy = jest.spyOn(testPlugin, 'handleCommand');

      await service.loadPlugin(testPlugin);

      const context: CommandContext = {
        userId: 'user123',
        phoneNumber: '+1234567890',
        isAuthenticated: true,
        isGroup: false,
      };

      const response = await service.executeCommand('test', context);

      expect(handleCommandSpy).toHaveBeenCalled();
      expect(response).toEqual({ text: 'Test response' });
    });

    it('should match patterns for natural language', async () => {
      const testPlugin = new TestPlugin();
      await service.loadPlugin(testPlugin);

      const context: CommandContext = {
        userId: 'user123',
        phoneNumber: '+1234567890',
        isAuthenticated: true,
        isGroup: false,
      };

      const response = await service.executeCommand('test me', context);

      expect(response).toEqual({ text: 'Test response' });
    });

    it('should return null for unknown commands', async () => {
      const context: CommandContext = {
        userId: 'user123',
        phoneNumber: '+1234567890',
        isAuthenticated: true,
        isGroup: false,
      };

      const response = await service.executeCommand('unknown', context);

      expect(response).toBeNull();
    });
  });

  describe('unloadPlugin', () => {
    it('should unload a plugin successfully', async () => {
      const testPlugin = new TestPlugin();
      const onUnloadSpy = jest.spyOn(testPlugin, 'onUnload');

      await service.loadPlugin(testPlugin);
      await service.unloadPlugin('test-plugin');

      expect(onUnloadSpy).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith('plugin.unloaded', {
        pluginId: 'test-plugin',
      });
    });
  });

  describe('getLoadedPlugins', () => {
    it('should return all loaded plugins', async () => {
      const testPlugin1 = new TestPlugin();
      const testPlugin2 = new TestPlugin();
      testPlugin2.id = 'test-plugin-2';

      await service.loadPlugin(testPlugin1);
      await service.loadPlugin(testPlugin2);

      const plugins = service.getLoadedPlugins();

      expect(plugins).toHaveLength(2);
      expect(plugins.map((p) => p.id)).toEqual(['test-plugin', 'test-plugin-2']);
    });
  });
});
