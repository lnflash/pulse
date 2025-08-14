#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface CoverageReport {
  totalFiles: number;
  testedFiles: number;
  untestedFiles: string[];
  coveragePercentage: number;
  moduleBreakdown: Record<string, ModuleCoverage>;
}

interface ModuleCoverage {
  totalFiles: number;
  testedFiles: number;
  percentage: number;
  untestedFiles: string[];
}

class CoverageAnalyzer {
  private srcDir = path.join(__dirname, '..', 'src');
  private excludePatterns = [
    /\.spec\.ts$/,
    /\.test\.ts$/,
    /\.d\.ts$/,
    /\.interface\.ts$/,
    /\.dto\.ts$/,
    /\.constants\.ts$/,
    /\.config\.ts$/,
    /main\.ts$/,
    /\.module\.ts$/,
    /index\.ts$/
  ];

  async analyze(): Promise<CoverageReport> {
    console.log('🔍 Analyzing test coverage...\n');
    
    const allFiles = this.getAllSourceFiles();
    const testFiles = this.getTestFiles();
    const testedFiles = this.getTestedFiles(testFiles);
    
    const report = this.generateReport(allFiles, testedFiles);
    
    this.printReport(report);
    this.generateMarkdownReport(report);
    
    return report;
  }

  private getAllSourceFiles(): string[] {
    const files: string[] = [];
    
    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
          const relativePath = path.relative(this.srcDir, fullPath);
          
          // Check if file should be excluded
          const shouldExclude = this.excludePatterns.some(pattern => 
            pattern.test(entry.name)
          );
          
          if (!shouldExclude) {
            files.push(relativePath);
          }
        }
      }
    };
    
    walk(this.srcDir);
    return files.sort();
  }

  private getTestFiles(): string[] {
    const files: string[] = [];
    
    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          walk(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.spec.ts') || entry.name.endsWith('.test.ts'))) {
          const relativePath = path.relative(this.srcDir, fullPath);
          files.push(relativePath);
        }
      }
    };
    
    walk(this.srcDir);
    return files.sort();
  }

  private getTestedFiles(testFiles: string[]): Set<string> {
    const testedFiles = new Set<string>();
    
    for (const testFile of testFiles) {
      // Get the base name without .spec or .test
      const baseName = testFile
        .replace(/\.spec\.ts$/, '')
        .replace(/\.test\.ts$/, '');
      
      // Check for corresponding source file
      if (fs.existsSync(path.join(this.srcDir, `${baseName}.ts`))) {
        testedFiles.add(`${baseName}.ts`);
      }
      
      // Also check for service files (common pattern)
      const serviceFile = baseName.replace(/\.service$/, '.service.ts');
      if (fs.existsSync(path.join(this.srcDir, serviceFile))) {
        testedFiles.add(serviceFile);
      }
    }
    
    return testedFiles;
  }

  private generateReport(allFiles: string[], testedFiles: Set<string>): CoverageReport {
    const untestedFiles = allFiles.filter(file => !testedFiles.has(file));
    
    // Group by module
    const moduleBreakdown: Record<string, ModuleCoverage> = {};
    
    for (const file of allFiles) {
      const module = this.getModuleName(file);
      
      if (!moduleBreakdown[module]) {
        moduleBreakdown[module] = {
          totalFiles: 0,
          testedFiles: 0,
          percentage: 0,
          untestedFiles: []
        };
      }
      
      moduleBreakdown[module].totalFiles++;
      
      if (testedFiles.has(file)) {
        moduleBreakdown[module].testedFiles++;
      } else {
        moduleBreakdown[module].untestedFiles.push(file);
      }
    }
    
    // Calculate percentages
    for (const module of Object.keys(moduleBreakdown)) {
      const data = moduleBreakdown[module];
      data.percentage = data.totalFiles > 0 
        ? Math.round((data.testedFiles / data.totalFiles) * 100)
        : 0;
    }
    
    const coveragePercentage = allFiles.length > 0
      ? Math.round((testedFiles.size / allFiles.length) * 100)
      : 0;
    
    return {
      totalFiles: allFiles.length,
      testedFiles: testedFiles.size,
      untestedFiles,
      coveragePercentage,
      moduleBreakdown
    };
  }

  private getModuleName(filePath: string): string {
    const parts = filePath.split(path.sep);
    
    if (parts[0] === 'modules' && parts.length > 1) {
      return parts[1];
    }
    
    return parts[0] || 'root';
  }

  private printReport(report: CoverageReport): void {
    console.log('📊 Coverage Summary');
    console.log('==================\n');
    
    console.log(`Total Source Files: ${report.totalFiles}`);
    console.log(`Files with Tests: ${report.testedFiles}`);
    console.log(`Files without Tests: ${report.totalFiles - report.testedFiles}`);
    console.log(`Coverage: ${report.coveragePercentage}%`);
    
    const goal = 80;
    const diff = goal - report.coveragePercentage;
    
    if (diff > 0) {
      const filesNeeded = Math.ceil((diff / 100) * report.totalFiles);
      console.log(`\n🎯 Goal: ${goal}% (need ${filesNeeded} more files tested)`);
    } else {
      console.log(`\n✅ Goal of ${goal}% achieved!`);
    }
    
    console.log('\n📦 Module Breakdown');
    console.log('===================\n');
    
    const sortedModules = Object.entries(report.moduleBreakdown)
      .sort((a, b) => a[1].percentage - b[1].percentage);
    
    for (const [module, data] of sortedModules) {
      const bar = this.generateProgressBar(data.percentage);
      console.log(`${module.padEnd(20)} ${bar} ${data.percentage}% (${data.testedFiles}/${data.totalFiles})`);
    }
    
    console.log('\n❌ Top Priority Files (No Tests)');
    console.log('================================\n');
    
    // Prioritize service files
    const priorityFiles = report.untestedFiles
      .filter(f => f.includes('.service.ts') || f.includes('handler'))
      .slice(0, 10);
    
    priorityFiles.forEach(file => {
      console.log(`  - ${file}`);
    });
    
    if (report.untestedFiles.length > 10) {
      console.log(`  ... and ${report.untestedFiles.length - 10} more files`);
    }
  }

  private generateProgressBar(percentage: number): string {
    const width = 20;
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    
    if (percentage >= 80) {
      return `[${bar}]`;
    } else if (percentage >= 60) {
      return `[${bar}]`;
    } else if (percentage >= 40) {
      return `[${bar}]`;
    } else {
      return `[${bar}]`;
    }
  }

  private generateMarkdownReport(report: CoverageReport): void {
    const outputPath = path.join(__dirname, '..', 'docs', 'COVERAGE_REPORT.md');
    
    let markdown = '# Test Coverage Report\n\n';
    markdown += `Generated: ${new Date().toISOString()}\n\n`;
    
    markdown += '## Summary\n\n';
    markdown += `- **Total Source Files**: ${report.totalFiles}\n`;
    markdown += `- **Files with Tests**: ${report.testedFiles}\n`;
    markdown += `- **Coverage**: ${report.coveragePercentage}%\n`;
    markdown += `- **Goal**: 80%\n\n`;
    
    markdown += '## Module Coverage\n\n';
    markdown += '| Module | Coverage | Files Tested | Total Files |\n';
    markdown += '|--------|----------|--------------|-------------|\n';
    
    const sortedModules = Object.entries(report.moduleBreakdown)
      .sort((a, b) => b[1].percentage - a[1].percentage);
    
    for (const [module, data] of sortedModules) {
      const emoji = data.percentage >= 80 ? '✅' : data.percentage >= 60 ? '⚠️' : '❌';
      markdown += `| ${emoji} ${module} | ${data.percentage}% | ${data.testedFiles} | ${data.totalFiles} |\n`;
    }
    
    markdown += '\n## Files Needing Tests\n\n';
    markdown += '### High Priority (Services & Handlers)\n\n';
    
    const priorityFiles = report.untestedFiles
      .filter(f => f.includes('.service.ts') || f.includes('handler'));
    
    priorityFiles.forEach(file => {
      markdown += `- [ ] ${file}\n`;
    });
    
    markdown += '\n### Other Files\n\n';
    
    const otherFiles = report.untestedFiles
      .filter(f => !f.includes('.service.ts') && !f.includes('handler'))
      .slice(0, 20);
    
    otherFiles.forEach(file => {
      markdown += `- [ ] ${file}\n`;
    });
    
    if (!fs.existsSync(path.dirname(outputPath))) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    }
    
    fs.writeFileSync(outputPath, markdown);
    console.log(`\n📄 Detailed report saved to: ${outputPath}`);
  }
}

// Run the analyzer
const analyzer = new CoverageAnalyzer();
analyzer.analyze().then(report => {
  if (report.coveragePercentage < 80) {
    console.log('\n⚠️  Coverage is below 80% target');
    process.exit(1);
  } else {
    console.log('\n✅ Coverage target achieved!');
    process.exit(0);
  }
}).catch(error => {
  console.error('Error analyzing coverage:', error);
  process.exit(1);
});