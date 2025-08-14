#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';

interface TestTemplate {
  filePath: string;
  className: string;
  methods: string[];
}

class TestTemplateGenerator {
  generateTemplate(sourceFilePath: string): string {
    const content = fs.readFileSync(sourceFilePath, 'utf-8');
    const fileName = path.basename(sourceFilePath, '.ts');
    const className = this.extractClassName(content) || this.toClassName(fileName);
    const methods = this.extractMethods(content);
    const imports = this.extractImports(content);
    
    return this.buildTestTemplate(className, fileName, methods, imports, sourceFilePath);
  }

  private extractClassName(content: string): string | null {
    const match = content.match(/@Injectable\(\)[\s\n]*export\s+class\s+(\w+)/);
    return match ? match[1] : null;
  }

  private toClassName(fileName: string): string {
    return fileName
      .split(/[-.]/)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }

  private extractMethods(content: string): string[] {
    const methods: string[] = [];
    const methodPattern = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*{/g;
    let match;
    
    while ((match = methodPattern.exec(content)) !== null) {
      const methodName = match[1];
      if (!methodName.startsWith('constructor') && 
          !methodName.startsWith('get') && 
          !methodName.startsWith('set') &&
          !methodName.startsWith('private')) {
        methods.push(methodName);
      }
    }
    
    return [...new Set(methods)];
  }

  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const importPattern = /import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = importPattern.exec(content)) !== null) {
      imports.push(match[0]);
    }
    
    return imports;
  }

  private buildTestTemplate(
    className: string,
    fileName: string,
    methods: string[],
    imports: string[],
    sourceFilePath: string
  ): string {
    const relativePath = sourceFilePath.replace(/\.ts$/, '').replace('src/', '');
    
    let template = `import { Test, TestingModule } from '@nestjs/testing';
import { ${className} } from './${fileName}';

describe('${className}', () => {
  let service: ${className};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ${className},
        // Add mock providers here
      ],
    }).compile();

    service = module.get<${className}>(${className});
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
`;

    // Add test stubs for each method
    methods.forEach(method => {
      template += `
  describe('${method}', () => {
    it('should ${this.generateTestDescription(method)}', async () => {
      // Arrange
      // TODO: Set up test data

      // Act
      // const result = await service.${method}();

      // Assert
      // expect(result).toBeDefined();
    });

    it('should handle errors in ${method}', async () => {
      // Arrange
      // TODO: Set up error condition

      // Act & Assert
      // await expect(service.${method}()).rejects.toThrow();
    });
  });
`;
    });

    template += '});\n';
    
    return template;
  }

  private generateTestDescription(methodName: string): string {
    // Convert camelCase to sentence
    const words = methodName.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
    
    if (methodName.startsWith('get')) {
      return `return ${words.replace('get ', '')}`;
    } else if (methodName.startsWith('create')) {
      return `create a new ${words.replace('create ', '')}`;
    } else if (methodName.startsWith('update')) {
      return `update ${words.replace('update ', '')}`;
    } else if (methodName.startsWith('delete')) {
      return `delete ${words.replace('delete ', '')}`;
    } else if (methodName.startsWith('handle')) {
      return `handle ${words.replace('handle ', '')}`;
    } else if (methodName.startsWith('process')) {
      return `process ${words.replace('process ', '')}`;
    } else {
      return words;
    }
  }
}

// Generate tests for high-priority files
const priorityFiles = [
  'src/modules/dialect-ai/services/conversation-manager.service.ts',
  'src/modules/dialect-ai/services/enhanced-payment-flow.service.ts',
  'src/modules/messaging/services/messaging-orchestrator.service.ts',
  'src/modules/messaging/handlers/command-message.handler.ts',
  'src/modules/common/services/metrics.service.ts',
  'src/modules/flash-api/services/balance.service.ts',
  'src/modules/flash-api/services/invoice.service.ts',
  'src/modules/flash-api/services/transaction.service.ts',
  'src/modules/flash-api/services/user.service.ts',
  'src/modules/flash-api/services/username.service.ts'
];

const generator = new TestTemplateGenerator();

console.log('🧪 Generating test templates for priority files...\n');

priorityFiles.forEach(filePath => {
  if (fs.existsSync(filePath)) {
    const testPath = filePath.replace(/\.ts$/, '.spec.ts');
    
    if (!fs.existsSync(testPath)) {
      const template = generator.generateTemplate(filePath);
      fs.writeFileSync(testPath, template);
      console.log(`✅ Generated: ${testPath}`);
    } else {
      console.log(`⚠️  Test already exists: ${testPath}`);
    }
  } else {
    console.log(`❌ File not found: ${filePath}`);
  }
});

console.log('\n📊 Test templates generated! Run "npm test" to verify.');